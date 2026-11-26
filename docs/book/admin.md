# The admin pages

The task: the people who run the platform see it and act on it from a browser, as Django's admin lets them, with more
of what a platform needs: a dashboard of the last minutes (requests, failures, the time of a request, refusals and
the signs of bots, jobs), the users, the tenants and their roles changed in place, the events and the log as they
come, the jobs and the webhooks run again, the files, the settings, the data of every kind changed through its
checks, the trail of what the admins changed, the keys of programs and the feature flags, and a user's second factors
taken away when he lost his device. And the app adds its own pages, columns and actions in a few lines.
The code is `src/admin/admin.ce` (the module) and `src/admin/pages/` (the pages); the tests are `tests/admin.test.ce`
and, in a browser, `examples/invoices/tools/admin-shot.sh`.

What it uses: pages of [Ceres](https://www-celestial.github.io/ceres/) written in Cesia and compiled to WebAssembly
(`cesia build --target wasm`), the endpoints of the role super of [the administration](administration.md), the live
screen of [chapter 9](live.md), and nothing else: no new way into the app.

## 1. Mount it

```
(* src/invoices/module.ce *)
use deps/www-celestial/centauri/src/admin

App = app.Of([auth.Module(), jobs.Module(every = [Report]), hooks.Module(), admin.Module(folder = "admin"), Module], name = "invoices", ...)
```

```
(* admin/page.ce: the app's entry of its admin pages *)
use deps/www-celestial/centauri/src/admin/pages

pages.Run(title = "Invoices — admin")
```

```
cesia build --target wasm admin/page.ce     # admin/page.wasm, its loader page.js, the glue ceres.js and admin.js
brotli -k -q 11 admin/page.wasm admin/*.js  # optional: the browser then gets 144 KB in all
APP_ADMIN_EMAIL=ana@example.com APP_ADMIN_PASSWORD=... cesia do admin   # the first super-admin
```

The module serves the folder at the setting `APP_ADMIN_PATH`, `/admin` by default (`off` serves no page; the endpoints
stay, for programs), with the page that loads it: `index.html` holds no script of its own, no data and no secret, so
the Content-Security-Policy of every answer (`script-src 'self' 'wasm-unsafe-eval'`) holds for it too. The files are
read once at the start and kept in memory, each with its ETag: a second visit costs a `304` a file; a file `name.br`
beside it goes to a browser that takes brotli. They pass the same door as any request: the limit of the address, the
headers of security, the log.

The pages sign in by HTTP (`POST /auth/signin`), the session a cookie no script reads; an account that isn't a
super-admin's is signed out at once and told so. When the app asks a second factor (the super-admin's TOTP is on, or
`APP_TWO_FACTOR_ROLES` names `super`), the sign-in shows its second step: a field for the code of his app or a
recovery code, sent to `POST /auth/second`; and when he has none yet, first the secret to type into his app, its
`otpauth://` address and his recovery codes, shown that once (`POST /auth/second/setup`). A wrong code shows its
problem; an ended step goes back to the password ([passkeys](passkeys.md#5-the-second-step-of-a-sign-in)). Then they open the live screen (`/live`), which reads the session
again, checks the role `super` of each show, and runs each action, an endpoint by its name, through the same door as
over HTTP: the session, the role, the limits of the user, the shapes, the log, the metrics. A page in the browser is
never trusted: it holds nothing the server would not give any program with the same cookie.

```python
# Django: the admin is an app of the project, its pages made on the server from the models
INSTALLED_APPS = ["django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions", ...]
urlpatterns = [path("admin/", admin.site.urls)]
# python manage.py createsuperuser
```

## 2. The pages

| page | what it shows | what it does, through which endpoint |
|---|---|---|
| Dashboard | the counts (users, tenants, sessions, requests, refused, failed sign-ins of the last minute); a point each second of the last five minutes: requests and 5xx, p50 and p99 of a request, refusals at the door by reason (another site, a limit, no session, a role) and failed sign-ins, jobs ready, running and dead; the last events | the show `admin.series` (each second, from the metrics and the log of the process), `admin.events`, `GET /admin/stats` |
| Users | 50 a page, by the start of their e-mail or of a tenant, sorted by a click on a title | disable, enable, sign out everywhere, make or unmake a super-admin, each asked first (`POST /admin/users/:id/disable`...) |
| A user | his account, his tenants with his roles in a field each; his ways of signing in and second factors (a password or not, TOTP and the recovery codes left, each passkey with when it was made and last used and whether its device verified him, the providers); his sessions | roles saved in place (`PUT /admin/tenants/:id/members/:user`); his TOTP and recovery codes, or his passkeys, taken away when he lost his device (`POST /admin/users/:id/factors/reset`); a session chosen in the table ended alone (`DELETE /admin/sessions/:id`); each asked first |
| Tenants, a tenant | by the start of their name; its members and their roles | roles in place, a user added by his id with roles; someone invited by mail with roles (`POST /admin/tenants/:id/invites`) |
| Events | by kind, user, tenant, route, and a time range on the viewer's clock, page after page; or live, the last hour as it is written | `GET /admin/events`, the show `admin.events` |
| Log | the lines this process keeps, by level and a text; or live | `GET /admin/logs`, the show `admin.logs` |
| Jobs | by state and kind | a dead one run again, a waiting one cancelled (`POST /admin/jobs/:id/retry`, `/cancel`) |
| Webhooks | their deliveries (jobs `centauri.hook`) and their endpoints, their secrets never sent | a delivery run again |
| Files | each kind of `app.Files` and its things | |
| Settings | each setting, its variable, its value, where it came from (env, the app's code, Centauri's default); a secret is `(secret)`, masked by the server | |
| Data | each kind of `app.Kind`; the things of one, 50 a page (All reads them all, 200,000 at most); the one chosen with all its fields | its fields changed in place (`PATCH /admin/data/:kind/:id`), the app's actions |
| Audit | what the super-admins changed: who, when, from where, by which route, what | |
| Keys | the keys of programs, 50 a page, of a tenant by its id or of all: their tenant, name, roles, when made, when they end, when last used; never a secret | a key chosen revoked, asked first (`DELETE /admin/keys/:id`) |
| Flags | each feature flag the code declares: its name, what it is for, its state in words, what is set for tenants and users | on or off for everyone, on for a share of the users, back to the default, on, off or cleared for a tenant or a user by its id (`PUT /admin/flags/:name`) |

Every time is shown on the viewer's clock (a day that Cepheus keeps at 00:00 UTC as the day); every problem with its
status, its message, the fields that are wrong and the number of its request to quote (`urn:request:...`), and the
seconds to wait on a 429. Every list is a table of Ceres: only the rows in sight are drawn, so 100,000 rows scroll as
50 do (Speed).

A thing's fields are changed through the shape of their type in Cepheus (a text, a whole number, a number, an amount
of its scale, true or false, a day or an instant, a link), each wrong one named; Cepheus then checks its unique values
and its rules, and keeps in its history who changed it and why. A field that `app.Kind` names secret (the hash of a
password, a webhook's secret) is never sent to a page, shown `(secret)`, and never changed. Each change is an event,
`data-edited`, that names the fields and never their values.

## 3. Your own admin page: the invoices of every office

The support of the platform wants the unpaid invoices of every office, their sum by office, and to mark one paid when
a client pays by phone. Two endpoints of the role super on the server, and a page in the admin's entry:

```
(* src/invoices/endpoints/endpoints.ce *)
AdminRow = check.Record({Id: check.Id(), Tenant: check.Id(), Number: check.Int(1), BillTo: check.Text(), Due: check.Date(),
  Status: check.OneOf(Statuses), Total: check.Money(2, 0, 1e15)})
AdminInvoices = api.Get("/admin/invoices", query = check.Record({Status: check.OneOf(["unpaid", "paid"], optional = true, default = "unpaid")}),
  out = api.Page(AdminRow, 50), role = api.Super, about = "The invoices of every office.")
AdminPay = api.Post("/admin/invoices/:id/pay", role = api.Super, about = "Marks an invoice paid, for the support.")
```

```
(* src/invoices/invoices.ce: an invoice of any office paid by the support, as its office would pay it *)
defn adminPaying(r)
  id = app.IdOf(r.Params.id)
  inv = if value.IsMissing(id) missing else cepheus.Get(Invoice, id, r.Db)? end
  if value.IsMissing(inv) or value.IsMissing(inv.Tenant)
    return app.Missing()
  end
  office = r
  office.User = dict.Put("Tenant", inv.Tenant, r.User)
  office.Params = {id: "$id"}
  paying(office)?   (* the payment of chapter 3: once, its partner told in the same group *)
  result.Ok(missing)
end
adminPay(r) = app.Retry(() -> adminPaying(r))
```

```
(* admin/page.ce *)
use deps/www-celestial/centauri/src/admin/pages
use deps/www-celestial/ceres/src/web
use src/invoices/endpoints as e
use std/plot

defn unpaid(p)
  l = pages.Lister(e.AdminInvoices, {Status: "unpaid"}, p)   (* 50 a page, More and All under the table *)
  rows = pages.ListRows(l)
  asking = web.Signal(missing)
  said = web.Signal(missing)
  table = web.Table(rows, [web.Column("Office", i -> i.Tenant, sort = "Tenant", width = 90), web.Column("Number", i -> i.Number, sort = "Number", width = 90),
    web.Column("Bill to", i -> i.BillTo, sort = "BillTo"), web.Column("Due", i -> i.Due, sort = "Due", width = 120),
    web.Column("Total", i -> web.Money(i.Total), sort = "Total", width = 140)], height = 340, label = "Unpaid invoices")
  web.Stack([
    web.Title("Unpaid invoices"),
    web.Plot(() -> byOffice(web.Get(rows)), height = 200, width = 640, label = "Unpaid by office"),
    table,
    pages.ListState(l, rows),
    () -> paying(pages.Chosen(table, rows), p, l, asking, said),   (* Mark paid, asked first *)
    pages.Question(asking),
  ], gap = 8)
end

pages.Run(title = "Invoices — admin",
  kinds = [pages.Kind("invoice", title = "Invoices", columns = [pages.Column("Number"), pages.Column("BillTo", title = "Bill to"), pages.Column("Status"),
    pages.Column("Total", show = v -> "$v €")], actions = [pages.Action("Mark paid", e.AdminPay)])],
  more = [pages.Page("Unpaid", "/unpaid", unpaid)])
```

The whole file is `examples/invoices/admin/page.ce` (with `byOffice` and `paying`). What it gives:

- `pages.Page(title, path, view)`: a page in the menu after Centauri's; `view(p)` gives its widgets, and calls the
  app's endpoints by `pages.Call(endpoint, args, p)`, or reads one of pages by `pages.Lister`.
- `pages.Kind(name, title, columns, actions)`: how the data browser shows a kind; `pages.Column(field, title, show,
  width)` a column (its first fields when none); `pages.Action(label, endpoint, args, confirm)` a button on the thing
  chosen, `{id: its id}` by default, asked first unless `confirm = false`.
- the tools of every page: `pages.Lister`, `ListRows`, `ListState`, `More`, `Again`, `Chosen` (the row a click chose,
  in the order the table shows), `Confirm` and `Question`, `Replied` (a reply shown, or its problem), `Local` (a time
  on the viewer's clock), `Cell`.

An action of the app is an endpoint of the role super: the page never writes past the server's checks, and the
support's payment is the office's payment of chapter 3 (once, with `Expect`; the partner told in the same group).

```python
# Django: the same with the admin of the model, made on the server
@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("number", "bill_to", "status", "total")
    list_filter = ("status", "office")
    actions = ["mark_paid"]

    @admin.action(description="Mark paid")
    def mark_paid(self, request, queryset):
        for inv in queryset.select_for_update():   # the webhook of the partner: by hand, after the commit or not?
            inv.pay(by=request.user)
# a page of one's own: a view, a template, its URL in get_urls(), the admin's CSS to look like it, a chart by a JS library
```

What the browser test plays (`examples/invoices/tools/admin-shot.sh`, Chrome without a window driven from Cesia, and
the same in Firefox): sign in (the password a field of dots, a password input for the browser's manager), each page,
a user chosen and disabled once asked, the table read again; an invoice's name changed in place and a total that is no
number refused with its field; Mark paid on the Unpaid page; each change in the Audit; on Keys, the accounting robot's
key chosen and revoked once asked (the step `revoke`); on Flags, the flag `export.country` and its office, then on for
everyone (the step `flag`); sign out.

## 4. Its tests

`tests/admin.test.ce`: the files served with their type, ETag, 304 and brotli, no script of its own in the page, no
source and nothing outside the folder (`isPagesServedWithTheirHeaders`); off by its setting (`isTurnedOffBySetting`);
each endpoint of `api.AdminOfApp`, `api.AdminOfAccounts` and the jobs refused without a session (401) and without the
role (403) (`isEveryEndpointForSuperOnly`; the endpoints of the flags are not in its list);
no secret sent (`isSecretNeverSent`); a field changed through its type, a secret refused, a unique value checked, the
audit naming fields only (`isEditCheckedByTheKind`); a job cancelled, not while it runs, and run again
(`isJobCancelledAndRetried`); events by time and route (`isEventsFilteredByTimeAndRoute`); a request of another site
refused (`isCrossSiteRefused`); the log read once a line (`isLogTailedOnce`); the three shows for the role super only,
over a real WebSocket (`isLiveForSuperOnly`). `tests/people.test.ce`: the endpoints of the pages Keys and a user's
factors, sessions and invitations ([the administration](administration.md)); `tests/flags.test.ce`: those of Flags; `isEveryEndpointForSuperOnly` lists `AdminFlags` and `AdminFlag` too.

Next: [Speed](speed.md), where the pages' size, first paint and frames are measured.
