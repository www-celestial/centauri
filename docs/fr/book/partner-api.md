# Une API pour un partenaire

La tâche : la société d'expertise comptable du cabinet d'Ada fait tourner chaque nuit un programme qui lit les factures
impayées. Ada lui donne une clé, avec le seul rôle accountant (comptable) : le programme lit et ajoute des factures, ne
supprime jamais un client, ne touche jamais à un compte, s'arrête à l'échéance de la clé, et il est refusé à sa requête
suivante dès qu'Ada la révoque. La société écrit son programme à partir du document OpenAPI de l'app (une app :
l'application, le serveur et ses pages ; son document OpenAPI la décrit dans un format standard, que des outils lisent),
avec un client généré pour son langage. Le code est `src/auth/keys.ce`, les contrats `src/api/keys.ce` (un contrat : ce
qu'un endpoint prend, ce qu'il rend et le rôle qu'il demande, lu par le serveur et par les pages ; un endpoint est une
adresse de l'API avec sa méthode HTTP, comme `POST /clients`), la porte (ce que Centauri vérifie à l'entrée de chaque
requête) dans `src/app/serve.ce` et les limites dans `src/app/state.ce` ; les tests sont `tests/keys.test.ce` et
`tests/people.test.ce` ; l'app des factures le fait dans `examples/invoices/tests/l3.test.ce`
(`isPartnerApiWithItsKey`).

Ce qui est utilisé : les clés de programme (une *API key* : un secret qu'un programme envoie à la place de la session
d'une personne ; une session est le temps où un utilisateur reste connecté), les endpoints `NewKey`, `Keys`,
`RevokeKey`, `AdminKeys` et `AdminRevokeKey`, le header `Authorization: Bearer` (un header : une ligne d'en-tête de la
requête HTTP), le réglage `KeyLimit`, le document OpenAPI et son schéma de sécurité `key`, et openapi-generator.

## 1. Une clé, créée par un admin

```text
POST /auth/keys {Name: "Partner's program", Roles: ["accountant"], Days: 365}   (role admin)
-> {"Id": 65601, "Key": "65601.9f2c...e0a1", "Ends": "2027-11-13T00:00:00Z"}
```

- Un admin du tenant (un client de la plateforme, comme un cabinet ou une entreprise, avec ses données à lui) crée une
  clé de son tenant, avec **certains de ses propres rôles** : un rôle qu'il n'a pas est un `403` « Only who has the role
  owner gives it or takes it. », un rôle que l'app n'a pas un `422` (`isKeyBoundToItsRoles`).
- `Key` a la forme du cookie d'une session (un cookie : un petit texte que le navigateur garde et renvoie à chaque
  requête), `id.secret` : `id` est sa chose (*thing* dans le code) dans Cepheus, `secret` 32 octets aléatoires tirés du
  noyau, en hexadécimal. Elle n'est montrée que cette fois. La base de données ne garde que le BLAKE2b du secret
  (`centauri_key`), un hash (une empreinte : un nombre calculé à partir d'un texte, d'où on ne peut pas revenir au
  texte), jamais le secret en clair : une copie de la base de données n'ouvre rien (`isKeyMadeShownOnceAndUsed`,
  `isKeyOfTheDatabaseUseless`).
