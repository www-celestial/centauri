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
6. [Security](security.md): each threat of the OWASP Top 10, and the others, with Centauri's defense and its test.
7. [The administration](administration.md): the endpoints of the super-admin pages, and what they show.

The reference of the packages, every public name with its parameters, is under [Reference](ref/index.html).
