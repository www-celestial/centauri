# Ouvrir une fonction à un seul cabinet

La tâche : l'export CSV des factures (un fichier texte, une ligne par facture, les champs séparés par des virgules)
gagne une colonne, le pays de chaque client. Elle est nouvelle, donc elle s'ouvre d'abord au cabinet d'Ada ; puis à une
part des utilisateurs ; puis à tout le monde ; et si ça tourne mal, elle se referme tout de suite. Ni déploiement ni
redémarrage pour rien de tout cela. Le code est dans `src/flags/flags.ce`, les contrats dans `src/api/flags.ce` (un
contrat dit ce qu'une adresse de l'API prend, ce qu'elle rend et le rôle qu'elle demande, lu par le serveur et par les
pages), la page d'administration dans `src/admin/pages/access.ce` (`Flags`) ; les tests sont dans
`tests/flags.test.ce`. L'exemple des factures le fait dans `examples/invoices/tests/l3.test.ce`
(`isExportOpenedToOneOffice`), et son test dans un navigateur, `examples/invoices/tools/admin-shot.ce`, allume le flag
depuis la page.

Ce qu'il utilise : des *feature flags*, chacun une fonction du code allumée pour les uns et éteinte pour les autres,
qu'on bascule pendant que l'app (l'application, le serveur et ses pages) tourne ; `flags.Flag`, `flags.Module`,
`flags.On`, `flags.OnFor` ; le réglage `FlagsRefresh` ; les endpoints `FlagsOn`, `AdminFlags` et `AdminFlag` (un
endpoint est une adresse de l'API avec sa méthode HTTP, comme `POST /clients`) ; la page Flags des
[pages d'administration](admin.md).

## 1. Un flag dans le code

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

`flags.Flag(name, about, default)` déclare un flag : son nom, de 1 à 100 lettres minuscules, chiffres, `-` et `.` ; ce
à quoi il sert, que montre la page d'administration ; son défaut, `false` s'il n'est pas donné. `flags.Module(flags)`
est le module des flags : leur kind dans Cepheus (une sorte de chose dans la base de données, comme les factures ou les
clients), leurs endpoints, et les flags que le code déclare. Deux flags du même nom arrêtent l'app à son démarrage.

Le handler (la fonction qui répond à une requête) le demande, pour l'utilisateur de sa requête :

```cesia norun
(* src/invoices/invoices.ce, in export *)
  country = flags.On("export.country", r)
  head = ["number", "date", "due", "bill_to", "status", "total", "paid_at"]
  lines = list.Concat([if country list.Append("country", head) else head end],
    [list.Concat([x.Number, day(x.Date), day(x.Due), cell(x.BillTo), x.Status, text.Decimals(2, x.Total), day(dict.Get(x.Id, paid))],
      if country [countryOf(x.Id, r)?] else [] end) for x in rows])
```

`flags.On(name, r)` est `flags.OnFor(name, r.Env, user, tenant)` avec l'utilisateur et le tenant de la requête (un
tenant est un client de la plateforme, comme un cabinet ou une entreprise, avec ses données à lui). `OnFor` sert là où
il n'y a pas de requête, dans un job (un travail fait en arrière-plan, hors de la requête), avec un utilisateur, ou un
tenant, ou aucun des deux. Un nom que le code ne déclare pas arrête la requête par une panic (un arrêt sur une erreur
du programme) : un flag mal écrit se voit dès le premier test qui passe par là.

```java
// Spring Boot: no flags in Spring; Togglz (togglz-spring-boot-starter), Unleash or OpenFeature, from their docs
enum Features implements Feature { @Label("The CSV export with the country") EXPORT_COUNTRY }
if (featureManager.isActive(Features.EXPORT_COUNTRY)) { head.add("country"); }
// Unleash: unleash.isEnabled("export.country", UnleashContext.builder().userId(id).addProperty("tenant", t).build())
// OpenFeature: client.getBooleanValue("export.country", false, context)
```

## 2. Basculé par un super-admin

```text
PUT /admin/flags/export.country {Tenant: 65537, On: true}     (role super)
```

| corps | ce qu'il règle |
|---|---|
| `{On: true}`, `{On: false}` | pour tout le monde |
| `{Percent: 30}` | allumé pour 30 % des utilisateurs, éteint pour les autres |
| `{Tenant: id, On: ...}` | pour un tenant |
| `{User: id, On: ...}` | pour un utilisateur |
| `{Clear: true}`, avec `Tenant` ou `User` ou aucun des deux | reprend ce qui était réglé à ce niveau : le niveau en dessous décide à nouveau |

Un tenant et un utilisateur à la fois, une part pour un tenant ou pour un utilisateur, ou aucun de `On`, `Percent` et
`Clear` reçoivent un `422` ; un flag que le code ne déclare pas, un `404` « There is no such flag. »
(`isWrongSettingRefused`). Chaque changement est un événement, `flag` : « export.country set true for tenant 65537. ».
`GET /admin/flags` donne chaque flag que le code déclare, dans l'ordre de leurs noms : son nom, ce à quoi il sert, son
défaut, et ce qui a été réglé par-dessus (`On` ou `Percent` pour tout le monde, ses `Tenants` et ses `Users`).

La page Flags des pages d'administration montre la même chose, un flag par ligne : son nom, ce à quoi il sert, son état
en mots (« désactivé pour tous », « activé pour 30 % des utilisateurs », « défaut du code : désactivé »), ce qui est
réglé pour des tenants et des utilisateurs, et ses boutons : Activer pour tous, Désactiver pour tous, une part et
Activer pour cette part, Revenir au défaut ; un id, et Activer, Désactiver ou Effacer, pour le tenant ou pour
l'utilisateur. Un navigateur en anglais voit les mêmes pages en anglais (« off for everyone », On for everyone...).

![La page Flags : export.country, « L'export CSV des factures avec le pays du client. », « activé pour tous » après un clic sur Activer pour tous, la ligne « Tenants : 65541 activé », les boutons d'une part, du défaut, d'un tenant ou d'un utilisateur par son id, et « Fait. ».](images/admin-flags-on.png)

```java
// Spring Boot: Togglz's console (togglz-console) sets a feature on or off, or by a strategy: a share of the users
// (GradualActivationStrategy), some users by name (UsernameActivationStrategy); a tenant is a strategy of your own
```

## 3. Lequel gagne

Le plus précis : ce qui est réglé pour l'utilisateur, sinon pour son tenant, sinon pour tout le monde, sinon le défaut
du code (`isDefaultThenMostPreciseWins` : allumé pour tout le monde, éteint pour le tenant de Bo, allumé pour Bo
lui-même, puis effacé pour lui, et la règle de son tenant décide à nouveau).

Une part des utilisateurs est tirée par un hash (une empreinte : un nombre calculé à partir d'un texte, d'où on ne peut
pas revenir au texte), pas au hasard. La place d'un utilisateur parmi cent, ce sont les deux premiers octets du BLAKE2b
du nom du flag et de son id, pris modulo 100 ; il est dans une part de 30 quand sa place est sous 30. Il reçoit donc la
même réponse à chaque requête et dans chaque processus, et une part qui passe de 30 à 50 garde les 30 et en ajoute 20
(`isShareOfUsersStable` : environ 30 % de 2 000 utilisateurs, les mêmes deux fois). Sans utilisateur (un job qui n'en
nomme aucun), une part est éteinte.

## 4. Au bout de combien de temps on le voit

Ce qui est réglé, ce sont des faits dans Cepheus (`centauri_flag`) : chaque processus de chaque serveur le voit donc.
Chaque processus les lit dans sa mémoire au plus toutes les `FlagsRefresh` secondes (1 par défaut ; 0 les lit à chaque
question), et ses propres changements tout de suite. Demander un flag coûte une lecture d'une table du processus,
celles de std/fiber, pas une lecture de la base de données. Un changement fait sur un serveur est vu sur un autre en moins de
`FlagsRefresh` secondes, sans redémarrage (`isChangeSeenByAnotherProcess`).

## 5. La page demande

```text
GET /flags/on    -> ["export.country"]     (role signed: Ada's office, once it is on for it)
```

Les flags allumés pour l'utilisateur de la session (le temps où un utilisateur reste connecté), par leurs noms : ainsi
une page ne montre une colonne ou un bouton que quand sa fonction est allumée (`isPageToldItsFlags`). La page ne fait
que montrer : le handler redemande `flags.On`, et décide.

## 6. Son test

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

Dans un navigateur, le test des pages d'administration va sur Flags, trouve `export.country` et son tenant, et appuie
sur « On for everyone », ou « Activer pour tous » quand le navigateur parle français (l'étape `flag` de
`admin-shot.ce`, jouée par `admin-play.js`, dans les deux langues).

| menace | défense | test |
|---|---|---|
| un flag réglé par quelqu'un qui n'est pas super-admin (l'administrateur de toute la plateforme, au-dessus des tenants) | `AdminFlags` et `AdminFlag` du rôle super, à la porte (ce que Centauri vérifie à l'entrée de chaque requête) | |
| un utilisateur dans une part à une requête, et dehors à la suivante | sa place par un hash du flag et de son id | `isShareOfUsersStable` |
| un nom de flag mal écrit dans le code | une panic à la première requête qui le demande ; deux flags du même nom arrêtent le démarrage | `isWrongSettingRefused` (du côté de l'administration) |

Suite : [Sécurité](security.md).
