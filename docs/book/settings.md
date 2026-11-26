# Settings, profiles and deployment

The task: run the invoices on a laptop with nothing to install but Cesia, then in a test, then in production behind
https, with a real Cepheus server, health checks for the orchestrator, metrics for Prometheus, and new versions without
a dropped request. The code is `src/app/settings.ce` and `src/app/app.ce` (`Run`).

What it uses: settings from `APP_*` read once through a shape, the three profiles, `/health/live` and `/health/ready`,
`/metrics`, a stop that ends the requests in progress, `--workers` and `HUP`, TLS.

## 1. Settings, one way

Each setting is a field of a shape, read **once** at the start from a variable of the environment: `APP_` and its name
in capitals, `CepheusUrl` from `APP_CEPHEUS_URL`. What the environment doesn't give takes the app's default (`Of`'s
`defaults`), else Centauri's. A wrong or missing one stops the start, and every wrong one is named at once:

```text
$ APP_PROFILE=prod APP_PORT=high cesia do serve
centauri: APP_PORT: a whole number from 0 to 65535.
$ APP_PROFILE=prod cesia do serve
centauri: APP_ORIGIN: an https:// address is needed in prod.
centauri: APP_SECRET: a secret of 32 bytes at least is needed in prod (the key of the cursors and of the challenges).
centauri: APP_CEPHEUS_URL: the database is needed in prod, as cepheus://localhost:7400/app.
```

