# Open a feature to one office

The task: the CSV export of the invoices gains a column, the country of each client. It is new, so it opens to Ada's
office first; then to a share of the users; then to everyone; and if it goes wrong, it closes again at once. No
deployment and no restart for any of it. The code is `src/flags/flags.ce`, the contracts `src/api/flags.ce`, the page
of the admin `src/admin/pages/access.ce` (`Flags`); the tests are `tests/flags.test.ce`; the invoices do it in
`examples/invoices/tests/l3.test.ce` (`isExportOpenedToOneOffice`), and their test in a browser,
`examples/invoices/tools/admin-shot.ce`, turns the flag on from the page.

What it uses: *feature flags* (a feature of the code that is on for some and off for others, turned while the app
runs): `flags.Flag`, `flags.Module`, `flags.On`, `flags.OnFor`, the setting `FlagsRefresh`, the endpoints `FlagsOn`,
`AdminFlags` and `AdminFlag`, the page Flags of [the admin pages](admin.md).

## 1. A flag in the code

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/admin
use deps/www-celestial/centauri/src/api
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/apptest
use deps/www-celestial/centauri/src/auth
use deps/www-celestial/centauri/src/hooks
use deps/www-celestial/centauri/src/jobs
use std/dict
use std/list
use std/text
use std/json
Module = json.Parse("{}")!
Report = json.Parse("{}")!
ada = json.Parse("{}")!
bruno = json.Parse("{}")!
cell = json.Parse("{}")!
countryOf = json.Parse("{}")!
day = json.Parse("{}")!
e = json.Parse("{}")!
invoices = json.Parse("{}")!
paid = json.Parse("{}")!
r = json.Parse("{}")!
rows = json.Parse("{}")!
```

```cesia norun
(* src/invoices/module.ce *)
use deps/www-celestial/centauri/src/flags

ExportCountry = flags.Flag("export.country", about = "The CSV export of the invoices with the country of the client.")

App = app.Of([auth.Module(), jobs.Module(every = [Report]), hooks.Module(), flags.Module([ExportCountry]), admin.Module(folder = "admin"), Module], (* ... *))
```

`flags.Flag(name, about, default)` declares a flag: its name of 1 to 100 small letters, digits, `-` and `.`; what it
is for, which the admin page shows; its default, `false` unless given. `flags.Module(flags)` is the module of the
flags: their kind in Cepheus, their endpoints, and the flags the code declares; two flags of one name stop the app at
its start.

The handler asks it, for the user of its request:

```cesia norun
(* src/invoices/invoices.ce, in export *)
  country = flags.On("export.country", r)
  head = ["number", "date", "due", "bill_to", "status", "total", "paid_at"]
  lines = list.Concat([if country list.Append("country", head) else head end],
    [list.Concat([x.Number, day(x.Date), day(x.Due), cell(x.BillTo), x.Status, text.Decimals(2, x.Total), day(dict.Get(x.Id, paid))],
      if country [countryOf(x.Id, r)?] else [] end) for x in rows])
