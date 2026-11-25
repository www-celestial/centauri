# Changelog

## 0.2.0 (not released)

The second batch, L2: what an app of management asks in its first month. Nothing of 0.1 changes: every app of 0.1
runs as it did (the module of the accounts brings the module of the jobs along, and every new setting has the default
of 0.1's behaviour); the request of 0.1 costs the same (Speed).

- `jobs`: durable background jobs on Cepheus (`Kind`, `Later` in the group of the write, `Stop`), taken once by a
  group that expects them ready, leased and renewed, tried again after a full jitter, dead after their tries and
  retried (`Retry`, `api.AdminJobs`, `api.AdminJobRetry`), taken back from a process that died; workers woken by a
  `cepheus.Watch`; schedules (`Every`) of cron on the clock of a zone read from tzdata (summer time included), one run
  a slot across servers by a unique key; `Module`; in tests `t.RunJobs()`, `t.Jobs()`.
- `mail`: `Send` and `Later`, by `smtps://`, `smtp://` with STARTTLS required, `postmark://`, `file://`, `log:`,
  `test:` (`APP_MAIL_URL`); every header checked; refused for good or for later; in tests `t.Mails()`.
- `auth`: addresses checked by the link of a mail (`APP_EMAIL_CHECK` off, required, later), forgotten passwords
  (`Forgot`, `Reset`), the neutral answer of a sign-up (`APP_SIGN_UP_ANSWER`), codes kept as their hash, serving
  once, `APP_MAILS_PER_HOUR`; `Checked` in the account; `auth.Ends`, the end of a session's screens.
- `app`: files (`Files`, `Store`, `Download` with `Range`, `Raw`), `api.Upload` served with the body in pieces and
  its type by its first bytes; live screens (`Live`) at `/live` with the session, the rights and the endpoints as
  actions; migrations (`Migration`, `Fill`, `Migrate`, and `Rename`, `Retype`, `Drop` that say A2 is needed);
  `Call` with its deadline, retries and its checks of addresses (`Private`); `Idempotency-Key` at the door;
  `Module` takes `jobs`, `verify`, `migrations`, `ends`.
- `hooks`: Standard Webhooks sent (`Add`, `Later`, signed, tried again, 410 turns an endpoint off) and received
  (`Verify`, the id kept in the group of what it does), `Sign`, `Module`.
- `apptest`: modules verified and migrations run at the start; `t.SignUp` follows the link of the mail; `t.Code`,
  `Drained`.
- The book: tutorials 6 to 11, with Spring Boot beside; Security, Settings and Speed for L2. The invoices of the
  example in their first month (`examples/invoices/tests/month.test.ce`).

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
