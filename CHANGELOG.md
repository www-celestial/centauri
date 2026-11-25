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
