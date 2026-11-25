# Your first API

The task: an office keeps its clients. An admin of the office adds one, lists them by pages with a search as he
types, opens one, changes it, deletes one that has no invoice; nobody of another office sees them, and an accountant
doesn't touch them. This chapter writes it on Centauri, step by step, and the same with Spring Boot 4 beside. The whole
code is `examples/invoices/src/invoices/` (clients.ce and endpoints/), and its tests `examples/invoices/tests/`.

What it uses: contracts (`api.Post`, `api.Get`, `api.Put`, `api.Delete`), shapes (`std/check`), the output filtered by
its shape, errors (`app.Fail`, Problem Details), pages by a cursor (`api.Page`), the tenant in every question and
`app.Own`, roles on the endpoints, OpenAPI.

## 1. The project

An app of Centauri is a Cesia project that takes Centauri and Cepheus in `deps/`:

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

Until both have tagged releases, Centauri's `tools/deps.sh examples/invoices` puts them in `deps/` and writes
`cesia.lock`, the fingerprint of every file, which Cesia checks before it loads one.

Spring Boot: a `pom.xml` with `spring-boot-starter-web`, `-data-jpa`, `-security`, `-validation`, the driver of
PostgreSQL and Flyway; then `application.yml` for the database.

## 2. The contract

The contract says what each endpoint takes and gives, and who may call it. It is a package of its own, which uses
`std/check` and Centauri's `api` only, so that a page reads it too (in WebAssembly) and checks a form with the same
shapes as the server:

```
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

An endpoint is a record: `AddClient` is `{Method: "POST", Path: "/clients", In: ClientIn, Out: ClientOut, Role:
"admin", Name: "POST /clients", ...}`, and `api.Post(...)` is only the short way to write it. Its name, the method and
the path, is unique and stable: the live link of the pages and the log name it so.

What a shape does to what comes in, before the handler sees it:

- every text is valid UTF-8 without control characters, trimmed, of 1 to 120 bytes here; an e-mail is in small
  letters; a field the sender adds (`Admin: true`) is dropped; an optional field left out is there as its default;
- a wrong field gives a 422 with each wrong field and its message, which the page shows beside the field.

```java
// Spring Boot: a DTO per direction, with Bean Validation
record ClientIn(@NotBlank @Size(max = 120) String name, @NotBlank @Email @Size(max = 254) String email, @Size(max = 80) String city) {}
record ClientOut(Long id, String name, String email, String city, Boolean overdue) {
  static ClientOut of(Client c) { return new ClientOut(c.id, c.name, c.email, c.city, c.overdue); }
}
```

## 3. What the database keeps

```
(* src/invoices/kinds.ce *)
use deps/www-celestial/cepheus/cesia/cepheus
use deps/www-celestial/centauri/src/app

Client = app.Kind("client", {Tenant: cepheus.Link(), Name: cepheus.Text(), Search: cepheus.Text(), Email: cepheus.Text(),
  Key: cepheus.Text(unique = true), City: cepheus.Text(), Overdue: cepheus.Bool()})
```

`app.Kind` is `cepheus.Kind` that keeps its name and fields for the administration. `Tenant` links each client to its
office; `Key`, unique, is the office and the e-mail, so two clients of an office never share an e-mail while two offices
may. Cepheus declares at the start what the database lacks: adding a field needs no migration.

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

## 4. The handlers

A handler is a function of the request `r`, and of what came in, `x`, already checked. `r.User` is who asks (`Id`,
`Tenant`, `Roles`), `r.Db` the database, `r.Why` what writes (the route and the request's number, kept in the history).

```
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

Each line that matters:

- The tenant comes from `r.User.Tenant`, never from the request: a sender can't write into another office.
- `app.Own(Client, id, r)` reads the client and gives a 404 when it is another office's, or not there. A 404 and not a
  403: nobody learns that it exists. This is the second wall of the rights (OWASP A01, the insecure direct object
  reference), and [Tests](testing.md) proves it on every endpoint.
- The handler gives a value; Centauri sends it through `ClientOut`, so only its fields leave: `Tenant`, `Key` and
  `Search` never do (OWASP API3:2023, the broken object property level authorization).
- An error is an `Err`: `app.Fail(409, "Check the fields.", fields = {Email: "Another client has this e-mail."})`, or
  one of Cepheus passed on by `?` (a conflict becomes 409, a denied read 403, a database out of reach 503). Over HTTP
  it leaves as Problem Details:

```json
{"type": "about:blank", "title": "Conflict", "status": 409, "detail": "Check the fields.",
 "instance": "urn:request:4f2a1c-1794528000", "errors": {"Email": "Another client has this e-mail."}}
```

Any other `Err`, and a bug, gives a 500 that tells the client only the number of its request; the log has the rest, and
in the profiles dev and test the detail comes too.

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

## 5. A list by pages

