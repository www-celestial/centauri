# Des tests sans serveur ni Docker

La tâche : tester l'app (l'application, le serveur et ses pages) des factures comme une page s'en sert, avec des
comptes, des cabinets et des rôles, en quelques millisecondes. Et prouver trois choses de l'app entière, que personne
n'écrit à la main pour chaque endpoint (une adresse de l'API avec sa méthode HTTP, comme `POST /clients`) : aucun
cabinet ne lit les données d'un autre, aucune entrée ne fait un 500 (le code HTTP « erreur du serveur »), aucun
changement ne casse un client (un programme ou une page qui appelle l'API). Le code est dans `src/apptest/`, ses
tests dans `tests/apptest.test.ce`.

## 1. Une app en mémoire

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/apptest
use std/json
e = json.Parse("{}")!
invoices = json.Parse("{}")!
now = json.Parse("{}")!
```

```cesia norun
defn office()
  t = apptest.Start(invoices.App, now = now)?
  ada = t.SignUp({Email: "ada@example.com", Password: "correct horse battery", Name: "Ada", Tenant: "Martin & Co"})?
  am = ada.Call(e.AddClient, {Name: "Ada Martin", Email: "Ada@Example.com", City: "Lyon"})?
  (* ... *)
end

defn isPaidOnce()
  s = office()?
  paid = s.Ada.Call(e.Pay, {id: s.One.Id})?
  s.Ada.Call(e.Pay, {id: s.One.Id}).Error.Status == 409
end
```

- `apptest.Start(app)` fait tourner l'app sur un fork (une copie à part, qui part du même état) de l'`Empty` de
  Cepheus, avec ses kinds (les sortes de choses de la base de données, comme les factures ou les clients) et ses
  règles. Rien à démarrer, rien de partagé entre les tests, n'importe quel ordre. C'est le profil test (un profil est
  une manière de lancer l'app : dev, test ou prod), avec la preuve de travail coupée (proof of work : un petit calcul
  que le navigateur doit faire avant d'envoyer, qui coûte cher à un robot) et les limites larges (les limites sont le
  nombre de requêtes permis dans un temps donné). Un test les rétablit au besoin :
  `apptest.Start(App, settings = {LockAfter: "3"})`.
- `t.SignUp(x)`, `t.SignIn(email, password)`, `t.Anyone()`, `t.Super()` donnent des clients. `c.Call(endpoint, x)`
  appelle un endpoint du contrat (ce qu'un endpoint prend, ce qu'il rend et le rôle qu'il demande, lu par le serveur et
  par les pages) : les paramètres de son chemin sont pris dans `x` par leurs noms, et le reste fait sa query (les
  paramètres après le `?` de l'adresse) ou son corps. Il rend un `Ok` de la réponse, ou un `Err` de
  `{Status, Message, Fields, Problem}`. `c.Send` rend la réponse elle-même (ses headers, les en-têtes HTTP, et son
  corps), `c.Raw(method, path, body, headers)` n'importe quelle requête.
- `t.As(u, roles)` donne des rôles. `t.Make(u, kind, fields)` écrit directement une chose (*thing* dans le code) du
  tenant de u (un tenant est un client de la plateforme, comme un cabinet ou une entreprise, avec ses données à lui).
  `t.Advance(seconds)` avance l'horloge (des sessions, le temps où un utilisateur reste connecté, qui finissent ; des
  blocages qui passent). `t.Db` est le fork.

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

## 2. Isolement : aucun tenant ne lit les données d'un autre

```cesia norun
isIsolated() = apptest.Isolated(invoices.App)?
```

Deux cabinets, A et B. A est rempli de choses marquées `zqa` : de chaque kind de l'app qui a un `Tenant` (écrites
directement), et créées par chaque POST et chaque PUT de l'app en tant qu'owner (le propriétaire) de A. Puis l'owner
de B, avec tous les rôles de l'app, appelle chaque endpoint, avec les ids des choses de A dans ses chemins et ses
entrées. Le test échoue si une réponse contient une marque de A, ou si une chose de A a changé. C'est un test de
propriété (property test : un test qui vérifie une règle sur de nombreux cas, et non sur un seul exemple ; QuickCheck,
Claessen et Hughes 2000) du contrôle d'accès, l'A01 de l'OWASP, sur chaque endpoint, y compris ceux ajoutés demain.
`tests/apptest.test.ce` lui donne une app avec le bug qu'il doit attraper : une route (un endpoint et la fonction qui y
répond) qui lit la chose de son chemin avec `cepheus.Get`, sans `app.Own` (`isLeakCaught`).

## 3. Fuzz : aucune entrée ne fait un 500

```cesia norun
isFuzzed() = apptest.Fuzz(invoices.App, cases = 2)?
```

Le fuzz (un test qui envoie en masse des entrées tirées au hasard ou cassées) appelle chaque endpoint au nom d'un
utilisateur qui a tous les rôles (et d'un super-admin pour l'administration : l'administrateur de toute la plateforme,
au-dessus des tenants). Il envoie de bonnes entrées tirées de ses formes (une forme dit ce qu'une valeur
doit être : un texte de 1 à 120 octets, un nombre entier...), les mêmes à leurs bornes (chaque champ à sa plus petite
et à sa plus grande valeur), et des entrées cassées : de mauvais types, des textes de 5 000 octets, des caractères de
contrôle, de l'UTF-8 invalide, des injections de SQL, de HTML et de formules, des listes imbriquées, des ids hors des
bornes, des chemins avec `..`, des corps qui ne sont pas du JSON. Il échoue sur tout 500. `isCrashCaught` lui donne un
handler (la fonction qui répond à une requête) qui échoue sur la plus grande valeur que permet sa forme.

## 4. Surface : aucun changement ne casse un client

```cesia norun
isSurfaceKept() = apptest.Surface(invoices.App, ".cesia/surface.json")?
```

La surface est ce sur quoi les clients comptent, lue dans l'OpenAPI (la description standard de l'API HTTP, faite à
partir des contrats) : chaque endpoint, ses paramètres, les champs de son corps et de sa réponse. Le premier passage
l'écrit ; chaque passage suivant compare. Un endpoint retiré, un champ d'une réponse retiré ou d'un autre type, un
paramètre ou un champ d'un corps devenu obligatoire : le test échoue. Tout ce qui ne fait qu'ajouter passe. Un
changement qui doit casser devient un nouvel endpoint (`/v2/...`), et l'ancien reste. À une release (une version
publiée), `apptest.Surface(App, path,
update = true)` écrit la nouvelle surface, gardée dans le dépôt.

## 5. Le reste

- Les outils de Cesia marchent sur une app comme sur tout programme : `cesia run --watch` pour un serveur qui prend
  chaque changement de son code, `cesia run --repl` pour une console.
- Les pages, dans Firefox, par [Ceti](https://www-celestial.github.io/ceti/), contre un vrai serveur : avec Ceres, en
  L2.
