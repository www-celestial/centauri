# Votre première API

La tâche : un cabinet garde ses clients. Un admin (un administrateur) du cabinet en ajoute un. Il les liste par
pages, avec une recherche à mesure qu'il tape, en ouvre un, le modifie, et en supprime un qui n'a aucune facture.
Personne d'un autre cabinet ne les voit, et un comptable n'y touche pas. Ce chapitre l'écrit sur Centauri, pas à pas,
avec à côté la même chose en Spring Boot 4. Le code entier est dans `examples/invoices/src/invoices/` (clients.ce et
endpoints/), et ses tests dans `examples/invoices/tests/`.

Ce qu'il utilise :

- les contrats (`api.Post`, `api.Get`, `api.Put`, `api.Delete`) : un contrat dit ce qu'un endpoint (une adresse de
  l'API avec sa méthode HTTP, comme `POST /clients`) prend, ce qu'il rend et le rôle qu'il demande ; il est lu par le
  serveur et par les pages ;
- les formes (`std/check`) : une forme dit ce qu'une valeur doit être (un texte de 1 à 120 octets, un nombre
  entier...) ;
- la sortie filtrée par sa forme ;
- les erreurs (`app.Fail`, Problem Details : le format standard des erreurs d'une API HTTP, RFC 9457) ;
- les pages par un curseur (`api.Page`) ;
- le tenant (un client de la plateforme, comme un cabinet ou une entreprise, avec ses données à lui) dans chaque
  question, et `app.Own` ;
- les rôles sur les endpoints ;
- OpenAPI (le format standard qui décrit une API HTTP : ses adresses, ce qu'elles prennent et ce qu'elles rendent).

## 1. Le projet

Une app (l'application, le serveur et ses pages) de Centauri est un projet Cesia qui prend Centauri et Cepheus dans
`deps/` :

```toml norun
[project]
name = "invoices"
cesia = "1.3"

[deps.centauri]
from = "github.com/www-celestial/centauri"
version = "v0.1.0"
take = ["src/app", "src/api", "src/auth", "src/apptest"]

[deps.cepheus]
from = "github.com/www-celestial/cepheus"
version = "v0.1.0"
take = ["cesia/cepheus"]

[tasks.serve]
file = "src/main.ce"
allow = ["native=cepheus", "ffi=sodium", "env", "net"]

[test]
allow = ["native=cepheus", "ffi=sodium"]
```

Tant que les deux n'ont pas de release marquée d'un tag (une version publiée, nommée dans git),
`tools/deps.sh examples/invoices` de Centauri les met dans `deps/` et écrit `cesia.lock` : l'empreinte de chaque
fichier, que Cesia vérifie avant de le charger.

Spring Boot : un `pom.xml` avec `spring-boot-starter-web`, `-data-jpa`, `-security`, `-validation`, le driver de
PostgreSQL et Flyway ; puis `application.yml` pour la base de données.

### Un module fait par le générateur

Ce chapitre écrit les clients à la main, pour montrer chaque pièce. Un nouveau module peut aussi partir du générateur
de Centauri. Il écrit un module qui marche, bâti comme celui-ci, et son test, qui passe. C'est une tâche de l'app, prise
dans le Centauri de `deps/` (son `take` liste aussi `"src/gen"` et `"tools"`) :

```toml norun
[tasks.new-module]
file = "deps/www-celestial/centauri/tools/new-module.ce"
allow = ["read", "write"]
```

```text
$ cesia do new-module tickets
wrote src/tickets/api/api.ce
wrote src/tickets/kinds.ce
wrote src/tickets/tickets.ce
wrote tests/tickets.test.ce
Add it to the app: use src/tickets, then tickets.Module in app.Of([...]). Then cesia test tests/tickets.test.ce.
```

- `src/tickets/api/api.ce`, le contrat : `TicketIn`, `TicketOut`, et `AddTicket`, `Tickets` (20 par page, les plus
  récents d'abord), `Ticket`, `EditTicket`, `DeleteTicket`, du rôle `member`.
- `src/tickets/kinds.ce` : le kind (une sorte de chose dans la base de données, comme les factures ou les clients)
  `ticket`, chaque ticket rattaché à son tenant (`Tenant`, `Name`, `Note`, `Created`).
- `src/tickets/tickets.ce` : les handlers (les fonctions qui répondent à une requête), chacun écrit avec
  `r.User.Tenant` et lit par `app.Own` ; et `Module`.
- `tests/tickets.test.ce` : des tickets créés, modifiés, lus, listés et supprimés par un membre
  (`isMadeListedChangedDeleted`), un autre tenant qui ne les voit pas (`isOtherTenantBlind`), et les tests que Centauri
  fait de chaque app (`isIsolated`, `isFuzzed`). Il fait tourner sa propre app, faite des comptes et du nouveau module :
  il passe donc avant même que le module soit dans l'app.

Les deux lignes qu'il nomme vont dans l'app : `use src/tickets`, et `tickets.Module` dans la liste de `app.Of`. Le nom
fait de 2 à 40 lettres minuscules et chiffres, une lettre en premier. Le kind est le nom sans son dernier `s`, ou le
second mot (`cesia do new-module people person`). Le générateur n'écrit jamais par-dessus un fichier : si l'un des
quatre existe déjà, il n'en écrit aucun (« src/tickets/kinds.ce is there already: nothing was written. »). `member` est
un rôle de la table par défaut de Centauri. Une app qui a ses propres rôles, comme celle des factures (owner, admin,
accountant), change le rôle dans le contrat ; sinon son démarrage s'arrête dessus (« POST /tickets: the role member is
no role of the app (...). »). Ce qu'il écrit est le module de `examples/notes/src/tickets`, dont le test passe là-bas
(`isTheTicketsOfTheNotes` dans `tests/gen.test.ce`).

Spring Boot n'a pas de générateur de module : Spring Initializr (start.spring.io) fait un projet ; le
`jhipster entity` de JHipster fait une entité avec ses pages, sur sa propre stack (son propre ensemble de bibliothèques
et d'outils).

## 2. Le contrat

Le contrat dit ce que chaque endpoint prend et rend, et qui peut l'appeler. C'est un package à lui (un dossier de
fichiers Cesia groupés sous un nom), qui n'utilise que `std/check` et l'`api` de Centauri. Ainsi une page le lit aussi
(en WebAssembly, le code compilé que le navigateur exécute) et vérifie un formulaire avec les mêmes formes que le
serveur :

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/auth
use std/dict
use std/list
use std/result
use std/text
use std/json
Balance = json.Parse("{}")!
Kinds = json.Parse("{}")!
Rules = json.Parse("{}")!
balance = json.Parse("{}")!
deleteClient = json.Parse("{}")!
e = json.Parse("{}")!
editClient = json.Parse("{}")!
emailTaken = json.Parse("{}")!
invoices = json.Parse("{}")!
keep = json.Parse("{}")!
office = json.Parse("{}")!
taken = json.Parse("{}")!
```

```cesia norun
(* src/invoices/endpoints/endpoints.ce *)
use deps/www-celestial/centauri/src/api
use std/check

ClientIn = check.Record({Name: check.Text(1, 120), Email: check.Email(), City: check.Text(0, 80, optional = true, default = "")})
ClientOut = check.Record({Id: check.Id(), Name: check.Text(), Email: check.Email(), City: check.Text(), Overdue: check.Bool(optional = true)})

AddClient = api.Post("/clients", body = ClientIn, out = ClientOut, role = "admin")
Clients = api.Get("/clients", query = check.Record({Search: check.Text(0, 120, optional = true, default = ""),
  Sort: check.OneOf(["name", "city"], optional = true, default = "name")}), out = api.Page(ClientOut, 20), role = "admin")
Client = api.Get("/clients/:id", out = check.Record({Client: ClientOut, Balance: Balance}), role = "admin")
EditClient = api.Put("/clients/:id", body = ClientIn, out = ClientOut, role = "admin")
DeleteClient = api.Delete("/clients/:id", role = "admin")
```

Un endpoint est un record (une valeur faite de champs nommés) :
`AddClient` est `{Method: "POST", Path: "/clients", In: ClientIn, Out: ClientOut, Role:
"admin", Name: "POST /clients", ...}`, et `api.Post(...)` n'est que la manière courte de l'écrire. Son nom, la méthode
et le chemin, est unique et stable : le lien en direct des pages et le log (le journal où le serveur écrit chaque
requête) le nomment ainsi.

Ce qu'une forme fait de ce qui entre, avant que le handler le voie :

- chaque texte est de l'UTF-8 valide, sans caractère de contrôle, débarrassé des espaces du début et de la fin, de 1 à
  120 octets ici ; un e-mail est mis en minuscules ; un champ que l'expéditeur ajoute (`Admin: true`) est jeté ; un
  champ optionnel absent est là, avec sa valeur par défaut ;
- un champ faux donne un 422 (le code HTTP des champs invalides) avec chaque champ faux et son message, que la page
  montre à côté du champ.

```java
// Spring Boot: a DTO per direction, with Bean Validation
record ClientIn(@NotBlank @Size(max = 120) String name, @NotBlank @Email @Size(max = 254) String email, @Size(max = 80) String city) {}
record ClientOut(Long id, String name, String email, String city, Boolean overdue) {
  static ClientOut of(Client c) { return new ClientOut(c.id, c.name, c.email, c.city, c.overdue); }
}
```

## 3. Ce que garde la base de données

```cesia norun
(* src/invoices/kinds.ce *)
use deps/www-celestial/cepheus/cesia/cepheus
use deps/www-celestial/centauri/src/app

Client = app.Kind("client", {Tenant: cepheus.Link(), Name: cepheus.Text(), Search: cepheus.Text(), Email: cepheus.Text(),
  Key: cepheus.Text(unique = true), City: cepheus.Text(), Overdue: cepheus.Bool()})
```

`app.Kind` est un `cepheus.Kind` qui garde son nom et ses champs pour l'administration. `Tenant` relie chaque client à
son cabinet. `Key`, unique, est le cabinet et l'e-mail : deux clients d'un même cabinet n'ont donc jamais le même
e-mail, alors que deux cabinets le peuvent. Cepheus déclare au démarrage ce qui manque à la base : ajouter un champ ne
demande aucune migration (un programme qui change les données ou leur forme d'une version à l'autre).

```java
@Entity @Table(uniqueConstraints = @UniqueConstraint(columnNames = {"office_id", "email"}))
class Client {
  @Id @GeneratedValue Long id;
  @ManyToOne(optional = false) Office office;
  String name; String search; String email; String city; Boolean overdue;
}
interface ClientRepo extends JpaRepository<Client, Long> {
  Optional<Client> findByIdAndOfficeId(Long id, Long officeId);
}
// and V2__clients.sql for Flyway: CREATE TABLE client (...), its index and its constraint
```

## 4. Les handlers

Un handler est une fonction de la requête `r`, et de ce qui est entré, `x`, déjà vérifié. `r.User` est celui qui
demande (`Id`, `Tenant`, `Roles`), `r.Db` la base de données, `r.Why` ce qui écrit : la route (un endpoint et la
fonction qui y répond) et le numéro de la requête, gardés dans l'historique.

```cesia norun
(* src/invoices/clients.ce *)
fields(x, r) = {Name: x.Name, Search: text.Fold(x.Name), Email: x.Email, Key: "$(r.User.Tenant)/$(x.Email)", City: x.City}

defn addClient(r, x)
  made = cepheus.Insert(Client, dict.Put("Tenant", r.User.Tenant, fields(x, r)), r.Db, by = r.User.Id, why = r.Why)
  if taken(made) emailTaken() else app.Own(Client, made?, r) end
end

defn client(r)
  c = app.Own(Client, r.Params.id, r)?
  {Client: c, Balance: balance(c.Id, r.Db)?}
end
```

Chaque ligne qui compte :

- Le tenant vient de `r.User.Tenant`, jamais de la requête : un expéditeur ne peut pas écrire dans un autre cabinet.
- `app.Own(Client, id, r)` lit le client, et donne un 404 (le code HTTP « introuvable ») quand il est à un autre
  cabinet, ou qu'il n'existe pas. Un 404 et pas un 403 (le code « interdit ») : personne n'apprend qu'il existe. C'est
  le second mur des droits (OWASP A01, l'insecure direct object reference : un objet lu par son id sans vérifier à qui
  il est), et [Tests](testing.md) le prouve sur chaque endpoint.
- Le handler rend une valeur ; Centauri l'envoie à travers `ClientOut`, donc seuls ses champs sortent : `Tenant`,
  `Key` et `Search` ne sortent jamais (OWASP API3:2023, la broken object property level authorization : des champs
  d'un objet montrés à qui n'a pas le droit de les voir).
- Une erreur est un `Err` : `app.Fail(409, "Check the fields.", fields = {Email: "Another client has this e-mail."})`,
  ou une erreur de Cepheus transmise par `?` (un conflit devient un 409, une lecture refusée un 403, une base hors
  d'atteinte un 503, le code « service indisponible »). En HTTP, elle sort en Problem Details :

```json
{"type": "about:blank", "title": "Conflict", "status": 409, "detail": "Check the fields.",
 "instance": "urn:request:4f2a1c-1794528000", "errors": {"Email": "Another client has this e-mail."}}
```

Tout autre `Err`, et un bug, donne un 500 (le code « erreur du serveur ») qui ne dit au client que le numéro de sa
requête. Le log a le reste, et dans les profils dev et test (un profil est une manière de lancer l'app : dev, test ou
prod), le détail vient aussi.

```java
@RestController @RequestMapping("/clients") @PreAuthorize("hasRole('admin')")
class ClientController {
  private final ClientRepo clients; private final OfficeRepo offices;
  ClientController(ClientRepo c, OfficeRepo o) { clients = c; offices = o; }

  @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
  ClientOut add(@Valid @RequestBody ClientIn in, @AuthenticationPrincipal Principal u) {
    var c = new Client(); c.office = offices.getReferenceById(u.officeId()); c.name = in.name().trim();
    c.search = in.name().trim().toLowerCase(); c.email = in.email().toLowerCase(); c.city = in.city();
    try { return ClientOut.of(clients.saveAndFlush(c)); }
    catch (DataIntegrityViolationException e) { throw new ResponseStatusException(HttpStatus.CONFLICT, "Another client has this e-mail."); }
  }

  @GetMapping("/{id}") ClientView one(@PathVariable Long id, @AuthenticationPrincipal Principal u) {
    var c = clients.findByIdAndOfficeId(id, u.officeId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    return new ClientView(ClientOut.of(c), balances.of(c.id));
  }
}
// plus a @ControllerAdvice that turns MethodArgumentNotValidException into Problem Details with the fields
```

## 5. Une liste par pages

```cesia norun
defn clients(r, q)
  search = text.Fold(q.Search)
  cepheus.Find(6, (c, n, y, m, k, t) -> {
    Where: list.Concat([[c, Client.Tenant, r.User.Tenant], [c, Client.Name, n], [c, Client.City, y], [c, Client.Email, m]],
      if search == "" [] else [[c, Client.Search, k], cepheus.Or(cepheus.Prefix(k, search), cepheus.Prefix(m, search))] end),
    Give: {Id: c, Name: n, City: y, Email: m}, Sort: if q.Sort == "city" [y, n, c] else [n, c] end, Limit: r.Limit, After: r.After}, r.Db)
end
```

La sortie de l'endpoint est `api.Page(ClientOut, 20)` : le handler rend ses lignes, au plus `r.Limit` (21) après
`r.After`, et Centauri fait la page, `{Rows, After}`. `After` est le curseur de la page suivante (la marque de
l'endroit où elle reprend), demandée avec `?After=`. C'est la dernière ligne, scellée (chiffrée et authentifiée par
XSalsa20-Poly1305 sous la clé de l'app) avec l'endpoint et le tenant. Ce curseur ne montre donc rien de la ligne, ne
peut pas être fait à la main, et ne sert dans aucune autre liste (un 400, le code « requête invalide »). Une page est
lue après une ligne, jamais par un offset (un décalage : sauter les n premières lignes) : la millième page coûte autant
que la première, et un client ajouté entre deux pages n'en déplace aucune. La recherche est un préfixe du nom replié
par `text.Fold` (mis sans majuscules, à la façon d'Unicode : Élodie et ÉLODIE donnent le même texte), ou de l'e-mail.

```java
@GetMapping PageOut<ClientOut> list(@RequestParam Optional<String> search, @RequestParam Optional<String> after, @AuthenticationPrincipal Principal u) {
  Specification<Client> spec = (root, q, cb) -> { /* office, prefix of search or e-mail, after the cursor's name and id */ };
  var rows = clients.findAll(spec, PageRequest.of(0, 20, Sort.by("name", "id"))).map(ClientOut::of).getContent();
  return new PageOut<>(rows, rows.size() == 20 ? encode(rows.get(19)) : null);   // a cursor to sign by hand, or a page number (an offset)
}
```

## 6. Le module et l'app

```cesia norun
(* src/invoices/module.ce *)
Roles = {owner: ["admin"], admin: ["accountant"], accountant: []}

Module = app.Module("invoices", kinds = Kinds, rules = Rules, start = keep, serve = [
  app.Serve(e.AddClient, addClient), app.Serve(e.Clients, clients), app.Serve(e.Client, client), app.Serve(e.EditClient, editClient),
  app.Serve(e.DeleteClient, deleteClient), (* ... *)])

App = app.Of([auth.Module(), Module], name = "invoices", roles = Roles, defaults = {MemberRoles: "accountant"})

(* src/main.ce *)
app.Run(invoices.App)
```

Les rôles sont une table : chacun avec les rôles qu'il inclut, si bien qu'un owner est aussi un admin et un
accountant. Un endpoint dont le rôle n'est pas dans la table arrête le démarrage : un rôle mal écrit (`"acountant"`)
n'ouvre jamais une route. Le premier mur des droits est le rôle sur l'endpoint : sans session (le temps où un
utilisateur reste connecté), un 401 (le code « non authentifié ») ; sans le rôle, un 403 ; et cela avant le handler.

`cesia do serve` la démarre. `APP_PROFILE=dev` (le défaut) sans `APP_CEPHEUS_URL` garde la base de données en
mémoire, pour un premier essai :

```text
$ cesia do serve
{"level":"info","message":"ready","App":"invoices","Profile":"dev","Port":8080,"Ms":31.4}
$ curl -s localhost:8080/clients
{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in first.",...}
```

## 7. OpenAPI

Dans les profils dev et test, `/openapi.json` est la description OpenAPI 3.2 de chaque endpoint, faite à partir des
contrats : les chemins, les paramètres, les corps et les réponses en JSON Schema (le format standard qui dit ce qu'un
JSON doit être), le curseur des pages, le rôle (`x-role`) et le cookie (un petit texte que le navigateur garde et
renvoie à chaque requête) de la session. Un programme d'un autre langage en tire son client ; nos pages n'en ont pas
besoin, elles lisent le contrat lui-même. Elle disparaît en prod, avec les détails des erreurs.

```cesia
use deps/www-celestial/centauri/src/api
use std/check
Add = api.Post("/clients", body = check.Record({Name: check.Text(1, 120)}), out = check.Record({Id: check.Id()}), role = "admin")
doc = api.OpenApi([Add], title = "invoices")
doc.paths["/clients"].post.requestBody.content["application/json"].schema.properties.Name --> {type: "string", minLength: 1, maxLength: 120}
doc.paths["/clients"].post["x-role"] --> "admin"
```

## 8. Ses tests

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/auth
use std/dict
use std/list
use std/result
use std/text
use std/json
Balance = json.Parse("{}")!
Kinds = json.Parse("{}")!
Rules = json.Parse("{}")!
balance = json.Parse("{}")!
deleteClient = json.Parse("{}")!
e = json.Parse("{}")!
editClient = json.Parse("{}")!
emailTaken = json.Parse("{}")!
invoices = json.Parse("{}")!
keep = json.Parse("{}")!
office = json.Parse("{}")!
taken = json.Parse("{}")!
```

```cesia norun
defn isEmailUniqueInAnOffice()
  s = office()?
  again = s.Ada.Call(e.AddClient, {Name: "Other", Email: "ada@example.com"})
  elsewhere = s.T.SignUp({Email: "zoe@example.com", Password: "correct horse zoe", Name: "Zoé"})?.Call(e.AddClient, {Name: "Ada", Email: "ada@example.com"})
  again.Error.Status == 409 and again.Error.Fields.Email == "Another client has this e-mail." and result.IsOk(elsewhere)
end
```

`examples/invoices/tests/invoices.test.ce` les a tous (`isClientChecked`, `isClientsByPagesAndSearch`,
`isOfficesApart`, `isAccountantSeesInvoicesOnly`...) : une app en mémoire, sans serveur, sans Docker.
[Tests](testing.md) dit comment.
