# The administration

A super-admin is a user of the whole platform, above every tenant (`Super` on his account, the role `api.Super`); the
first one is made by a task, `APP_ADMIN_EMAIL=... APP_ADMIN_PASSWORD=... cesia do admin` (`auth.Admin`), the others by
him (`PUT /admin/users/:id/super`). The endpoints below are the contract of the admin pages, in package api
(`src/api/platform.ce`): [the admin pages](admin.md) call them, and any program may. Each change is an
event of the history, and nobody disables himself or takes the role from himself, so the platform keeps one.

| endpoint | what it gives or does |
|---|---|
| `GET /admin/app` | the app: name, version, profile, start, uptime, modules, counts of endpoints and kinds |
| `GET /admin/stats` | users, tenants, sessions, requests, refusals, failed sign-ins of the last minute |
| `GET /admin/settings` | every setting: its variable, its value (`(secret)` for a secret), where it came from (env, code, default) |
| `GET /admin/logs?Level=&Search=` | the last lines of the log of this process, the newest first |
| `GET /admin/metrics` | the metrics of this process, one row a value |
| `GET /admin/endpoints` | every endpoint of the app, by module, with its role and its limit |
| `GET /admin/events?Kind=&Tenant=&User=` | the history: sign-ups, sign-ins and their failures, lockouts, refusals, invitations, roles, users disabled |
| `GET /admin/kinds`, `GET /admin/data/:kind?Tenant=&Where=&Search=` | the kinds of the database with their fields and how many things each holds, and the things of one, by pages: those whose fields have the values of `Where` (a JSON object, `{"Status":"paid"}`), those whose texts hold `Search`, any case (5,000 things read at most a page: Cepheus finds a value's start, not a text inside it); each with the things its links name, by their title |
| `GET /admin/data/:kind/facets` | the fields of a kind of at most 12 values, each value with how many things have it |
| `GET /admin/data/:kind/:id/history` | what the administration changed of a thing, the newest first, and who |
| `POST /admin/data/:kind {Fields}`, `DELETE /admin/data/:kind/:id` | a thing of a kind of the app made, or deleted (its links and the database's rules may refuse it: 409); the platform's own kinds are kept by their own pages |
| `GET /admin/users?Search=&Tenant=`, `GET /admin/users/:id` | the users, newest first; one, with his tenants, roles and sessions, and his `Factors`: TOTP on or not, the recovery codes left, a password or not, his passkeys, the providers he signs in with |
| `DELETE /admin/sessions/:id` | one session ends; the user's others go on |
| `POST /admin/users/:id/factors/reset {Totp, Passkeys}` | his TOTP and recovery codes, his passkeys, taken away when he lost his device; his sessions go on ([passkeys](passkeys.md#6-when-a-device-is-lost)) |
| `POST /admin/users/:id/disable`, `/enable`, `/signout`; `PUT /admin/users/:id/super` | a user out (his sessions end), back, signed out everywhere; a super-admin made or unmade |
| `GET /admin/tenants?Search=`, `GET /admin/tenants/:id` | the tenants; one, with its members |
| `PUT /admin/tenants/:id/members/:user` | the roles of a user in a tenant (none: he leaves it) |
| `POST /admin/tenants/:id/invites {Email, Roles}` | an invitation to a tenant by mail: `202`, a job makes its code and mails its link (`APP_INVITE_PAGE`), so the code is in no answer and no database |
| `GET /admin/keys?Tenant=`, `DELETE /admin/keys/:id` | the keys of programs of every tenant or of one, the newest first, never their secrets; one revoked ([partner API](partner-api.md)) |
| `GET /admin/flags`, `PUT /admin/flags/:name` | the feature flags the code declares, with what was set over them; one set for everyone, a share of the users, a tenant or a user, or cleared (served by `flags.Module`: [flags](flags.md)) |
| `GET /admin/jobs?State=&Kind=`, `POST /admin/jobs/:id/retry`, `POST /admin/jobs/:id/cancel` | the jobs of a state and a kind; a dead one run again; a waiting one made dead (a running one: 409) |
| `PATCH /admin/data/:kind/:id` | fields of a thing changed (`Fields`, a JSON object), each through the shape of its type; a secret one refused |
| `GET /admin/series?Step=&Count=` | the history of the dashboard as columns: the last `Count` points of a `Step` (1, 60 or 600), the oldest first |
| the live shows `admin.series`, `admin.events`, `admin.logs` | the points of the dashboard, a second's for 15 minutes, a minute's and ten minutes' for 7 days, the events of the last hour as they come, the log of the process as it goes |

`admin.series` is the history of the process, sampled once whatever the pages that watch it: from the start of the app
(from the first page that asks, when `AdminPath` is `off`), a point each second, the last 900 kept, a point each
minute, the last 10,080, and a point every ten minutes, the last 1,008, in memory (about 6.6 MB once full, after 7
days). A page asks the last `Seconds` (0 to 900, 300 unless it says), the last `Minutes` (0 to 10,080) and the last
`Tens` (0 to 1,008), none of these two unless it says: `{"Show": "admin.series", "Args": {"Seconds": 900, "Minutes":
60, "Tens": 1008}}`, 15 minutes by the second, the last hour by the minute and 7 days by ten minutes, is 1,968 points,
about 410 KB of JSON (all the minutes, 10,980 points, 2.3 MB). It gets them at once, 500 points a frame at most, the
newest first, then each new point, and the points that leave its window as `Removed`. `Step` tells a second's point
(1) from a minute's (60) and ten minutes' (600); `At` is the end of its second or the start of its minute or ten
minutes. A minute's point sums its seconds (requests, 5xx, refusals, sign-ins), and ten minutes' their minutes; each
keeps its last second's `Failures`, jobs and `Screens`, and its `P50` and `P99` are those of every request of its span,
within 1 % (DDSketch: Masson, Rim and Lee, *PVLDB* 12(12), 2019; the sketches of the minutes merge into ten minutes'
with no loss). The other fields: `Screens`, the live screens open on the
process; `SignedIn` and `FailedSignIns`, the sign-ins that opened a session and those refused; what the process uses,
in a second's point (a minute's and ten minutes' keep their last second's): `Cpu`, its share of one core over the
second in percent (200 for two cores busy), `Memory`, its bytes in RAM (from `sys.Usage()`), and `DiskUsed` and
`DiskTotal`, the bytes of the file system that holds the folder of the setting `AdminDisk` (from `sys.Disk`), as the
data folder of a Cepheus on the same machine, when it is given: the app needs `--allow read` on it. A field the system
doesn't tell is absent, never 0. A database's writes have no source yet: the package of Cepheus counts none.

`GET /admin/series` gives the same history in columns, what a page reads once when it opens and when its range
changes, before `admin.series` with `{"Seconds": 60}` for the points that come: `{"Step": 1, "Ats": [...], "Cols":
{"Requests": [...], "P99": [...], "Memory": [...]...}}`, a list a field (`Requests`, `Errors`, `Origin`, `Limit`,
`Signin`, `Role`, `Failures`, `SignedIn`, `FailedSignIns`, `P50`, `P99`, `Ready`, `Running`, `Dead`, `Screens`, and
`Cpu`, `Memory`, `DiskUsed`, `DiskTotal` when every point has them), the times of the requests to the tenth of a
millisecond. `Count` is all the points kept unless given. Measured on a full history: `Step=1&Count=900` is about
83 KB of JSON, `Step=60&Count=60` 6 KB, `Step=600&Count=1008` 96 KB, where the rows of `admin.series` were 412 KB.

`GET /admin/events` also takes `Route`, `Since` and `Until` (ISO 8601). `GET /admin/data/:kind` and `GET /admin/kinds`
never give a field that `app.Kind(..., secret = [...])` names (`title = "Number"` names the field that a link
shows of a thing of the kind; without it, its first field of text): it comes as `(secret)`, and `Secret` marks it among the
fields of its kind; Centauri's own (the hashes of passwords, sessions, invitations and codes, of the keys of programs,
the recovery codes, the tickets of a second step, the ceremonies of passkeys and the flows of providers, the sealed
secrets of TOTP, a webhook's secret) are named so. Each change of `POST`, `PATCH` and `DELETE /admin/data`, `retry` and
`cancel` is an event (`data-created`, `data-edited`, `data-deleted`, `job-retried`, `job-cancelled`), which names the
fields, never their values,, and so are a session ended (`signout`), factors taken away
(`factors-reset`), an invitation (`invite`), a key revoked (`key-revoked`) and a flag set (`flag`), with the others:
[the admin pages](admin.md) show them as the audit trail.

A user's page in the admin shows `GET /admin/users/:id`, his factors with the buttons of
`POST /admin/users/:id/factors/reset`, and his sessions, one ended by `DELETE /admin/sessions/:id`:

![The page of a user in the admin: his ways of signing in (TOTP on, the recovery codes left, a passkey), the buttons that take them away, his sessions, one chosen, and the question "End session …?".](images/admin-user-factors.png)

A tenant's page shows `GET /admin/tenants/:id` and sends `POST /admin/tenants/:id/invites`:

![The page of a tenant: its members and their roles, and an invitation by mail sent to cleo@example.com as accountant: "Done.".](images/admin-tenant-invite.png)

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/api
use std/json
a = json.Parse("{}")!
made = json.Parse("{}")!
t = json.Parse("{}")!
```

```cesia norun
boss = t.Super()?
users = boss.Call(api.AdminUsers, {Search: "ana"})?
boss.Call(api.AdminDisable, {id: users.Rows[1].Id})?
```

```cesia norun
boss.Call(api.AdminResetFactors, {id: a.User, Totp: true, Passkeys: true})?
boss.Call(api.AdminRevokeKey, {id: made.Id})?
```

A tenant's own admins manage its members and its keys with the endpoints of the accounts (`/auth/members`,
`/auth/invites`, `/auth/keys`), not these. The tests of these endpoints are `tests/people.test.ce`: the keys of every
tenant seen and revoked (`isKeysSeenAndRevokedBySuper`), one session ended and not the others (`isOneSessionEnded`),
a user's factors seen and taken away (`isFactorsShownAndReset`), invitations by mail of a super-admin and of a tenant's
admin, their code in no answer and no database (`isInvitedByMail`, `isTenantAdminInvitingByMail`); and each refuses
who has no session (401) and who isn't a super-admin (403) (`isEveryEndpointForSuperOnly` in `tests/admin.test.ce`).
