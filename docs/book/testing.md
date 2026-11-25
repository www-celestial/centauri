# Tests without a server or Docker

The task: test the invoices as a page uses them, with accounts, offices and roles, in milliseconds, and prove three
things of the whole app that no one writes by hand for each endpoint: no office reads another's data, no input makes a
500, no change breaks a client. The code is `src/apptest/`, its tests `tests/apptest.test.ce`.

## 1. An app in memory

```
defn office()
  t = apptest.Start(invoices.App, now = now)?
  ada = t.SignUp({Email: "ada@example.com", Password: "correct horse battery", Name: "Ada", Tenant: "Martin & Co"})?
  am = ada.Call(e.AddClient, {Name: "Ada Martin", Email: "Ada@Example.com", City: "Lyon"})?
  ...
end

defn isPaidOnce()
  s = office()?
  paid = s.Ada.Call(e.Pay, {id: s.One.Id})?
  s.Ada.Call(e.Pay, {id: s.One.Id}).Error.Status == 409
end
```

- `apptest.Start(app)` runs the app on a fork of Cepheus's `Empty` with its kinds and rules: nothing to start, nothing
  shared between tests, any order. It is the profile test, proof of work off and the limits wide, which a test sets
  back: `apptest.Start(App, settings = {LockAfter: "3"})`.
- `t.SignUp(x)`, `t.SignIn(email, password)`, `t.Anyone()`, `t.Super()` give clients; `c.Call(endpoint, x)` calls an
  endpoint of the contract, the parameters of its path taken from `x` by their names, the rest its query or its body; it
  gives an `Ok` of the answer, or an `Err` of `{Status, Message, Fields, Problem}`. `c.Send` gives the response itself
  (its headers, its body), `c.Raw(method, path, body, headers)` any request.
- `t.As(u, roles)` gives roles, `t.Make(u, kind, fields)` writes a thing of u's tenant straight, `t.Advance(seconds)`
  moves the clock (sessions that end, lockouts that pass), `t.Db` is the fork.

```java
// Spring Boot: @SpringBootTest with @AutoConfigureMockMvc, Testcontainers to start PostgreSQL in Docker (seconds),
// @WithMockUser for the roles, and a @Sql or a builder for the data of each test
@SpringBootTest @AutoConfigureMockMvc @Testcontainers
class InvoiceTests {
  @Container static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:18");
  @Autowired MockMvc mvc;
  @Test @WithMockUser(roles = "accountant") void paidOnce() throws Exception {
    mvc.perform(post("/invoices/1/pay").with(csrf())).andExpect(status().isOk());
    mvc.perform(post("/invoices/1/pay").with(csrf())).andExpect(status().isConflict());
  }
}
```

## 2. Isolated: no tenant reads another's

```
isIsolated() = apptest.Isolated(invoices.App)?
```

Two offices, A and B. A is filled with things marked `zqa`: of each kind of the app that has a `Tenant` (written
straight), and made by every POST and PUT of the app as A's owner. Then B's owner, with every role of the app, calls
every endpoint, with the ids of A's things in its paths and its inputs. It fails if any answer holds a mark of A, or if
any of A's things changed. A property test (QuickCheck, Claessen and Hughes 2000) of the access control, OWASP's A01,
on every endpoint, those added tomorrow too. `tests/apptest.test.ce` gives it an app with the bug it must catch: a
route that reads the thing of its path with `cepheus.Get` and no `app.Own` (`isLeakCaught`).

## 3. Fuzz: no input makes a 500

```
isFuzzed() = apptest.Fuzz(invoices.App, cases = 2)?
```

Every endpoint, called by a user with every role (and a super-admin for the administration), with good inputs drawn
from its shapes, the same at the edges of their bounds (each field at its lowest and its highest), and broken ones:
wrong types, texts of 5,000 bytes, control characters, bad UTF-8, injections of SQL, HTML and formulas, nested lists,
ids out of range, paths with `..`, bodies that are no JSON. It fails on any 500. `isCrashCaught` gives it a handler
that fails on the highest value its shape allows.

## 4. Surface: no change breaks a client

```
isSurfaceKept() = apptest.Surface(invoices.App, ".cesia/surface.json")?
```

The surface is what clients rely on, read from the OpenAPI: each endpoint, its parameters, the fields of its body and
of its answer. The first run writes it; each run after compares: an endpoint taken away, a field of an answer taken
away or of another type, a parameter or a field of a body now required, fails; whatever only adds passes. A change that
must break becomes a new endpoint (`/v2/...`) while the old one stays. At a release, `apptest.Surface(App, path,
update = true)` writes the new one, kept in the repository.

## 5. The rest

- Cesia's own tools work on an app as on any program: `cesia run --watch` for a server that takes each change of its
  code, `cesia run --repl` for a console.
- The pages, in Firefox, by [Ceti](https://www-celestial.github.io/ceti/), against a real server: with Ceres, in L2.
