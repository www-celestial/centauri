# Speed

What Centauri costs, measured on one machine (Intel Core i7-4720HQ, 4 cores and 8 threads, Linux 7.2) on 2026-11-25,
beside the same answers served by std/http alone, and beside Go and Spring Boot under load. Each figure is the median of
21 runs, alternated with the others, with the smallest and the largest between brackets; other jobs ran on the machine,
and the load average is given. "Before" is Centauri as its first batch wrote it, "now" after the work on the cost of a
request, both on Cesia's main binary; "now" with a page also takes the faster `encode.Base64` of Cesia's branch
`centauri-cost`. The measures are in `bench/`.

## Starting

From the command to the first 200, then the resident memory 1 s later, idle (21 runs each, load 1.4 to 4.8):

| server | first answer | memory at rest |
|---|---:|---:|
| std/http, the engine of Cepheus loaded, libsodium opened | 26.6 ms [25.6, 51.9] | 21 MB [19, 21] |
| Centauri before (its accounts and one route; settings read, state, keys, routes) | 33.2 ms [31.7, 41.6] | 30 MB [28, 30] |
| Centauri now | 33.9 ms [32.4, 72.5] | 32 MB [30, 32] |

Centauri adds 7.3 ms to a start, within its budget of 10 ms; before and now differ by less than their spread. Memory
at rest is 2 MB more after the first request, as the heap takes its next step one request sooner: after 1,000 requests
both hold 35 MB.

## A request, in the program

The mean of 2,000 calls of the app's handler, without the network, the profile prod (21 rounds, load 3.1 to 3.9):

| answer | std/http | Centauri before | Centauri now |
|---|---:|---:|---:|
| a JSON of one field, public | 3.5 µs [3.3, 6.4] | 41.6 µs [39.9, 48.6] | 21.5 µs [20.2, 49.8] |
| a thing by its id, signed in (`app.Own`) | 6.0 [5.3, 11.1] | 77.0 [75.4, 97.9] | 40.2 [38.1, 82.4] |
| a page of 20 things, signed in | 56.8 [53.4, 66.4] | 255 [246, 414] | 150 [143, 170] |

std/http asks its page of all the notes; asked as Centauri's handler asks it, the notes of one tenant, it takes 58.0 µs
[55.0, 91.6]. What Centauri adds to a request went from 38 to 18 µs (public), from 71 to 34 µs (signed in), from 198
to 92 µs (a page). Each request allocates half as much: 1,557 words of memory where it took 3,172 (public; std/http
alone 571), 1,975 where it took 5,213 (signed in), 16,618 where it took 25,502 (a page). What changed:

