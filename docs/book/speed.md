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
- What would take it further needs Cesia: a table of the process shared without a fiber, for the limits and the
  sessions (the round trip, 6 µs of the 18), and `encode.Base64` as a native (a cursor's 24 µs), both in its core, which
  is at its ceiling of lines.
