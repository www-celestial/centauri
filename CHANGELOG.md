# Changelog

## Unreleased

OpenTelemetry and the telemetry of the pages. Nothing breaks: `APP_OTEL` is off by default; the pages' telemetry is
on, adds three kinds that the admin lists and a route, `POST /telemetry`, and keeps only what the CNIL lets a site
measure without asking.

- `APP_OTEL=on`: traces, metrics and logs to a collector of OpenTelemetry (`APP_OTEL_ENDPOINT`, OTLP over HTTP,
  `APP_OTEL_PROTOCOL` protobuf or JSON, `APP_OTEL_COMPRESSION`, `APP_OTEL_HEADERS`). Each request a span named by its
  route, its reads and writes of Cepheus its children, `app.Call` a child that carries `traceparent` on (its host and
  port, never its path), a job a trace of its own linked to the request that asked for it, a mail's sending, a live
  action the child or the link of the page's click; `Server-Timing` tells a page its trace. Sampling
  (`APP_OTEL_SAMPLE`, `APP_OTEL_ALWAYS`, `APP_OTEL_SLOW`), a `traceparent` from outside restarted with a link
  (`APP_OTEL_TRUST`), `APP_OTEL_SIGNALS`, `APP_OTEL_SERVICE`, `APP_OTEL_QUEUE`, `APP_OTEL_EVERY`,
  `APP_OTEL_METRICS_EVERY`; the client's address and account only as `APP_TELEMETRY_IP` and `APP_TELEMETRY_USER` say.
- The pages' telemetry (`APP_TELEMETRY_CLIENT`, on): `POST /telemetry` takes their batches, bounded (60 a minute an
  address, 64 KiB, `APP_TELEMETRY_MOST` a minute for the process), masks them again, and keeps
  `centauri_client_view` (a load of a page: Web Vitals, navigation, WebAssembly, frames, live screen, device,
  journey), `centauri_client_action` and `centauri_client_error`, `Untrusted`, `APP_TELEMETRY_KEEP` days; the country
  and city from a database of DB-IP (`APP_TELEMETRY_GEO`, `APP_TELEMETRY_GEO_FILE`, MMDB read in Cesia); the address
  and the account only as said, and with `APP_TELEMETRY_CONSENT=ask` once the visitor said yes. With `APP_OTEL` on,
  the actions are spans and the errors lines of the service `<app>-browser`.
- `examples/invoices/tools/trace-serve.ce`: the invoices with OpenTelemetry on, for the tutorial; `bench/otel.ce`.
- The book: [Telemetry](docs/book/telemetry.md), the settings and the Security rows of telemetry.

HTTP/3 and WebTransport, two settings, both off by default: nothing changes until an app turns them on.

- `APP_HTTP3=on` serves the same routes over HTTP/3 (QUIC) beside TCP, on `APP_HTTP3_PORT` (0, the default, is
  `APP_PORT`, where browsers look): every response of TCP says so (`Alt-Svc`), and browsers come over QUIC by
  themselves. It needs `APP_CERT` and `APP_KEY`; an OpenSSL without QUIC's server (3.0 on Ubuntu 22.04 and 24.04)
  leaves TCP alone, with a warning at the start.
- `APP_WEBTRANSPORT=on` lets the live screens take WebTransport sessions on `/live`, with the same frames and the same
  resume; the admin pages race it against WebSocket and keep the first that works (`<meta name="webtransport">`).
- `app.Listen(env, listener)`: serves an app as `Run` does once started, on a listener of one's own (a test's).
- The book: [When the connection drops](docs/book/connection.md) gains what QUIC adds and when it falls back, with a
  measured migration; settings and security rows.

The admin pages in French, and the book in French. Nothing breaks: every endpoint answers as it did. What changes,
each additive: in an app of several languages (`APP_LANGS`), `GET /auth/me` sends `Content-Language`, the language the
app speaks to that user, and the actions of a live screen carry the browser's language, so their errors come in it;
`pages.Run` takes `words`; an English page shows `1 row` where it showed `1 rows`. The admin pages need Ceres's
`web.App(say = ...)`.

- The admin pages speak English or French: the language of `GET /auth/me`'s `Content-Language` (the account's, else
  the browser's, among the app's languages), every text through `pages.Say` and a catalogue, `pages.Words` (254
  texts: titles, the menu, buttons, columns, help lines, empty lists, questions, the band of keys of Ceres, the errors
  of the screen), numbers as French writes them (`pages.Num`: `12 345,5`, a narrow space that no line breaks), times
  day first (`26/11/2026 09:22:01`, `pages.Local`; `pages.DayFirst` reads one typed so), plurals by CLDR; a text
  without its French shows in English, never empty; `<html lang>` set for screen readers. An app's own pages say their
  texts with `pages.Say(text, args)`, and give their French to `pages.Run(words = ...)`, after Centauri's; the titles
  of `Page`, `Kind`, `Column`, `Action` and `Run` are said where they show. The invoices' admin page in French.