```
defn clients(r, q)
  search = text.Fold(q.Search)
  cepheus.Find(6, (c, n, y, m, k, t) -> {
    Where: list.Concat([[c, Client.Tenant, r.User.Tenant], [c, Client.Name, n], [c, Client.City, y], [c, Client.Email, m]],
      if search == "" [] else [[c, Client.Search, k], cepheus.Or(cepheus.Prefix(k, search), cepheus.Prefix(m, search))] end),
    Give: {Id: c, Name: n, City: y, Email: m}, Sort: if q.Sort == "city" [y, n, c] else [n, c] end, Limit: r.Limit, After: r.After}, r.Db)
end
```

The endpoint's out is `api.Page(ClientOut, 20)`: the handler gives its rows, at most `r.Limit` (21) after `r.After`,
and Centauri makes the page, `{Rows, After}`. `After` is the cursor of the next page, asked with `?After=`: the last
row, sealed (XSalsa20-Poly1305 under the app's key) with the endpoint and the tenant, so it shows nothing of the row,
can't be made by hand, and serves in no other list (a 400). A page is read after a row, never by an offset: the
thousandth page costs as the first, and a client added between two pages moves none of them. The search is a prefix
of the name folded by `text.Fold` (Élodie and ÉLODIE fold the same), or of the e-mail.

```java
@GetMapping PageOut<ClientOut> list(@RequestParam Optional<String> search, @RequestParam Optional<String> after, @AuthenticationPrincipal Principal u) {
  Specification<Client> spec = (root, q, cb) -> { /* office, prefix of search or e-mail, after the cursor's name and id */ };
  var rows = clients.findAll(spec, PageRequest.of(0, 20, Sort.by("name", "id"))).map(ClientOut::of).getContent();
  return new PageOut<>(rows, rows.size() == 20 ? encode(rows.get(19)) : null);   // a cursor to sign by hand, or a page number (an offset)
}
```

## 6. The module and the app

```
(* src/invoices/module.ce *)
Roles = {owner: ["admin"], admin: ["accountant"], accountant: []}

Module = app.Module("invoices", kinds = Kinds, rules = Rules, start = keep, serve = [
  app.Serve(e.AddClient, addClient), app.Serve(e.Clients, clients), app.Serve(e.Client, client), app.Serve(e.EditClient, editClient),
  app.Serve(e.DeleteClient, deleteClient), ...])

App = app.Of([auth.Module(), Module], name = "invoices", roles = Roles, defaults = {MemberRoles: "accountant"})

(* src/main.ce *)
app.Run(invoices.App)
```

The roles are a table: each with the roles it includes, so an owner is an admin and an accountant too. An endpoint
whose role is not in the table stops the start: a role written wrong (`"acountant"`) never opens a route. The first
wall of the rights is the role on the endpoint: without a session a 401, without the role a 403, before the handler.

`cesia do serve` starts it; `APP_PROFILE=dev` (the default) without `APP_CEPHEUS_URL` keeps the database in memory,
for a first try:

```text
$ cesia do serve
{"level":"info","message":"ready","App":"invoices","Profile":"dev","Port":8080,"Ms":31.4}
$ curl -s localhost:8080/clients
{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Sign in first.",...}
```

## 7. OpenAPI

In the profiles dev and test, `/openapi.json` is the OpenAPI 3.2 description of every endpoint, made from the
contracts: paths, parameters, bodies and answers as JSON Schema, the cursor of the pages, the role (`x-role`) and the
cookie of the session. A program of another language gets its client from it; our pages need none, they read the
contract itself. It is gone in prod, with the details of errors.

```cesia
use deps/www-celestial/centauri/src/api
use std/check
Add = api.Post("/clients", body = check.Record({Name: check.Text(1, 120)}), out = check.Record({Id: check.Id()}), role = "admin")
doc = api.OpenApi([Add], title = "invoices")
doc.paths["/clients"].post.requestBody.content["application/json"].schema.properties.Name --> {type: "string", minLength: 1, maxLength: 120}
doc.paths["/clients"].post["x-role"] --> "admin"
```

## 8. Its tests

```
defn isEmailUniqueInAnOffice()
  s = office()?
  again = s.Ada.Call(e.AddClient, {Name: "Other", Email: "ada@example.com"})
  elsewhere = s.T.SignUp({Email: "zoe@example.com", Password: "correct horse zoe", Name: "Zoé"})?.Call(e.AddClient, {Name: "Ada", Email: "ada@example.com"})
  again.Error.Status == 409 and again.Error.Fields.Email == "Another client has this e-mail." and result.IsOk(elsewhere)
end
```

`examples/invoices/tests/invoices.test.ce` has them all (`isClientChecked`, `isClientsByPagesAndSearch`,
`isOfficesApart`, `isAccountantSeesInvoicesOnly`...): an app in memory, no server, no Docker. [Tests](testing.md)
tells how.