A secret (`check.Secret()`, as `APP_SECRET`, `APP_CEPHEUS_TOKEN`, and the providers' `APP_GOOGLE_SECRET`,
`APP_APPLE_KEY`...) is never written in a log, and the administration shows it `(secret)`. An app adds its own settings, with their shapes, and reads them in `r.Settings`:

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/auth
use std/check
use std/json
invoices = json.Parse("{}")!
```

```cesia norun
Settings = check.Record({MailFrom: check.Email(optional = true, default = "office@example.com")})
App = app.Of([auth.Module(), invoices.Module], settings = Settings, defaults = {Tenancy: "single"})
```

```java
// Spring Boot: application.yml, application-prod.yml, @ConfigurationProperties with @Validated, and the order of
// precedence of its 15 sources (command line, SPRING_APPLICATION_JSON, the environment, the files...)
@ConfigurationProperties("app") @Validated record AppProps(@NotBlank String origin, @NotNull Duration sessionIdle) {}
```

Centauri's own settings, beside those of the accounts ([Sign up and sign in](sign-up.md)):

| setting | default | what it is |
|---|---|---|
| `APP_PROFILE` | `dev` | `dev`, `test` or `prod` |
| `APP_ORIGIN` | `http://localhost:PORT` | the address of the app as browsers see it: https in prod; its scheme decides `__Host-` and HSTS |
| `APP_PORT`, `APP_HOST` | 8080, 127.0.0.1 | where it listens |
| `APP_CEPHEUS_URL`, `APP_CEPHEUS_TOKEN`, `APP_CEPHEUS_CA` | | the database, its token, the certificate of its cluster's authority (TLS off its machine) |
| `APP_CEPHEUS_READ_TOKEN`, `APP_GET_DB` | `fork` in dev and test, `read` in prod with the token, else `same` | the database of a GET: a fork whose writes are caught, or a token that only reads |
| `APP_SECRET` | random at each start | the key of the cursors, of the challenges and of the secrets of TOTP and the recovery codes, 32 bytes at least, the same for every worker and at every start: with another, no secret of TOTP can be read ([passkeys](passkeys.md#4-totp-and-recovery-codes)) |
| `APP_CERT`, `APP_KEY` | | a certificate and its key in PEM: https |
| `APP_CORS` | | the origins of partners, with commas |
| `APP_TRUST_PROXY` | false | the client's address is the last of `X-Forwarded-For`, which the proxy in front writes |
| `APP_LIMIT_IP`, `APP_LIMIT_USER`, `APP_LIMIT_TENANT` | 600, 1200, 6000 | requests a minute, bursts of a quarter; every request counts, one refused by its role too |
| `APP_MAX_BODY`, `APP_TIMEOUT` | 1 MiB, 60 s | the largest body; the time of a request, from its first byte to its answer |
| `APP_LOG_REQUESTS`, `APP_LOG_LINES` | true (false in test), 1000 | one line of the log a request; the lines the administration keeps |
| `APP_ADMIN_PORT` | 0 (none) | `/metrics` for Prometheus, on 127.0.0.1 only |
| `APP_CSP` | the app's own scripts and WebAssembly | the Content-Security-Policy |
| `APP_UPLOAD_PART`, `APP_UPLOADS_AT_ONCE` | 1 MiB, 16 | the parts of a file in the vault; the uploads a process takes at once ([scans](scans.md)) |
| `APP_CALL_TIMEOUT`, `APP_CALL_PLAIN`, `APP_CALL_ALLOW`, `APP_CALL_CA` | 10 s, `refuse`, none | the calls to other services: their deadline, plain http, the hosts of the network they may reach, their authorities ([partner](partner.md)) |
| `APP_IDEMPOTENCY_KEY`, `APP_IDEMPOTENCY_TIME` | `honored`, a day | the `Idempotency-Key` header: honored, required or ignored; how long a key is kept |
| `APP_IDEMPOTENCY_SCOPE`, `APP_IDEMPOTENCY_LEASE` | `account`, 0 | whose a key is, the account's or the session's; after how long a key left running by a server that stopped is let go for a retry, 0 never ([when the connection drops](connection.md)) |
| `APP_OUTBOX`, `APP_OUTBOX_COUNT`, `APP_OUTBOX_BYTES`, `APP_OUTBOX_WAIT` | `on`, 100, 1 MiB, an hour | a page's actions asked while it is away from its app: kept in order and sent once it is back (`off`: refused at once); the most that wait, their bytes, how long one may wait ([when the connection drops](connection.md)) |
| `APP_RECONNECT_FIRST`, `APP_RECONNECT_MAX` | 500 ms, 30 s | the bounds of a page's wait before it tries its app again, drawn at random under a bound that doubles (full jitter) |
| `APP_PING_EVERY`, `APP_DEAD_AFTER` | 15 s, 30 s | a page's heartbeat, and the silence of its app that it takes for a break (more than `APP_PING_EVERY`) |
| `APP_RESUME_TIME`, `APP_RESUME_BYTES` | 120 s, 1 MiB | how long the app keeps a live screen whose connection broke, and the bytes of its frames, for the page that comes back (0: never) |
| `APP_JOB_WORKERS`, `APP_JOB_KEEP` | 4, a week | the fibers of a process that run the jobs (0: none here); how long a job done is kept ([report](nightly-report.md)) |
| `APP_MAIL_URL`, `APP_MAIL_FROM`, `APP_MAIL_TIMEOUT`, `APP_MAIL_CA` | `log:` in dev, `test:` in test, required in prod | the transport of the mails, their sender, their deadline, the authorities of a company's server |
| `APP_EMAIL_CHECK`, `APP_SIGN_UP_ANSWER`, `APP_CHECK_TIME`, `APP_RESET_TIME`, `APP_CHECK_PAGE`, `APP_RESET_PAGE`, `APP_MAILS_PER_HOUR` | `off`, `tell`, 2 days, 1 hour, `/check-email`, `/reset-password`, 5 | the checks of addresses and the new passwords by mail ([check](check-email.md)) |
| `APP_HOOK_TOLERANCE`, `APP_HOOK_TIMEOUT` | 300 s, 15 s | the webhooks: how far from now a message received may be, the deadline of each try |
| `APP_ADMIN_PATH` | `/admin` | where the admin pages are served, `off` for none ([the admin pages](admin.md)) |
| `APP_LANGS` | `en` | the languages the app speaks, with commas, its first the default; `en` alone translates nothing; the admin pages speak them too, English and French ([languages](languages.md)) |
| `APP_KEY_LIMIT` | 600 | the requests a minute of each key of a program, a burst of a quarter, apart from the users' ([partner API](partner-api.md)) |
| `APP_PASSWORDS` | `on` | `off`: no sign-up nor sign-in by password, only passkeys and providers |
| `APP_TWO_FACTOR`, `APP_TWO_FACTOR_ROLES` | `optional`, none | TOTP `off`, `optional` (a user turns it on) or `required` of everyone; the roles, with commas, that must have a second factor (`super` for the super-admins) ([passkeys](passkeys.md)) |
| `APP_TOTP_ALGORITHM`, `APP_TOTP_DIGITS`, `APP_TOTP_PERIOD`, `APP_TOTP_SKEW`, `APP_TOTP_ISSUER` | `SHA1`, 6, 30 s, 1, the app's name | the codes of TOTP: `SHA1` or `SHA256`, 6 to 8 digits, 15 to 120 seconds a code, 0 to 3 codes before and after now; the name the app of codes shows |
| `APP_STEP_TIME`, `APP_STEP_TRIES` | 300 s, 5 | how long the second step of a sign-in waits (60 to 1,800), and the codes a ticket takes (1 to 20) |
| `APP_PASSKEYS`, `APP_PASSKEY_CHECK`, `APP_PASSKEY_TIME`, `APP_PASSKEY_COUNTER`, `APP_PASSKEY_ORIGINS` | `on`, `required`, 300 s, `refuse`, none | the passkeys: on or off; the device's check of its user, `required`, `preferred` or `discouraged`; how long a ceremony waits (30 to 1,800); a counter that goes back refused or only noted (`allow`); other origins a ceremony may come from, with commas |
| `APP_RP_ID`, `APP_RP_NAME` | the host of `APP_ORIGIN`, the app's name | the relying party of the passkeys: the id they are bound to, and the name the device shows |
| `APP_INVITE_PAGE` | `/join` | the page of the front an invitation's link opens, at `APP_ORIGIN`, the code in its fragment |
| `APP_SIGN_IN_WITH` | none | the providers to sign in with, with commas: `google`, `microsoft`, `apple`, `github`, `oidc`, or one of the app's (`auth.Provider`); each needs its settings, or the start stops ([Google](google.md)) |
| `APP_OIDC_LINK`, `APP_OIDC_SIGN_UP`, `APP_OIDC_PAGE`, `APP_OIDC_TIME` | `verified`, `on`, `/signin/callback`, 600 s | an account linked by an address the provider verified, or `never`; an account made at a first sign-in, or `off`; the page the callback passes the provider's answer to; how long a sign-in with a provider waits (60 to 3,600) |
| `APP_GOOGLE_ID`, `APP_GOOGLE_SECRET` | none | Google's client |
| `APP_MICROSOFT_ID`, `APP_MICROSOFT_SECRET`, `APP_MICROSOFT_TENANT` | none, none, `common` | Microsoft's client, and its tenant: `common`, `organizations`, `consumers`, or the id of one |
| `APP_APPLE_ID`, `APP_APPLE_TEAM`, `APP_APPLE_KEY_ID`, `APP_APPLE_KEY` | none | Apple's Services ID, team, key's id, and the key (`.p8`, PEM) that signs its client secret |
| `APP_GITHUB_ID`, `APP_GITHUB_SECRET` | none | GitHub's client |
| `APP_OIDC_ISSUER`, `APP_OIDC_ID`, `APP_OIDC_SECRET`, `APP_OIDC_NAME`, `APP_OIDC_SCOPES` | none, none, none, `SSO`, `openid email profile` | any provider of OpenID Connect: its issuer (https), its client, its button's title, its scopes |
| `APP_<NAME>_ID`, `APP_<NAME>_SECRET` | none | the client of a provider of the app's own, `auth.Provider("okta", ...)` reading `APP_OKTA_ID` and `APP_OKTA_SECRET` |
| `APP_FLAGS_REFRESH` | 1 s | how often a process reads the feature flags again, 0 to 3,600 seconds ([flags](flags.md)) |

## 2. Three profiles

Their only differences, and nothing else changes with them:

| | dev | test | prod |
|---|---|---|---|
| detail of a 500 in its answer | yes | yes | no: the request's number only |
| `/openapi.json` | yes | yes | no |
| `APP_ORIGIN`, `APP_SECRET`, `APP_CEPHEUS_URL` | defaults | defaults | required, https |
| the database of a GET | a fork: a write is caught, a 500 that names the route | the same | a token that only reads, when given |
| without `APP_CEPHEUS_URL` | a database in memory, which keeps nothing | (apptest's fork) | refused |
| one log line a request | yes | no | yes |

## 3. Health and metrics

- `GET /health/live`: 200 while the process answers. `GET /health/ready`: 200 while the database answers and the
  process is not stopping, else 503. They pass before the limits, and are what Docker's `HEALTHCHECK` and Kubernetes'
  probes ask.
- Each request writes one line of JSON: its number, method, route (the pattern, never the query), status, time in
  milliseconds, address, user; never a body, a cookie or a token.
- `centauri_requests_total{route,status}`, `centauri_refused_total{reason}` (`origin`, `limit`, `signin`, `role`), and
  `http_*` of std/metrics: on `127.0.0.1:APP_ADMIN_PORT/metrics` for Prometheus, and as rows at `GET /admin/metrics`
  for the super-admin.

## 4. Production

```sh
cepheus token add invoices --database invoices=write --config /etc/cepheus/cluster.toml > /etc/invoices/app.token
cepheus token add invoices-read --database invoices=read --config /etc/cepheus/cluster.toml > /etc/invoices/read.token
export APP_PROFILE=prod APP_ORIGIN=https://invoices.example APP_HOST=0.0.0.0 APP_PORT=8443
export APP_CEPHEUS_URL=cepheus://localhost:7400/invoices APP_CEPHEUS_TOKEN="$(cat /etc/invoices/app.token)"
export APP_CEPHEUS_READ_TOKEN="$(cat /etc/invoices/read.token)" APP_SECRET="$(cat /etc/invoices/secret)"
export APP_CERT=/etc/invoices/fullchain.pem APP_KEY=/etc/invoices/key.pem APP_ADMIN_PORT=9090
cesia run --workers 4 --allow native=cepheus,ffi=sodium,ffi=ssl,ffi=crypto,env,net,read=/etc/invoices src/main.ce
APP_ADMIN_EMAIL=ops@invoices.example APP_ADMIN_PASSWORD=... cesia do admin    # the first super-admin
```

- `--workers 4` serves the port with 4 processes (each its own copy of the database in memory, its own limits);
  `kill -HUP` replaces them without losing a connection; `kill -TERM` stops taking new ones, lets those in progress
  end, each by its deadline, and exits.
- An image: a base with the libc, `cesia` and its `lib/`, the app's folder with its `deps/` (checked by `cesia.lock`):
  no JVM, no `node_modules`.

```java
// Spring Boot: spring-boot-starter-actuator for health and metrics, management.server.port for a port apart,
// server.shutdown=graceful, server.ssl.* for TLS, and a JRE in the image
```

## 5. Its tests

`src/app/app.test.ce`: the headers of each response and HSTS over https only (`isSecurityHeaders`), the detail of a
500 hidden in prod (`isOutputFilteredAndErrorsHidden`), OpenAPI in test only (`isOpenApiInTestOnly`), the limits
(`isLimited`), a GET that writes refused (`isGetThatWritesRefused`), the settings masked for the administration
(`isAdminOfTheApp`); and in the reference of `Read`, a start in prod without its settings, each named.
