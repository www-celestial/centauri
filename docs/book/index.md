# Centauri

Centauri is the backend framework of Cesia, on the database Cepheus: an app is a list of modules, each a record of its
kinds, its rules and its routes; a route is an endpoint of a contract and the function that answers it. Everything an
app may want to choose is a setting, with a default: one tenant or many, sign-up open, by invitation or closed, the
limits, the roles, the lockouts, proof of work. The chapters are tutorials: each does a real task of a real app, the
invoices of an office, step by step, with the way of Spring Boot beside, and ends on tests that pass. The whole app is
in [`examples/invoices`](https://github.com/www-celestial/centauri/tree/main/examples/invoices), with its tests.

1. [Your first API](first-api.md): a resource checked by its shapes, listed by pages and filters, with its rights by
   role and by tenant: contracts, routes, shapes, the output filtered, errors as Problem Details, pages by a cursor,
   `app.Own`, OpenAPI.
2. [Sign up and sign in](sign-up.md): accounts, passwords, sessions, signing out everywhere, tenants, invitations,
   roles, and the defenses: limits, lockouts, proof of work, the trap for bots, other sites refused, headers.
3. [Pay an invoice once](pay-once.md): a group of writes, all or nothing, `Expect` for a payment made once, numbers
   without a gap (`app.Next`), `app.Retry`, and who paid it: the history of Cepheus and the events of Centauri.
4. [Settings, profiles and deployment](settings.md): `APP_*` read once through a shape, the profiles dev, test and
   prod, health, metrics, a stop that loses no request, TLS, an image.
5. [Tests without a server or Docker](testing.md): `apptest`, an app in memory, clients that sign up and call; the
   three tests Centauri makes of any app, `Isolated`, `Fuzz`, `Surface`.
6. [Sign up with an e-mail check, and a forgotten password](check-email.md): addresses checked by the link of a mail,
   before a session or after, a new password by the link of a mail, the same answer whether an address has an account
   or not (mail, background jobs, codes kept as their hash).
7. [The report of each night](nightly-report.md): a mail at 06:00 in Paris, one run a day whatever the servers, tried
   again when the server of mail is down (jobs in the group of their write, schedules of cron with real zones,
   retries, the dead list, SMTP over TLS, Postmark).
8. [The scan of an invoice](scans.md): a file sent as it comes, its type checked by its first bytes, kept in Cepheus's
   vault by parts, read back by ranges (`api.Upload`, `app.Store`, `app.Download`, `Range`).
9. [The unpaid invoices, live](live.md): every page changes as the database does, from any server, without a broker
   (WebSocket, `cepheus.Watch`, the session and the rights, the endpoints as actions).
10. [Tell a partner, and take his answers](partner.md): webhooks signed as Standard Webhooks, tried again, received once;
    calls that never reach the app's own network (SSRF); `Idempotency-Key`.
11. [Change the schema without a stop](schema.md): migrations run once whatever the processes, a field filled, expand then
    contract, and what waits for Cepheus's A2.
12. [Security](security.md): each threat of the OWASP Top 10, and the others, with Centauri's defense and its test.
13. [The administration](administration.md): the endpoints of the super-admin pages, and what they show.
14. [The admin pages](admin.md): the pages of the super-admin in the browser, in WebAssembly (a live dashboard, users,
    tenants, events, log, jobs, webhooks, files, settings, the data of every kind changed in place, the audit trail),
    and your own admin page for the invoices, with Django's admin beside.
15. [Speed](speed.md): what Centauri adds to a start, to a request and under load, beside std/http alone, Go and
    Spring Boot, where the time goes, and what the pieces of the first month cost.

The reference of the packages, every public name with its parameters, is under [Reference](ref/index.html).
