# Changelog

## 0.1.0 (not released)

The first batch, L1.

- `api`: endpoints as values (`Get`, `Post`, `Put`, `Patch`, `Delete`, `Upload`, `Live`), pages by a cursor
  (`Page`), file answers (`File`), OpenAPI 3.2 made from them (`OpenApi`); Centauri's own contracts, those of the
  accounts (`Accounts`) and of the administration (`AdminOfApp`, `AdminOfAccounts`).
- `app`: modules and routes as records (`Module`, `Serve`, `Of`), `Run`, settings from `APP_*` with three profiles,
  errors as Problem Details (`Fail`, `Missing`), limits per address, user, tenant and endpoint (GCRA), the guards of
  origin (CSRF), CORS and the headers of security, a GET that only reads, sealed cursors, `Own`, `Next`, `Retry`,
  `Facts`, `Gone`, events of the history (`Note`), health, metrics, the app's administration.
- `auth`: accounts with Argon2id, sessions as a token cut in two in `__Host-sid`, tenants many or one, sign-up open,
  by invitation or closed, members and roles, signing out everywhere, lockouts that double, proof of work under attack,
  a trap field for bots, a cap on new tenants an hour, the accounts' administration, `Admin` for the first super-admin.
- `apptest`: apps in memory on a fork (`Start`), clients that sign up and call, and three tests made for any app:
  `Isolated`, `Fuzz`, `Surface`.
- The book: seven chapters, five of them tutorials with Spring Boot beside; `examples/invoices`, Cepheus's invoices
  rewritten on Centauri.

The cost of a request, after L1 (the measures in the book's chapter Speed):

- One round trip to the state of the process a request, for its session and all its limits; each process keeps the
  sessions it read for `APP_SESSION_CACHE` seconds (2 by default, 0 for none), under the BLAKE2b of their cookie, and a
  write of a signed-in user through the routes of the accounts forgets them at once; `r.User.Until`, the end of the
  session unless it is seen again. A request refused by its role now counts in the limits too.
- The output of each endpoint, its page size, its status and the labels of its metric made once at the start; the
  headers of security of a JSON answer made once; the request at the door made at once, its log line sent as it is.
- A cursor seals its row alone, under a key for its endpoint and tenant; a cursor of before still reads.
- `bench/micro.ce` measures std/http with Centauri's question of a page too.