- `Days`, de 1 à 3 650, lui donne une fin ; sans lui, elle ne finit jamais.
- Sa création est un événement (`key` : « Key 65601 made, Partner's program, roles [accountant]. »), qui ne contient
  jamais son secret.

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/api
use deps/www-celestial/centauri/src/apptest
use std/json
use std/value
ada = json.Parse("{}")!
e = json.Parse("{}")!
invoices = json.Parse("{}")!
lines = json.Parse("{}")!
```

```cesia norun
defn isPartnerApiWithItsKey()
  t = apptest.Start(invoices.App)?
  a = t.SignUp(ada)?
  client = a.Call(e.AddClient, {Name: "Client 1", Email: "c1@example.com"})?
  a.Call(e.AddInvoice, {Client: client.Id, Date: "2026-11-01", Due: "2026-12-01", Lines: lines})?
  key = a.Call(api.NewKey, {Name: "Partner's program", Roles: ["accountant"], Days: 365})?
  h = [{Name: "authorization", Value: "Bearer $(key.Key)"}]
  listed = t.Raw("GET", "/invoices?Unpaid=true", headers = h)
  deleted = t.Raw("DELETE", "/clients/$(client.Id)", headers = h)
  doc = json.Parse(t.Raw("GET", "/openapi.json").Body)?
  op = doc.paths["/invoices"].get
  listed.Status == 200 and value.Len(json.Parse(listed.Body)?.Rows) == 1 and deleted.Status == 403 and doc.components.securitySchemes.key.scheme == "bearer" and
    {key: []} in op.security and op["x-role"] == "accountant"
end
```

L'app des factures ne change rien à son code pour cela : le module des comptes sert les clés, et la porte les lit.

```java
// Spring Boot: no keys of programs in Spring Security; a filter of your own and a table of hashed keys (a sketch),
// or OAuth 2.0's client credentials with an authorization server (Spring Authorization Server) and
// spring-boot-starter-oauth2-resource-server for the app
class KeyFilter extends OncePerRequestFilter {
  protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
    var h = req.getHeader("Authorization");
    if (h != null && h.regionMatches(true, 0, "Bearer ", 0, 7)) {
      keys.check(h.substring(7)).ifPresent(k -> SecurityContextHolder.getContext().setAuthentication(new KeyAuthentication(k)));
    }
    chain.doFilter(req, res);
  }
}
```

## 2. Le programme l'envoie

```sh
curl -s -H "Authorization: Bearer $INVOICES_KEY" "https://invoices.example/invoices?Unpaid=true"
```

La porte lit une clé comme elle lit une session : sa chose par son id, un hash du secret, une comparaison en un temps
qui ne laisse rien deviner ; aucune recherche par la valeur du secret. Le schéma est lu en majuscules comme en
minuscules (`bearer`, RFC 9110), la clé fait 200 octets au plus. Alors la requête est celle d'un utilisateur, celui
qu'un handler (la fonction qui répond à une requête) voit dans `r.User` :

- `Id` est celui qui a créé la clé, qui écrit dans l'historique de Cepheus ; `Tenant` celui de la clé ; `Roles` ceux de
  la clé, chacun avec les rôles qu'il inclut, et seulement ceux que son créateur a encore dans le tenant ; `Super`
  faux ; `Key` l'id de la clé. Le *why* de chaque écriture (le texte qui dit pourquoi elle est faite) la nomme :
  `POST /invoices #4f2a1c-... key 65601`.
- Un navigateur envoie le cookie, un programme la clé : une requête avec le cookie d'une session est celle du
  navigateur, quoi qu'elle contienne d'autre ; une requête sans lui et avec `Authorization: Bearer` est celle d'un
  programme (`isCookieBeforeKey`).
- Sa dernière utilisation est gardée (`Last`), écrite au plus toutes les 5 minutes, dans une fiber à elle (une fiber :
  un des threads légers de Cesia).