- **One round trip to the state of the process.** The state is a fiber, since no function of Cesia changes a variable of
  its module; a request asks it once, for its session and all its limits (address, user, tenant, endpoint), where it
  asked for its limits and read its session apart. The state keeps the sessions it read for `APP_SESSION_CACHE`
  seconds, 2 by default ([Signing up](sign-up.md#3-sessions) says what that changes, and its tests): a signed-in
  request reads nothing from the database. Before, reading the session took about 27 µs of a request.
- **What each endpoint needs, made once at the start**: the function of its output's shape, its page size, its status,
  the labels of its metric, the headers of security of a JSON answer. A row that fits its shape goes out as it is.
- **No field added to a copy.** Adding three fields to the request at the door took 171 words, a record made at once
  takes 20: the door makes the routed request whole, with the two fields that std/http's routes give it.
- **A cursor seals its row alone**, under a key of the app's for its endpoint and tenant, a third shorter; Cesia's
  `encode.Base64` writes its digits as numbers and its text by one call: 24 µs for 125 bytes instead of 56.

## Where the time goes now

Each piece taken out of the request in turn, the whole request measured (public, 21.0 µs in that run), and the words of
memory it allocated:

| piece | µs | words |
|---|---:|---:|
| the round trip to the state (session and limits) | 6.3 | 462 |
| the line of the log the administration keeps | 3.1 | 210 |
| the metric `centauri_requests_total{route,status}` | 2.1 | 111 |
| the site of the request (Origin, Sec-Fetch-Site) | 1.7 | 11 |
| the output through its shape | 1.6 | 26 |
| the rest: the number of the request, its address, its record for the handler, its role, the routes | about 3 | |

A piece costs a request two or three times what it costs alone in a loop: in a request, the interpreter's code and data
leave the processor's caches between pieces. A round trip to the state costs two switches of fiber, about 230 words,
even when the state has nothing to do. A page adds its sealed cursor, about 47 µs: Base64 in Cesia, 24 µs, and the seal
of libsodium through Cesia's layer of C, 10 µs.

## Under load

/hello, a JSON of one field, public (Spring Boot's /json, the same); 256 kept connections, 4 threads; the servers on 4
threads (two cores), the load on the 4 others; 2 s a measure after 1 s of warming, the five servers in turn (21 rounds,
load 3.1 to 8.1); the processor each takes, measured apart over 5 s:

| server | requests/s | p99 | memory | processor |
|---|---:|---:|---:|---:|
| std/http | 27,928 [19,811, 30,559] | 16.0 ms | 40 MB | 0.9 cores |
| Centauri before | 10,631 [8,690, 11,429] | 36.0 ms | 45 MB | |
| Centauri now | 13,444 [11,115, 14,302] | 27.1 ms | 46 MB | 0.95 cores |
| Go 1.26 net/http | 84,159 [61,723, 95,465] | 13.0 ms | 18 MB | 2.9 cores |
| Spring Boot 4.0.5 (Tomcat, virtual threads, Java 21) | 60,252 [14,612, 65,816] | 7.3 ms | 509 MB | 3.2 cores |

No request failed. A Cesia server runs on one domain, one core; Go and Spring Boot take three. By core, std/http serves
as many as Go (32,000 requests a second), Spring Boot 17,000 and Centauri 15,000. Under load Centauri adds 35 µs of
processor to a request, where it adds 18 in the program: with 256 requests in flight, each keeps its data while it
waits for the state, and the collector, about an eighth of the server's time in a sampled profile, moves and marks more
of it.

## The state without a message: Cesia's tables

Centauri's state was a fiber, which each request asked by a message: a round trip of two switches of fiber for its
session and its limits. Its limits, the sessions it keeps and the values it remembers now live in tables of
`std/fiber` (Cesia's branch `natives`), which a request reads and counts in place: `fiber.Recall` for its session,
`fiber.Admit` for its limits, GCRA as before, all of them or none. The same limits, the same bounds (past `keys`, those
whose time passed go, then those due soonest), and a session read from the database before a sign-out is still kept
out (`isSessionReadBeforeAForgetKeptOut`); a session the state keeps holds its user's limits, made once. The fiber
keeps the rest: the log's last lines, the slots of the hashes, the events already written. The same Cesia binary also
writes `encode.Base64` natively, and runs the slow calls of the hashes on a pool of domains.

`bench/micro.ce`, 21 runs alternated between Centauri's main (92151da on Cesia's main) and this (on Cesia's branch
`natives`), 2026-11-26, load 3.6 to 6.4, medians in µs with their [min, max]:

| request | main | tables |
|---|---:|---:|
| Centauri, public, a JSON of one field | 24.94 [22.60, 48.83] | 22.45 [20.02, 38.97] |
| Centauri, signed in, a thing by its id (`app.Own`) | 44.76 [41.05, 100.77] | 37.98 [35.10, 59.04] |
| Centauri, signed in, a page of 20 things | 157.79 [143.75, 376.58] | 142.07 [126.65, 305.04] |
| std/http, a JSON of one field | 3.59 [3.34, 108.97] | 3.52 [3.28, 44.69] |

The door alone, the state's of main beside the new one in one program, 20,000 calls a run, 21 runs (load 6.4 to 6.9):
public 3.30 µs [1.94, 16.25] then 2.04 [1.22, 4.04]; signed in 4.42 [3.11, 12.98] then 2.61 [1.60, 11.94]. In a request
it is worth two or three times that, as the fiber's switches also take the interpreter's caches: 6.8 µs of a signed-in
request. A page also gains its cursor's Base64, 26.8 µs [23.8, 51.8] by Cesia's loop, 2.1 [1.8, 4.9] native. A sign-in
by password (Argon2id, 64 MiB, 10 a run, 21 runs, load 7.0 to 7.6) takes 86.3 ms [80.7, 163.1] instead of 93.0 [81.7,
124.1]: the hash is the whole of it. A start to the first 200 of `bench/serve.ce`, 51.8 ms [49.6, 100.9] instead of
59.2 [55.1, 134.3] (load 2.4 to 4.3), 31 MB at rest instead of 33: the ranges overlap.

Under load, /hello as above (256 kept connections, 4 threads; the servers on cores 0, 1, 4, 5, the load on the 4
others; 2 s a measure after 1 s of warming, the four servers in turn, 21 rounds; load 6.1 to 11.2, other jobs ran):

| server | requests/s | p99 | memory |
|---|---:|---:|---:|
| std/http | 23,124 [12,186, 30,214] | 19.5 ms | 44 MB |
| Centauri, main | 10,661 [3,655, 13,597] | 41.1 ms | 58 MB |
| Centauri, tables | 11,327 [1,565, 12,698] | 34.8 ms | 47 MB |
| Go 1.26 net/http | 61,819 [17,369, 90,961] | 19.8 ms | 21 MB |

No request failed. The ranges overlap: under load, what a request saves in the program is small beside its share of
the collector. What the tables change there is the memory: 256 requests in flight no longer wait in the state's
channel, each with its message and its answer, 11 MB less.

## The first month: what L2 adds, and what its pieces cost

L2 must not make a request of L1 slower. Measured as L1 was, `bench/micro.ce` in the program, 21 runs alternated
between Centauri's main (0.1, f4b845d, on Cesia's main) and L2 (on Cesia with the bodies in pieces), on cores 0, 1, 4,
5 (2026-11-26, load 2.8 to 4.0), medians in µs with their [min, max]:

| request | main | L2 |
|---|---:|---:|
| std/http alone, a JSON of one field | 3.47 [3.33, 6.33] | 3.64 [3.44, 6.34] |
| Centauri, public, a JSON of one field | 21.25 [20.55, 38.16] | 21.65 [21.15, 41.57] |
| Centauri, signed in, a thing by its id (`app.Own`) | 39.02 [37.00, 55.03] | 39.65 [38.74, 56.19] |
| Centauri, signed in, a page of 20 things | 143.37 [140.21, 221.00] | 145.36 [140.95, 183.80] |

The ranges overlap everywhere; the medians differ by 1.4 to 1.9 % for Centauri, and by 5 % for std/http alone, which L2
doesn't change: the difference is that of the two builds of Cesia, not of L2's door. What L2 adds to a request of L1:
for a request that changes something, one look for an `Idempotency-Key` header; for every request, two tests of a
flag (an upload, a stream).

What the new pieces cost, in the program, 21 runs, the mean of 500 calls a run (`bench/month.ce`, 2026-11-26, load
2.5 to 2.8), medians [min, max]:

| piece | cost |
|---|---:|
| a job written in a group, taken, run (nothing), finished, on a fork | 93.1 µs [91.3, 169.7] |
| a mail made (1 KB of text: its headers checked, its text in base64) | 343 µs [335, 397] |
| a webhook signed (HMAC-SHA256 of 80 bytes) | 15.7 µs [15.4, 23.3] |
| an address checked against the special blocks (SSRF) | 21.9 µs [21.4, 24.3] |
| the next slot of a schedule of cron in Paris | 10.4 µs [9.7, 11.5] |
| a `POST`, without a key / with a new `Idempotency-Key` / with a key seen | 94.8 [92.7, 128.9] / 198 [194, 306] / 52.6 [51.3, 84.1] µs |
| a write seen by a live page through a WebSocket, median of 20 writes | 0.12 ms [0.11, 0.12] |
| a file of 10 MiB stored by parts, on a fork | 270 MB/s [238, 278] |

On a real Cepheus server on this machine's SSD, 21 runs (load 1.3 to 2.9): 10 MiB of random bytes uploaded and stored
in 274 ms [210, 2986] (38 MB/s), read back in 51 ms [46, 56] (207 MB/s), a range of 64 KiB in its middle in 0.9 ms
[0.9, 1.1]. A job on a server costs, beside its CPU above, its three groups (written with its write, taken, finished),
each forced to the disk: of the order of the 7,021 groups a second [1,799, 8,604] that 64 fibers write through one
connection (measured by Cepheus), so a few thousand jobs a second a database, where an app of management asks tens.

Where it is slow, and why: a mail is made in 343 µs, most of it base64 written in Cesia (a loop of the interpreter: 2.4
times faster since Cesia's last change, still 0.2 µs a byte); a job's CPU is its two writes and its arguments read
back through their shape. Neither is on the path of a request. What was not measured against the giants: Spring
Boot's `@Scheduled` with ShedLock, its JavaMailSender, its multipart uploads to S3, its STOMP with a broker; the
numbers above are Centauri's alone.

## The first quarter: what L3 adds, and what its pieces cost

L3 must not make a request of L1 slower. Measured as before, `bench/micro.ce` in the program, 21 runs alternated
between Centauri's main (0.3, fd982a9) and L3, both on the same build of Cesia (its branch of L3, so that only Centauri
differs), on cores 0, 1, 4, 5 (2026-11-26, load 2.4 to 2.7), medians in µs with their [min, max]:

| request | main | L3 |
|---|---:|---:|
| Centauri, public, a JSON of one field | 22.85 [21.06, 26.76] | 23.41 [22.69, 30.24] |
| Centauri, signed in, a thing by its id (`app.Own`) | 41.23 [39.47, 60.99] | 42.35 [41.12, 45.35] |
| Centauri, signed in, a page of 20 things | 145.91 [142.00, 158.99] | 148.74 [144.85, 174.57] |

The ranges overlap; the medians are 0.6 to 2.8 µs (1.9 to 2.7 %) above main's. What L3 adds to every request: the
door reads `Origin`, `Sec-Fetch-Site` and `Authorization` in one pass over the headers (L1 read the first two in two);
a request without a cookie of a session looks for a key of a program; the history's `why` names the key of a program
when there is one. A first version of L3 cost 3.7 µs more: its record `env`, which every request reads many times, had
grown past 32 fields, where a dictionary of Cesia leaves its one block of keys for a table; the words of the
languages went into one field of it (`env.Words`), and an app that speaks English alone tests nothing of them at a
request (its door is chosen when the app starts).

What the new pieces cost, in the program, 21 runs, the mean of 2,000 calls a run (20 for the sign-ins), on a fork of
Cepheus (`bench/l3.ce`, 2026-11-26, load 1.6 to 2.3), medians [min, max]:

| piece | cost |
|---|---:|
| a thing by its id, with a cookie / with a key of a program (`Authorization: Bearer`) | 47.8 [46.3, 70.4] / 48.2 [46.6, 53.4] µs |
| an error of a field (422), in English / in French (its Problem Details read again and translated) | 96.9 [93.9, 98.5] / 121.0 [117.3, 162.9] µs |
| `i18n.Say` of a message of std/check, read against Centauri's French templates | 7.6 [7.0, 14.3] µs |
| `flags.On`, the table of the flags in the memory of the process | 3.45 [3.24, 6.61] µs |
| a sign-in by password (Argon2id, 64 MiB) | 60.9 [60.2, 63.8] ms |
| a sign-in by password, then the code of the app (TOTP, the second step) | 61.8 [61.1, 68.8] ms |
| a sign-in by passkey: the options, the device's answer (its ES256 signature made in the same program), the check | 1.02 [0.98, 1.56] ms |
| a sign-in by a provider of OpenID Connect on this machine, over https: start, the code at its token endpoint, the ID token checked, a session | 4.57 [4.43, 5.30] ms |

What it says: a key of a program costs a request what a cookie does (both are a read by an id, a hash, a comparison);
a second factor adds under a millisecond to a sign-in that Argon2id makes 60 ms long; a passkey signs in in a
millisecond, sixty times faster than a password, since nothing is hashed slowly: the device's signature is checked
(ES256 by OpenSSL, 145 µs of it). The sign-in by a provider is most of all the round trip to its token endpoint, here
on this machine with a TLS handshake each time; across the Internet it adds the provider's own time and the round
trips to it, not measured here. A translated error costs 24 µs more: errors only, and only in an app of several languages. Not measured beside
the giants: Spring Security's `oauth2Login()`, its `webAuthn()` and its one-time tokens; the signatures beside Node's
are in Cesia's book (Cryptography): RS256 76 µs where Node takes 64 µs with a key read each time and 37 with a key
parsed once.

## The admin pages in a browser

The pages of [the admin](admin.md), compiled from Cesia to WebAssembly, measured in chrome-headless-shell 153 (WebGL
by SwiftShader, on the processor) and Firefox 160, without a window, 1280 by 900, on this machine (an 8-thread
laptop, other jobs running: load 3 to 9). The app is the invoices of `cesia do admin-serve` with 100,005 clients
(`ROWS=100000`), on a database in memory, served on 127.0.0.1 with the brotli files. A frame's work is the time from the
browser calling the page to its frame painted (`Stats()` of `ceres.js`), not the wait before it, which in headless
Chrome is SwiftShader's.

| | Chrome | Firefox |
|---|---|---|
| the files of the pages | `page.wasm` 521,406 B, 134,330 brotli; `page.js` 4,123, `ceres.js` 6,089, `admin.js` 162 brotli: 145 KB in all, once; then a `304` each | the same |
| first paint of the sign-in (21 runs) | 131 ms [111, 169] | 118 ms [89, 1,025 cold] |
| sign-in to the dashboard showing its counts: Argon2id, the page loaded again, its screen opened (21) | 361 ms [278, 439] | 360 ms [328, 426] |
| first paint of the dashboard, once signed in (21) | 104 ms [91, 153] | 98 ms [91, 115] |
| work of a frame while the wheel scrolls a table of 100,005 rows, p50 / p99 (3 and 2 runs of 120 notches) | 3.7 to 4.8 / 10.7 to 13 ms | 3 / 7 to 15 ms |
| the 100,005 rows sorted by a click on a title | one frame, 11.3 ms | one frame, 10 to 14 ms |
| the 100,005 rows read (All: 2,001 pages of 50 through the live screen) | 112 to 121 s | 104 to 121 s |

The table draws only the rows in sight, so 100,005 rows scroll as 50 do. Reading them all is slow because of the
server: `GET /admin/data/:kind` takes 35 to 46 ms a page on a kind of 100,000 things, where it takes 1.2 ms on a kind
of 30 (Cepheus walks the kind's facts to find the page after a cursor; a range on a thing's id, which would seek, is
refused: `Above` is for numbers, dates and money). The page waits for the next frame between two pages, about 16 ms.

Beside, Django 6.1.3's admin over the same 100,005 clients (SQLite, `runserver`, 21 runs; Firefox's measured while
another job ran a benchmark):

| | Django, Chrome | Django, Firefox | the admin pages |
|---|---|---|---|
| the sign-in page | 56,121 B in 8 files (11,297 brotli), loaded in 114 ms [103, 458] | 49 ms [42, 92] | 145 KB once, first paint 131 / 118 ms |
| sign-in to the first page (PBKDF2 of 1,500,000 rounds) | 1,043 ms [946, 2,215] | 1,013 ms [944, 1,285] | 361 / 360 ms |
| the list of clients, 100 a page | 771,289 B in 21 files (151,170 brotli: jQuery, XRegExp), loaded in 195 ms [187, 1,567] | 187 ms [155, 240] | a page of 50 through the screen in 35 to 46 ms; no file loaded again |
| all of them | refused past 200 (`list_max_show_all`) | | 100,005 in one table, 4 ms a frame |

Django wins where a page is plain HTML: its sign-in page is 11 KB and paints without compiling a module, and it works
without JavaScript. The admin pages win once loaded: 145 KB for every page (a page of Django's list costs more in its
own HTML and statics than all of them), every page after the first without a file, a dashboard pushed each second
without polling, a table of 100,000 rows that scrolls and sorts in a frame.

## What it says

- Starting stays instant: 7 ms over std/http and Cepheus, against 3.4 s for Spring Boot 4 on this machine (the
  measure of Centauri's design).
- A request costs Centauri 18 µs (public) to 34 µs (signed in) over std/http, half what it cost; Centauri's own budget
  is 5 µs: not met. What loses, and why: the state is a fiber, and a round trip to it is two switches of fiber, most of
  its 6 µs; each piece of Centauri's door is interpreted, Cesia's machine code making only the functions whose result
  is a number; a metric with labels makes its key again at each call.
- Under load, Centauri serves half of what std/http serves, a sixth of Go and a fifth of Spring Boot; by core, it is
  near Spring Boot, which takes eleven times its memory. Go and std/http win by having nothing between the route and its
  answer; Spring Boot by its JIT, which compiles every layer, and by using three cores where Cesia uses one
  (`cesia run --workers 4` serves a port with four processes, not measured here).
- L3 (keys of programs, second factors, passkeys, providers, languages, flags) costs a request of L1 1.9 to 2.7 %
  (0.6 to 2.8 µs), within the noise of the ranges; a key of a program costs what a cookie does, a passkey signs in
  sixty times faster than a password.
- Cesia's tables took the round trip to the state out of each request (a signed-in one 6.8 µs faster), and its native
  Base64 a page's 25 µs ([The state without a message](#the-state-without-a-message-cesias-tables)). What is left of
  Centauri's door is interpreted Cesia: the log line, the metric, the output's shape.