```

`flags.On(name, r)` is `flags.OnFor(name, r.Env, user, tenant)` with the user and the tenant of the request;
`OnFor` serves where there is no request, a job, with a user or a tenant or neither. A name the code doesn't declare
stops the request with a panic: a flag written wrong shows in the first test that passes there.

```java
// Spring Boot: no flags in Spring; Togglz (togglz-spring-boot-starter), Unleash or OpenFeature, from their docs
enum Features implements Feature { @Label("The CSV export with the country") EXPORT_COUNTRY }
if (featureManager.isActive(Features.EXPORT_COUNTRY)) { head.add("country"); }
// Unleash: unleash.isEnabled("export.country", UnleashContext.builder().userId(id).addProperty("tenant", t).build())
// OpenFeature: client.getBooleanValue("export.country", false, context)
```

## 2. Turned by a super-admin

```text
PUT /admin/flags/export.country {Tenant: 65537, On: true}     (role super)
```

| body | what it sets |
|---|---|
| `{On: true}`, `{On: false}` | for everyone |
| `{Percent: 30}` | on for 30% of the users, off for the others |
| `{Tenant: id, On: ...}` | for a tenant |
| `{User: id, On: ...}` | for a user |
| `{Clear: true}`, with `Tenant` or `User` or neither | takes back what was set there: the level below rules again |

A tenant and a user at once, a share for a tenant or a user, or none of `On`, `Percent` and `Clear` is a `422`; a flag
the code doesn't declare a `404` "There is no such flag." (`isWrongSettingRefused`). Each change is an event, `flag`:
"export.country set true for tenant 65537.". `GET /admin/flags` gives each flag the code declares, in the order of
their names: its name, what it is for, its default, and what was set over it (`On` or `Percent` for everyone, its
`Tenants` and its `Users`).

The page Flags of the admin pages shows the same, a flag a line: its name, what it is for, its state in words ("off for
everyone", "on for 30% of the users", "the code's default: off"), what is set for tenants and users, and its buttons:
On for everyone, Off for everyone, a share and On for this share, Back to the default; an id, and On, Off or Clear for
the tenant or for the user.

```java
// Spring Boot: Togglz's console (togglz-console) sets a feature on or off, or by a strategy: a share of the users
// (GradualActivationStrategy), some users by name (UsernameActivationStrategy); a tenant is a strategy of your own
```

## 3. Which one wins

The most precise: what is set for the user, else for his tenant, else for everyone, else the code's default
(`isDefaultThenMostPreciseWins`: on for everyone, off for Bo's tenant, on for Bo himself, then cleared for him and his
tenant's rules again).

A share of the users is drawn by a hash, not at random: a user's place among a hundred is the first two bytes of the
BLAKE2b of the flag's name and his id, taken modulo 100, and he is in a share of 30 when his place is below 30. So he
gets the same answer at each request and in every process, and a share that grows from 30 to 50 keeps the 30 and adds
20 (`isShareOfUsersStable`: about 30% of 2,000 users, the same twice). Without a user (a job that names none), a share
is off.

## 4. How soon it is seen

What is set is facts in Cepheus (`centauri_flag`), so every process of every server sees it. Each process reads them
into its memory at most every `FlagsRefresh` seconds (1 by default; 0 reads them at each question), and its own changes
at once: asking a flag costs a round trip to the state of the process, not a read of the database. A change made on
one server is seen on another within `FlagsRefresh` seconds, with no restart (`isChangeSeenByAnotherProcess`).

## 5. The page asks

```text
GET /flags/on    -> ["export.country"]     (role signed: Ada's office, once it is on for it)
```

The flags on for the user of the session, by their names, so a page shows a column or a button only when its feature
is on (`isPageToldItsFlags`). The page only shows: the handler asks `flags.On` again, and decides.

## 6. Its test

```cesia norun
defn isExportOpenedToOneOffice()
  t = apptest.Start(invoices.App)?
  a = t.SignUp(ada)?
  b = t.SignUp(bruno)?
  for u in [a, b]
    c = u.Call(e.AddClient, {Name: "Client", Email: "c@example.com", Country: "BE"})?
    u.Call(e.AddInvoice, {Client: c.Id, Date: "2026-11-01", Due: "2026-12-01", Lines: lines})?
  end
  boss = t.Super()?
  before = a.Raw("GET", "/invoices.csv").Body
  boss.Call(api.AdminFlag, {name: "export.country", Tenant: a.Tenant, On: true})?
  hers = a.Raw("GET", "/invoices.csv").Body
  his = b.Raw("GET", "/invoices.csv").Body
  not text.Contains("country", before) and text.StartsWith("number,date,due,bill_to,status,total,paid_at,country", hers) and text.Contains(",BE", hers) and
    not text.Contains("country", his)
end
```

In a browser, the test of the admin pages visits Flags, finds `export.country` and its tenant, and presses "On for
everyone" (the step `flag` of `admin-shot.ce`, played by `admin-play.js`).

| threat | defense | test |
|---|---|---|
| a flag set by who isn't a super-admin | `AdminFlags` and `AdminFlag` of the role super, at the door | |
| a user in a share at one request and out at the next | his place by a hash of the flag and his id | `isShareOfUsersStable` |
| a flag's name written wrong in the code | a panic at the first request that asks it; two of one name stop the start | `isWrongSettingRefused` (the admin's side) |

Next: [Security](security.md).