- Ses requêtes comptent contre sa propre limite, `KeyLimit` par minute (600 ; une rafale d'un quart), à part de celle de
  son créateur ; les limites de l'adresse et du tenant tiennent aussi. Un programme qui boucle reçoit son `429`, et les
  gens du cabinet continuent (`isKeyLimitedApart`).

```text
$ curl -s -H "Authorization: Bearer $INVOICES_KEY" -X DELETE https://invoices.example/clients/65540
{"type":"about:blank","title":"Forbidden","status":403,"detail":"This is for the role admin.",...}
```

## 3. Ce qu'une clé ne peut pas faire

| une clé... | réponse | test |
|---|---|---|
| sur un endpoint d'un rôle qu'elle n'a pas | `403` « This is for the role admin. » | `isKeyBoundToItsRoles` ; invoices `isPartnerApiWithItsKey` |
| sur un endpoint des comptes (se déconnecter, les sessions, le mot de passe, les membres, créer une clé, `GET /auth/me`, lier un fournisseur, ou provider, comme Google) | `403` « A key of a program calls the app's endpoints, not those of the accounts. » | `isKeyNoPerson` |
| sur un endpoint des super-admins (les administrateurs de toute la plateforme, au-dessus des tenants) | `403` : une clé n'est jamais super | |
| après sa fin | `401` | `isKeyEnded` |
| après avoir été révoquée | `401`, dans ce processus tout de suite, dans les autres en moins de `APP_SESSION_CACHE` secondes (2) | `isKeyRevokedEverywhere` ; people `isKeysSeenAndRevokedBySuper` |
| copiée depuis la base de données (son hash), faite à la main, ou un cookie de session envoyé comme clé | `401` | `isKeyOfTheDatabaseUseless` |
| d'un tenant disparu | `401` | |

Une clé n'est pas une personne : elle ne déconnecte personne, ne change aucun mot de passe, ne crée aucune autre clé.
Elle ne fait jamais plus que ce que son créateur peut faire. Un créateur désactivé, ou sorti du tenant, met fin à ses
clés à leur requête suivante (une fois relues les sessions qu'un processus garde, au bout de `SessionCache` secondes) ;
un rôle qu'on lui retire les quitte aussi (`isKeyBoundToItsMaker`). Son secret n'est jamais dans un log (le journal où
le serveur écrit ses requêtes ; une ligne nomme la route, c'est-à-dire l'endpoint et la fonction qui y répond, jamais un
header) ni dans un événement (`isKeyNeverInLogsNorEvents`).

## 4. Révoquée

```text
GET    /auth/keys        -> the keys of the tenant, the newest first: Id, Name, Roles, By, Created, Ends, Last   (role admin)
DELETE /auth/keys/:id    -> 204; another tenant's key is a 404                                                  (role admin)
```

Une clé révoquée a ses faits retirés (les valeurs que Cepheus garde sur elle) : sa requête suivante est refusée, depuis
n'importe quel serveur (`isKeyRevokedEverywhere`). La liste ne montre jamais un secret. Un super-admin voit les clés de
chaque tenant, ou d'un seul, et révoque n'importe laquelle : `GET /admin/keys?Tenant=` et `DELETE /admin/keys/:id`, ou
la page Keys des [pages d'administration](admin.md) (une clé choisie dans le tableau, « Revoke key 65601 (Partner's
program) », confirmé d'abord). Chaque révocation est un événement, `key-revoked`.

## 5. Le document OpenAPI, et un client

Dans les profils dev et test, `/openapi.json` décrit chaque endpoint ([Votre première API](first-api.md#7-openapi)). Il
nomme deux façons d'appeler un endpoint qui demande une connexion, ses *security schemes* (ses schémas de sécurité) :
`session`, le cookie `__Host-sid`, et `key`, le header `Authorization: Bearer` :

```json
"components": {"securitySchemes": {
  "session": {"name": "__Host-sid", "in": "cookie", "type": "apiKey"},
  "key": {"type": "http", "scheme": "bearer", "description": "A key of a program, made by an admin of a tenant: Authorization: Bearer id.secret."}}}
"/invoices": {"get": {"operationId": "GET /invoices", "security": [{"session": []}, {"key": []}], "x-role": "accountant", ...}}
```

`x-role` est le rôle qu'un endpoint demande (`isOpenApiNamingKeys`) ; une clé qui a ce rôle l'appelle. Le document ne
liste `key` que sur les endpoints qu'une clé peut appeler : pas sur ceux des comptes ni sur ceux des super-admins, qui
refusent une clé (section 3 ; `isOpenApiNoKeyForAccounts`). Le document n'existe pas dans le profil prod : donnez au
partenaire le fichier d'un test ou du profil dev.

Un client pour le langage du partenaire en sort par [openapi-generator](https://openapi-generator.tech), un outil fait
par d'autres, que nos tests ne lancent pas : les commandes ci-dessous sont celles de sa documentation, et le document
est en OpenAPI 3.2.0, donc vérifiez que votre version du générateur le lit.

```sh
curl -s http://localhost:8080/openapi.json > invoices.json
npx @openapitools/openapi-generator-cli generate -i invoices.json -g python -o invoices-client            # Python
npx @openapitools/openapi-generator-cli generate -i invoices.json -g typescript-fetch -o invoices-client  # TypeScript
```

```python
# the partner's program, a sketch, not run: the generated package takes the key as a bearer token
import os, openapi_client
config = openapi_client.Configuration(host="https://invoices.example", access_token=os.environ["INVOICES_KEY"])
api = openapi_client.DefaultApi(openapi_client.ApiClient(config))
# each operation is named from its operationId ("GET /invoices"), as the generator spells names in Python
```

```java
// Spring Boot: springdoc-openapi makes the document; the scheme of a key is declared by hand
@SecurityScheme(name = "key", type = SecuritySchemeType.HTTP, scheme = "bearer")
@Configuration class OpenApiConfig {}
```

## 6. Contre quoi il protège

| menace | défense | test |
|---|---|---|
| une clé qui fuit dans un log ou dans un événement | aucun header dans une ligne de log ; les événements nomment l'id de la clé | `isKeyNeverInLogsNorEvents` |
| une clé copiée depuis la base de données | seulement son BLAKE2b, comparé en temps constant | `isKeyOfTheDatabaseUseless` |
| une clé utilisée au-delà de ses rôles | ses rôles pris parmi ceux de son créateur, vérifiés à chaque endpoint | `isKeyBoundToItsRoles` |
| une clé utilisée sur les comptes (pour déconnecter, changer un mot de passe, créer une clé) | refusée à la porte pour le module des comptes | `isKeyNoPerson` |
| une clé utilisée après sa fin | `Ends` lu à chaque requête | `isKeyEnded` |
| une clé utilisée après sa révocation | ses faits retirés ; les sessions qu'un processus garde oubliées tout de suite dans ce processus | `isKeyRevokedEverywhere`, people `isKeysSeenAndRevokedBySuper` |
| la clé d'un autre tenant vue ou révoquée | `app.Own` : un 404 | `isKeyRevokedEverywhere` |
| un programme qui inonde de requêtes | `KeyLimit` à part, et les limites de l'adresse et du tenant | `isKeyLimitedApart` |
| un cookie et une clé mêlés dans une requête | le cookie de la session décide ; la clé seulement sans lui | `isCookieBeforeKey` |

Suite : [Traduire l'app](languages.md).
