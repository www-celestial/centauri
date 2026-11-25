# The administration

A super-admin is a user of the whole platform, above every tenant (`Super` on his account, the role `api.Super`); the
first one is made by a task, `APP_ADMIN_EMAIL=... APP_ADMIN_PASSWORD=... cesia do admin` (`auth.Admin`), the others by
him (`PUT /admin/users/:id/super`). The endpoints below are the contract of the admin pages, in package api
(`src/api/platform.ce`): the pages are built with Ceres in L2, and any program may call them now. Each change is an
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
| `GET /admin/kinds`, `GET /admin/data/:kind?Tenant=` | the kinds of the database with their fields, and the things of one, by pages |
| `GET /admin/users?Search=&Tenant=`, `GET /admin/users/:id` | the users, newest first; one, with his tenants, roles and sessions |
| `POST /admin/users/:id/disable`, `/enable`, `/signout`; `PUT /admin/users/:id/super` | a user out (his sessions end), back, signed out everywhere; a super-admin made or unmade |
| `GET /admin/tenants?Search=`, `GET /admin/tenants/:id` | the tenants; one, with its members |
| `PUT /admin/tenants/:id/members/:user` | the roles of a user in a tenant (none: he leaves it) |

```
boss = t.Super()?
users = boss.Call(api.AdminUsers, {Search: "ana"})?
boss.Call(api.AdminDisable, {id: users.Rows[1].Id})?
```

A tenant's own admins manage its members with the endpoints of the accounts (`/auth/members`, `/auth/invites`),
not these.
