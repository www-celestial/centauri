# Centauri

Centauri is the backend framework of [Cesia](https://github.com/www-celestial/cesia-lang), on the database
[Cepheus](https://github.com/www-celestial/cepheus): typed APIs, accounts, tenants and roles, defenses against bots and
password guessing, an administration of the whole platform, and tests of a whole app in memory, written with functions
and records. No class, no annotation, no container of dependencies: what a handler uses comes in its request.

**Documentation: https://www-celestial.github.io/centauri/**

The family: [Cesia](https://www-celestial.github.io/cesia-lang/) (the language) · [Cemacs](https://www-celestial.github.io/cemacs/) (the editor) ·
[Cepheus](https://www-celestial.github.io/cepheus/) (the database) · [Ceti](https://www-celestial.github.io/ceti/) (the browser driver) ·
[Centauri](https://www-celestial.github.io/centauri/) (the backend).

```cesia norun
(* src/notes/endpoints/endpoints.ce: the contract, read by the server and by the pages *)
use deps/www-celestial/centauri/src/api
use std/check

Note = check.Record({Id: check.Id(), Text: check.Text()})
Add = api.Post("/notes", body = check.Record({Text: check.Text(1, 500)}), out = Note, role = "member")

(* src/notes/notes.ce: the kind, the handler, the module *)
use deps/www-celestial/cepheus/cesia/cepheus
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/auth
use src/notes/endpoints as e

Kind = app.Kind("note", {Tenant: cepheus.Link(), Text: cepheus.Text()})

defn add(r, x)
  made = cepheus.Insert(Kind, {Tenant: r.User.Tenant, Text: x.Text}, r.Db, by = r.User.Id, why = r.Why)?
  app.Own(Kind, made, r)
end

App = app.Of([auth.Module(), app.Module("notes", kinds = [Kind], serve = [app.Serve(e.Add, add)])])

(* src/main.ce *)
app.Run(App)
```

That is a whole server ([`examples/notes`](examples/notes), with its tests): `POST /notes` takes a JSON body checked
by its shape (422 with each wrong field), answers 401 without a session and 403 without the role, writes in the tenant
of who asks, records who wrote and why, and sends back only the fields of `Note`. Beside it come signing up and in, sessions, members, invitations, the administration
endpoints and `/openapi.json` in dev.

## What it gives

- **Contracts**: endpoints as values (`api.Get`, `api.Post`...), their shapes from `std/check`, read by the server and
  by the pages (one definition, two sides); OpenAPI 3.2 made from them; errors as one Cesia value, sent as Problem
  Details (RFC 9457); pages by a sealed cursor, never by an offset.
- **Accounts**: passwords hashed with Argon2id, sessions as a token cut in two in a `__Host-sid` cookie (HttpOnly,
  Secure, SameSite=Strict), tenants many or one (`APP_TENANCY`), sign-up open, by invitation or closed (`APP_SIGN_UP`),
  roles that include roles, nobody giving a role he hasn't.
- **Defenses**: limits per address, user, tenant and endpoint (GCRA); a delay that doubles after failed sign-ins;
  proof of work when under attack; a trap field for bots; a cap on new tenants an hour; refusal of requests from other
  sites (CSRF), CORS for named partners; security headers on every response; a GET that only reads; every write with
  who and why in Cepheus's history, every sign-in, failure and refusal an event.
- **Administration**: the endpoints of the super-admin (users, tenants, roles, sessions, events, logs, metrics,
  settings, kinds and their things, jobs), and its pages in the browser (`admin`), written in Cesia with Ceres and
  compiled to WebAssembly: a live dashboard (requests, failures, p50 and p99, refusals and failed sign-ins, jobs), the
  users and tenants with their roles changed in place, events and log by filter or live, jobs and webhooks run again,
  files, settings, the data of every kind changed through its checks, the audit trail; an app adds its own pages,
  columns and actions with `pages.Page`, `Kind`, `Column` and `Action`. No new way in: the pages call the endpoints of
  the role super through the same door as any client.
- **Settings**: `APP_*` variables read once through a shape; three profiles, dev, test and prod; health and metrics.
- **Tests**: `apptest.Start` runs an app in memory on a fork of the database; `apptest.Isolated` proves on every
  endpoint that no tenant reads another's data, `apptest.Fuzz` that no broken input makes a 500, `apptest.Surface` that
  no change breaks a client.
- **Background jobs** (`jobs`): written in the group of the write that asks for them, taken once, tried again after a
  backoff, dead and retried by hand; schedules of cron on the clock of a real zone, one run a slot across servers.
- **Mail** (`mail`): SMTP over TLS or STARTTLS only, Postmark, files and the log in dev, a box in tests; addresses
  checked by the link of a mail, forgotten passwords, a sign-up that answers the same for every address.
- **Files**: uploads read as they come, their type by their first bytes, kept in Cepheus's vault by parts, read by
  ranges.
- **Live screens**: `std/live` at `/live` with the session and the rights, each show a `cepheus.Watch` (no broker), the
  endpoints as actions.
- **Webhooks** (`hooks`) as Standard Webhooks, sent and received; `app.Call` that never reaches the app's own network
  (SSRF); `Idempotency-Key`; migrations run once.

## Status

Version 0.3, the first two batches (L1, L2) and the admin pages. OpenID Connect, passkeys, TOTP and API keys come in
L3. It needs Cesia's main and its branch `centauri-admin` (`std/check`, `http.Fetch` and `std/encode` in a page), and
Ceres's branch `admin` (a field of a password; an action that waits for the screen's first connection), not yet in a
release; `tools/deps.sh` puts Cepheus and Ceres in `deps/`.

MIT licence.