- `apptest.Untranslated(paths, words, lang)`: the texts of pages that a catalogue doesn't give in a language (a text
  said without its translation, an empty one, a name of a value lost or added, a value written into a text, a text
  given straight to a widget of Ceres), and the catalogue's own entries.
- `i18n`: a plural reads a number written with spaces between its thousands (`12 345`); an empty translation gives
  the English.
- The book in French, `docs/fr/book/`, chapter for chapter, checked by `cesia doc --site` as Cesia's and Cepheus's
  are: the same headings, blocks byte for byte and links; `README.fr.md`. Every block of the book says its language,
  so that the site colors the Cesia ones, and each page's Cesia blocks are checked as one program.
- A picture at each step of the admin pages in the book, in English and in French, taken again by `tools/shots.sh`
  (`examples/invoices/tools/admin-shot.ce` with `DOCS`); the browser test of the admin plays in French too
  (`LANG=fr`), each page checked to fit the window and markup typed into a field kept a text.
- `tools/deps.sh` puts every package of Centauri and its tools in an example; `bench/words.ce`, what a text said costs.
- Fixes: the site check passes again (README's link to `examples/notes`, `jobs`' doc).

### When the connection drops

A page carries on: a drop of seconds to minutes (a wifi lost, wifi to 4G, a laptop
asleep, a restart or a deploy, a proxy that cuts idle connections) no longer shows, and nothing is lost or doubled.
Nothing breaks: a request without an `Idempotency-Key` takes the path it took, every endpoint answers as it did, and a
page of before still connects (std/live's version 1). What changes, each a setting with its old way kept: a key is the
account's, not the session's (`APP_IDEMPOTENCY_SCOPE=session` for before); a page's actions asked while it is away wait
and go once it is back (`APP_OUTBOX=off` for before, a refusal at once); an upload sent with an `Idempotency-Key`
holds it (a cut keeps its parts, its final answer is kept). It needs Cesia's branch `offline` (std/live version 2,
live.js, `websocket.Dial`'s `last`) and Ceres's (the page's client, `web.Connection`, `web.Conflicts`).

- The live screen of a page is kept `APP_RESUME_TIME` seconds (120) and `APP_RESUME_BYTES` of frames (1 MiB) after
  its connection breaks, for the page that comes back with the same account and the same shows, from any address: it
  gets every change of the break, once. Past that, a new screen whose answers replace the rows, said in the page.
- Each action of a page carries the key made when it was asked, its `Idempotency-Key`: sent again after a break, it
  runs once, on the screen kept (`Heard`) or on a new one (its key). An action stamped with another account is
  refused (403). The page's settings come with its screen: `APP_OUTBOX`, `APP_OUTBOX_COUNT`, `APP_OUTBOX_BYTES`,
  `APP_OUTBOX_WAIT`, `APP_RECONNECT_FIRST`, `APP_RECONNECT_MAX`, `APP_PING_EVERY`, `APP_DEAD_AFTER`.
- `app.Unchanged(kind, id, current, r)`: a change refused (a 409 whose `conflict` lists each field seen and now) when
  what the page saw (`Centauri-Base`, `web.Act`'s `base`) changed meanwhile, else the `Expect`s of it for the same
  write. `PATCH /admin/data/:kind/:id` checks what the admin saw.
- `APP_IDEMPOTENCY_SCOPE` (`account`, `session`), `APP_IDEMPOTENCY_LEASE` (0: a key a stopped server left running is
  refused until `APP_IDEMPOTENCY_TIME`; else let go after it).
- Uploads go on after a cut, with the headers of tus 1.0 on the app's own endpoint: `HEAD` answers `Upload-Offset`,
  a POST with `Upload-Offset` and `Upload-Length` sends the rest, a wrong offset gets a 409 with the right one; the
  kind `centauri_upload`; a cut left alone is forgotten with its parts after `APP_IDEMPOTENCY_TIME`. Downloads have a
  strong `ETag` and honour `If-Range`.
- `src/client`: `Upload` and `Download`, which go on by themselves after a cut.
- The admin pages: the band says the state of the connection (`web.Connection`), the conflicts with Keep mine and
  Take theirs (`web.Conflicts`), a sign-in in the page when the session ended while away, the changes kept; a list
  asked again keeps its rows until the new ones come.
- The book: [When the connection drops](docs/book/connection.md), in English and in French, with its pictures taken
  by `tools/shots.sh`; Security's rows of these threats; Settings.
- Tests: `tests/drop.test.ce` (10), the invoices' `tests/drop.test.ce` (4), the browser test `cesia do drop-shot`
  (Chrome's offline mode, a proxy that drops TCP connections, a restart on the same database); `bench/drop.ce`,
  `bench/storm.ce`.

## 0.4.0 (not released)

The third batch, L3: signing in with a provider, passkeys and two-factor, keys of programs, languages, feature flags,
and the generator of modules. Nothing of 0.3 breaks: every endpoint answers as it did, and the new ones are added.
What changes for an app of 0.3, each additive: `Account` gains `Lang` (optional, given once the user chose one or his
browser named one of the app's languages at his sign-up); `Invite` takes `Mail`, and its answer's `Code` and `Ends` are
optional (absent when `Mail` sends the code); `AdminUser` gains `Factors` (optional); the user's kind gains `Lang` and
`Handle`; the OpenAPI document lists the scheme `key` beside `session` on every endpoint a key may call; a request
with `Authorization: Bearer` and no cookie of a session is a program's, its key decides (one with the cookie is read as
before). With the defaults,
a user may turn TOTP on (`APP_TWO_FACTOR=optional`), and then his sign-ins ask its code; set `off` for none. It needs
Cesia's branch `centauri-l3` (`std/crypto` through OpenSSL, `std/cbor`).

- `auth`, signing in with a provider of OpenID Connect: Google, Microsoft (`MicrosoftTenant`, its `{tenantid}`
  issuer, `xms_edov`), Apple (`form_post`, its client secret signed by the app, ES256), GitHub (OAuth 2.0 and its API),
  any provider by `OidcIssuer`, and the app's own (`Provider`, `Module(providers = ...)`); `Google`, `Microsoft`,
  `Apple`, `Github`, `OidcSettings`, `Claimed`, `ClientSecret`, `SafeReturn`; the kinds `Identity` and `Flow`; the
  code with PKCE, the state, the nonce and the verifier drawn from the secret of a cookie `__Host-oidc`; the callback
  passed on to the page in a fragment; the ID token checked by the provider's keys, kept by their `Cache-Control` and
  read again once a minute at most for an unknown `kid`, its `iss`, `aud`, `azp`, `exp`, `iat`, `nonce`, and RFC
  9207's `iss`; an account linked by a verified address (`OidcLink`), made at a first sign-in (`OidcSignUp`), linked
  from the account and unlinked unless it is the last way in. JWS and JWK (`JwtParts`, `KeyOf`, `KeysOf`, `VerifyJwt`,
  `SignJwt`, `PemDer`): RS256, PS256, ES256 and EdDSA only, no `none`, no HMAC, no key a token brings.
- `auth`, passkeys (WebAuthn level 3): the kinds `Passkey` and `Ceremony`; `AuthData`, `CoseKey`, `B64u`, `Unb64u`;
  the ceremonies of two calls, a ticket whose secret is the challenge, once; the origin (`PasskeyOrigins`), no frame,
  the hash of the relying party (`RpId`, `RpName`), the user present and verified (`PasskeyCheck`), ES256, EdDSA,
  RS256, PS256, attestation `none`, a counter that may not go back (`PasskeyCounter`), the flag of backup kept; a
  sign-up with a passkey and no password; `Passkeys`, `PasskeyTime`.
- `auth`, two-factor: TOTP (RFC 6238; `TotpAlgorithm`, `TotpDigits`, `TotpPeriod`, `TotpSkew`, `TotpIssuer`) and 10
  recovery codes, the secret sealed and the codes keyed under a key of `APP_SECRET`, each code once; the kinds `Totp`,
  `Recovery`, `Step`; `TotpCode`, `Base32`, `Unbase32`; the second step of a sign-in, a ticket in the `401`'s Problem
  Details (`second`), `StepTime`, `StepTries`, the failures and the delay that doubles; asked of everyone or of roles
  (`TwoFactor`, `TwoFactorRoles`, `super`), set up at the sign-in that asks it, and on every way in (a password, a
  provider, a passkey its device didn't verify, the check of an address, a new password, a tenant entered, an
  invitation taken, a sign-up); `Passwords` off for an app of passkeys and providers alone.
- `auth`, keys of programs: the kind `Key`, `BearerOf`; `Authorization: Bearer id.secret`, its BLAKE2b kept, shown
  once, with some of its maker's roles, its end in days, its own limit (`KeyLimit`), never on the endpoints of the
  accounts, revoked at its next request, named in the why of each write; invitations by mail (`InvitePage`, the job
  `centauri.invite`, the mail `Invite` of `Mails`); `PUT /auth/lang`.
- `api`: `Providers`, `OidcStart`, `OidcBack`, `OidcBackPost`, `OidcFinish`, `Unlink`, `OidcEndpoints`, `ProviderRow`,
  `SignedIn`; `PasskeyNew`, `PasskeyAdd`, `Passkeys`, `PasskeyRemove`, `PasskeyStart`, `PasskeySignIn`,
  `PasskeySignUpStart`, `PasskeySignUp`, `PasskeyEndpoints`, `Ceremony`, `PasskeyRow`; `MyFactors`, `TotpStart`,
  `TotpConfirm`, `TotpOff`, `NewRecovery`, `Second`, `SecondSetup`, `SecondFactor`, `TotpSetup`, `Factors`; `NewKey`,
  `Keys`, `RevokeKey`, `KeysOfTenant`, `KeyRow`; `SetLang`; `FlagsOn`, `AdminFlags`, `AdminFlag`, `FlagEndpoints`,
  `FlagRow`; for the super-admin `AdminEndSession` (`DELETE /admin/sessions/:id`), `AdminResetFactors`
  (`POST /admin/users/:id/factors/reset`), `AdminInvite` (`POST /admin/tenants/:id/invites`), `AdminKeys`
  (`GET /admin/keys`), `AdminRevokeKey` (`DELETE /admin/keys/:id`), `AdminKeyRow`; `OpenApi` names the scheme `key`.
- `i18n`, new: `Catalog(lang, messages)` (a catalogue of one language, its messages a list of pairs, each message and
  its text or its plural forms), `Of` (catalogues joined, the last winning), `Say` (with values, or a message filled in
  read against the templates), `Match`,
  `Plural` (CLDR 49: ar, de, en, es, fr, it, ja, ko, nl, pl, pt, pt-PT, ru, sv, tr, uk, zh), `Best` (Accept-Language),
  and `Centauri`, the French of Centauri's words, std/check's and HTTP's.
- `app`: the setting `Langs`; `Module` and `Of` take `messages`, a catalogue of `i18n`; `Say`, `SayIn`, `Lang`; Problem Details translated at
  the door, with `Content-Language`; `Remember`, `Recall`, `Forget`, values kept in the state of the process; an
  endpoint may be `Cross`, the one request of another site the door takes (`OidcBackPost`); Problem Details carry
  `second`.
- `flags`, new: `Flag`, `Module`, `On`, `OnFor`, the kind `Set`, `Settings` (`FlagsRefresh`): for everyone, a share of
  the users by a hash, a tenant, a user, the most precise winning; facts in Cepheus read in memory.
- `gen`, new, and `tools/new-module.ce`: `cesia do new-module NAME [KIND]` writes a module and its test that passes,
  never over a file (`Files`, `Write`, `Words`, `Main`).
- `admin/pages`: the pages Keys and Flags; a user's ways in and second factors, taken away when he lost his device;
  a session ended alone; an invitation by mail from a tenant's page; the second step at the sign-in, and the setup of
  TOTP when the app asks it.
- `apptest`: `Provider`, `Rotate`, `Begun`, `CodeFor`, `Finished`, `ProviderSignIn`, `TestCerts`, `ProviderKey` (a
  provider of OpenID Connect over https on this machine); `Device`, `Made`, `Signed` (a device of passkeys);
  `t.SetUp` (a second factor set up when the settings stopped a sign-in at it).
- Fixes in `apptest`: `Fuzz` wrote a text that is no UTF-8 as JSON and panicked; it sends its bytes as they are now.
  `t.Code` read 64 bytes after `#code=`; it reads the code to its end now (an invitation's code is 48). `Isolated`'s
  mark `zqa` could be found in a random token of an answer (hex, base64url); it is `zqa.` now, which none holds.
- The example: the invoices sign in with Google, take passkeys and TOTP, give their partner a key, speak English and
  French (`src/invoices/words`, `Langs: "en,fr"`), and open the export with the country to one office (the flag
  `export.country`); `tests/l3.test.ce` checks tutorials 12 to 16; `src/filled` has a key and the flag; the test in a
  browser revokes a key and turns the flag on. The notes: `src/tickets` and `tests/tickets.test.ce`, made by the
  generator, and the task `new-module`.
- The book: tutorials 12 to 16 (Sign in with Google, Passkeys and two-factor, An API for a partner, Translate the app,
  Open a feature to one office), with Spring Boot beside; the generator in Your first API; Security (the threats of
  L3), Settings, the administration, the admin pages.

Found by the review of L3 before its release, and done: a key of a program does no more than its maker may (his roles
in the tenant at each request; a maker disabled or taken out ends it); a user asked a second factor turns his TOTP off
with a code and sets it up again at his next sign-in (his own way to a new phone); an answer of a provider whose
discovery says it names itself (`authorization_response_iss_parameter_supported`) is refused without `iss`; an account
linked by an address its provider verified gets that address checked, and one whose address is not checked yet signs
in by a provider only once checked (`EmailCheck=required`); `GET /auth/me` gives `Lang`; the plurals of es, tr and ar
read the value itself, as CLDR does (`"1.0"` is `one` in es); the OpenAPI document gives the scheme `key` only to the
endpoints a key may call (not those of the accounts nor of the super-admins); `PUT /admin/flags/:name` refuses `On` with
`Percent`; with `Passwords=off`, `/auth/forgot`, `/auth/reset` and `/auth/password` are refused too; a passkey's
sign-up asks its proof of work and counts its address once, at its options. The catalogues of i18n are lists of pairs
(`i18n.Catalog(lang, pairs)`, joined by `i18n.Of`), never a dictionary written with texts as keys: a page in
WebAssembly loads them as the server does.

Speed, on Cesia's branch `natives` (its tables of `std/fiber`, its native `encode.Base64`, its pool of domains for slow
calls): the state's rate limits, the sessions it keeps and the values it remembers (`Remember`, `Recall`, `Forget`)
live in tables that a request reads and counts in place, with no message to the state's fiber; a test's clock is a
table of one key. The same limits (GCRA, all of them or none), the same bounds, the same forget; a kept session holds
its user's limits, made once. In the program (`bench/micro.ce`, 21 runs, medians): a signed-in request 38.0 µs instead
of 44.8, a public one 22.5 instead of 24.9, a page 142 instead of 158 ([Speed](docs/book/speed.md)). Tests:
`isSessionAtItsEndReadAgain`, `isSessionReadBeforeAForgetKeptOut`, `isForgedSessionKeyNobody`. Nothing an app writes
changes; `env.State` is now a record of the state's channel and tables, where it was the channel.

## 0.3.0 (not released)

The admin pages. Nothing of 0.2 changes: an app without `admin.Module()` serves what it served; every new field of an
answer is optional, every new query field too.

- `admin`: the module of the super-admin's pages, `admin.Module(folder, entry, title)`: the pages that the app built
  (`cesia build --target wasm admin/page.ce`) served at `APP_ADMIN_PATH` (`/admin`, or `off`) from memory, with their
  ETag, a 304, their brotli, under the headers of security and the door; three live shows of the role super,
  `admin.series` (a point of the dashboard each second), `admin.events`, `admin.logs`.
- `admin/pages`: the pages, in Cesia with Ceres, in WebAssembly: sign-in, dashboard, users, a user, tenants, a tenant,
  events, log, jobs, webhooks, files, settings, data, audit; `pages.Run`, `Page`, `Kind`, `Column`, `Action`, and the
  tools of a page (`Call`, `Lister`, `ListRows`, `ListState`, `More`, `Again`, `Chosen`, `Confirm`, `Question`,
  `Replied`, `Local`, `Cell`).
- `app`: `Kind` takes `secret`, fields the administration never sends nor changes (Centauri's hashes and a webhook's
  secret are); `Module` takes `pages`; `Shelf`, `Shelved`, `Mount` serve a folder of built files; `Tail`, the lines of
  the log since a number; `api.AdminEdit` (`PATCH /admin/data/:kind/:id`) changes a thing through the shapes of its
  types; `GET /admin/events` takes `Route`, `Since`, `Until`; an action of the live screen gives `Instance` and
  `Retry` with its problem.
- `jobs`: `Cancel` and `api.AdminJobCancel`; `GET /admin/jobs` takes `Kind`; a retry and a cancel are events.
- The example: `examples/invoices/admin/page.ce` (the unpaid invoices of every office, Mark paid, the invoices' columns),
  `AdminInvoices` and `AdminPay` of the role super, `src/filled` (a month of data), `cesia do admin-serve`, the test in
  Chrome `tools/admin-shot.sh`.
- The book: The admin pages (with your own admin page, Django's admin beside), the administration, Security (the
  threats of the admin pages), Settings, Speed.

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
