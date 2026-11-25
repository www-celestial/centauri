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

A secret (`check.Secret()`, as `APP_SECRET`, `APP_CEPHEUS_TOKEN`) is never written in a log, and the administration
shows it `(secret)`. An app adds its own settings, with their shapes, and reads them in `r.Settings`:

```
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
| `APP_SECRET` | random at each start | the key of the cursors and of the challenges, 32 bytes at least, the same for every worker |
| `APP_CERT`, `APP_KEY` | | a certificate and its key in PEM: https |
| `APP_CORS` | | the origins of partners, with commas |
| `APP_TRUST_PROXY` | false | the client's address is the last of `X-Forwarded-For`, which the proxy in front writes |
| `APP_LIMIT_IP`, `APP_LIMIT_USER`, `APP_LIMIT_TENANT` | 600, 1200, 6000 | requests a minute, bursts of a quarter; every request counts, one refused by its role too |
| `APP_MAX_BODY`, `APP_TIMEOUT` | 1 MiB, 60 s | the largest body; the time of a request, from its first byte to its answer |
| `APP_LOG_REQUESTS`, `APP_LOG_LINES` | true (false in test), 1000 | one line of the log a request; the lines the administration keeps |
| `APP_ADMIN_PORT` | 0 (none) | `/metrics` for Prometheus, on 127.0.0.1 only |
| `APP_CSP` | the app's own scripts and WebAssembly | the Content-Security-Policy |

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
