# Speed

What Centauri costs, measured on one machine (Intel Core i7-4720HQ, 4 cores and 8 threads, Linux 7.2), beside the same
answers served by std/http alone, on 2026-11-25. Each figure is the median of n runs, alternated with the other case,
with its 95 % interval between brackets (the 6th and 16th of 21 sorted runs, with no assumption on their law); other
jobs ran on the machine, and the load average is given. Two Cesia binaries: the one of Cesia's main branch, and the
branch `httpfix`, which finds a route in a tree of its parts and makes BLAKE2b, the comparison in constant time and hex
natives of OCaml (not yet merged). The measures are in `bench/`.

## Starting

From the command to the first 200, then the resident memory 1 s later, idle (21 runs each, load 4.6 to 6.8):

| server | first answer | memory at rest |
|---|---:|---:|
| std/http, the engine of Cepheus loaded, libsodium opened | 27.4 ms [26.3, 29.8] | 21.3 MB [21.3, 21.4] |
| Centauri (its accounts and one route; settings read, state, keys, routes) | 34.7 ms [33.4, 37.7] | 30.5 MB [30.4, 30.6] |

Centauri adds 7.3 ms and 9 MB to a start. With a real Cepheus server, connecting and declaring the kinds of the
invoices and their two rules, the invoices answered after 62 ms (one start, its data on an SSD, its code on a disk).

## A request, in the program

The mean of 2,000 calls of the app's handler, without the network (21 rounds, load 2.8 to 7.4), the profile prod:

| answer | std/http, main | Centauri, main | std/http, httpfix | Centauri, httpfix |
|---|---:|---:|---:|---:|
| a JSON of one field, public | 3.0 µs [2.9, 3.2] | 55.0 µs [51.9, 56.9] | 3.0 [2.8, 3.2] | 39.0 [38.1, 44.6] |
| a thing by its id, signed in (`app.Own`) | 5.9 [5.7, 6.2] | 127 [120, 133] | 5.6 [5.4, 6.1] | 76.7 [74.8, 79.2] |
| a page of 20 things, signed in | 56.7 [54.3, 59.1] | 303 [280, 331] | 55.1 [54.2, 60.1] | 239 [228, 247] |

Where the 36 µs of a public request go with httpfix (each step alone, the mean of 5,000 calls): the door (number of
the request, address, site, headers of security, the line kept for the administration) about 7 µs; the route among
Centauri's 45, 2.0 µs in the tree (4.6 µs in main's list); the limits, one round trip to the state of the process,
2.1 µs; the output through its shape 1.2 µs; the metrics 0.9 µs; the rest the request's record, the database of a GET
and std/http's own handling. A signed request adds the session, about 23 µs (three reads of 1.1 µs, the hash and the
comparison, the user's record); with main's binary the hash and the comparison pass through Cesia's C layer and cost
10 µs more. A page adds the sealing of its cursor (12 µs, through the same layer) and the shape of its 20 rows.

## Under load

/hello, a JSON of one field, public; 256 kept connections, 4 threads; the servers on 4 threads (two cores), the load
on the 4 others; 2 s a measure after 1 s of warming (21 rounds main, 11 httpfix; load 4.9 to 6.8):

| server | requests/s | p99 | memory |
|---|---:|---:|---:|
| std/http, main | 21,665 [14,911, 24,223] | 24.0 ms | 45.4 MB |
| Centauri, main | 7,954 [6,767, 8,735] | 51.7 ms | 48.7 MB |
| std/http, httpfix | 26,287 [19,858, 28,891] | 16.2 ms | 42.3 MB |
| Centauri, httpfix | 10,276 [8,470, 10,800] | 37.1 ms | 47.0 MB |

No request failed. The memory stays flat over a minute of load (43 to 48 MB).

## What it says

- Starting stays instant: 7 ms over std/http and Cepheus, against 3.4 s for Spring Boot 4 on this machine (the
  measure of Centauri's design, the same machine).
- A request costs Centauri 36 µs (public) to 71 µs (signed in) over std/http with httpfix: within a request that reads
  a page of Cepheus (55 µs alone), it doubles or so; on a bare JSON it divides the throughput by 2.6. Centauri's own
  budget was 5 µs: not met. The steps above say where the time goes; the next work is natives for the state of the
  process (the limits and the log line without a round trip), the headers in one native, and the session's reads
  folded into one.
- Nothing else here is compared with the giants: the first app of Centauri will be measured whole, as the invoices of
  Cepheus's book were, before a claim.
