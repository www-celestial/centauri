# An API for a partner

The task: the accounting firm of Ada's office runs a program each night that reads the unpaid invoices. Ada gives it a
key, with the role accountant only: the program reads and adds invoices, never deletes a client, never touches an
account, stops at the end of the key, and is refused at its next request once Ada revokes it. The firm writes its
program from the app's OpenAPI document, with a client generated for its language. The code is `src/auth/keys.ce`, the
contracts `src/api/keys.ce`, the door in `src/app/serve.ce` and the limits in `src/app/state.ce`; the tests are
`tests/keys.test.ce` and `tests/people.test.ce`; the invoices do it in `examples/invoices/tests/l3.test.ce`
(`isPartnerApiWithItsKey`).

What it uses: keys of programs (an *API key*: a secret a program sends instead of a person's session), the endpoints
`NewKey`, `Keys`, `RevokeKey`, `AdminKeys` and `AdminRevokeKey`, the header `Authorization: Bearer`, the setting
`KeyLimit`, the OpenAPI document and its scheme `key`, and openapi-generator.

## 1. A key, made by an admin

```text
POST /auth/keys {Name: "Partner's program", Roles: ["accountant"], Days: 365}   (role admin)
-> {"Id": 65601, "Key": "65601.9f2c...e0a1", "Ends": "2027-11-13T00:00:00Z"}
```

- An admin of the tenant makes a key of his tenant, with **some of his own roles**: a role he hasn't is a `403` "Only
  who has the role owner gives it or takes it.", a role the app doesn't have a `422` (`isKeyBoundToItsRoles`).
- `Key` has the form of a session's cookie, `id.secret`: `id` its thing in Cepheus, `secret` 32 random bytes of the
  kernel in hex. It is shown this once. The database keeps the BLAKE2b of the secret only (`centauri_key`), never in
  clear: a copy of the database opens nothing (`isKeyMadeShownOnceAndUsed`, `isKeyOfTheDatabaseUseless`).
- `Days`, 1 to 3,650, ends it; without, it never ends.
- Its making is an event (`key`: "Key 65601 made, Partner's program, roles [accountant]."), which never holds its
  secret.

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

The invoices change nothing in their code for it: the module of the accounts serves the keys, and the door reads them.

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

## 2. The program sends it

```sh
curl -s -H "Authorization: Bearer $INVOICES_KEY" "https://invoices.example/invoices?Unpaid=true"
```

The door reads a key as it reads a session: its thing by its id, a hash of the secret, a comparison in a time that
tells nothing; no search by the value of the secret. The scheme is read in any case (`bearer`, RFC 9110), the key
200 bytes at most. Then the request is a user's, the one a handler sees in `r.User`:

- `Id` the key's maker, who writes in the history of Cepheus; `Tenant` the key's; `Roles` the key's, each with the
  roles it includes, and only those its maker still has in the tenant; `Super` false; `Key` the key's id. The *why* of each write names it: `POST /invoices #4f2a1c-...
  key 65601`.
- A browser sends the cookie, a program the key: a request with the cookie of a session is the browser's, whatever
  else it holds; one without it and with `Authorization: Bearer` is a program's (`isCookieBeforeKey`).
- Its last use is kept (`Last`), written at most every 5 minutes, in a fiber of its own.
- Its requests count against its own limit, `KeyLimit` a minute (600; a burst of a quarter), apart from its maker's;
  the limits of the address and of the tenant hold too. A program that loops gets its `429`, and the people of the
  office go on (`isKeyLimitedApart`).

```text
$ curl -s -H "Authorization: Bearer $INVOICES_KEY" -X DELETE https://invoices.example/clients/65540
{"type":"about:blank","title":"Forbidden","status":403,"detail":"This is for the role admin.",...}
```

## 3. What a key may not do

| a key... | answer | test |
|---|---|---|
| on an endpoint of a role it hasn't | `403` "This is for the role admin." | `isKeyBoundToItsRoles`; invoices `isPartnerApiWithItsKey` |
| on an endpoint of the accounts (sign out, sessions, password, members, make a key, `GET /auth/me`, link a provider) | `403` "A key of a program calls the app's endpoints, not those of the accounts." | `isKeyNoPerson` |
| on an endpoint of the super-admins | `403`: a key is never super | |
| past its end | `401` | `isKeyEnded` |
| after it was revoked | `401`, in this process at once, in the others within `APP_SESSION_CACHE` seconds (2) | `isKeyRevokedEverywhere`; people `isKeysSeenAndRevokedBySuper` |
| copied from the database (its hash), made by hand, or a session's cookie sent as a key | `401` | `isKeyOfTheDatabaseUseless` |
| of a tenant gone | `401` | |

A key is no person: it signs nobody out, changes no password, makes no other key. It never does more than its maker
may: a maker disabled, or taken out of the tenant, ends his keys at their next request (once the sessions a process
keeps are read again, `SessionCache` seconds); a role taken from him leaves them too (`isKeyBoundToItsMaker`). Its
secret is never in a log (a line names the route, never a header) nor in an event (`isKeyNeverInLogsNorEvents`).

## 4. Revoked

```text
GET    /auth/keys        -> the keys of the tenant, the newest first: Id, Name, Roles, By, Created, Ends, Last   (role admin)
DELETE /auth/keys/:id    -> 204; another tenant's key is a 404                                                  (role admin)
```

A key revoked has its facts retracted: its next request is refused, from any server (`isKeyRevokedEverywhere`). The
list never shows a secret. A super-admin sees the keys of every tenant, or of one, and revokes any of them: `GET
/admin/keys?Tenant=` and `DELETE /admin/keys/:id`, or the page Keys of [the admin pages](admin.md) (a key chosen in
the table, "Revoke key 65601 (Partner's program)", asked first). Each revocation is an event, `key-revoked`.

## 5. The OpenAPI document, and a client

In the profiles dev and test, `/openapi.json` describes every endpoint ([Your first API](first-api.md#7-openapi)).
It names two ways to call one that needs a sign-in, its *security schemes*: `session`, the cookie `__Host-sid`, and
`key`, the header `Authorization: Bearer`:

```json
"components": {"securitySchemes": {
  "session": {"name": "__Host-sid", "in": "cookie", "type": "apiKey"},
  "key": {"type": "http", "scheme": "bearer", "description": "A key of a program, made by an admin of a tenant: Authorization: Bearer id.secret."}}}
"/invoices": {"get": {"operationId": "GET /invoices", "security": [{"session": []}, {"key": []}], "x-role": "accountant", ...}}
```

`x-role` is the role an endpoint needs (`isOpenApiNamingKeys`); a key with that role calls it. The document lists
`key` only on the endpoints a key may call: not on those of the accounts nor of the super-admins, which refuse a key
(section 3; `isOpenApiNoKeyForAccounts`). The document is gone in prod: give the partner the file of a test or of dev.

A client for the partner's language comes from it by [openapi-generator](https://openapi-generator.tech), a tool of
others, which our tests don't run: the commands below are its documented ones, and the document is OpenAPI 3.2.0, so
check that your version of the generator reads it.

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

## 6. What it defends against

| threat | defense | test |
|---|---|---|
| a key leaked in a log or an event | no header in a log line; the events name the key's id | `isKeyNeverInLogsNorEvents` |
| a key copied from the database | its BLAKE2b only, compared in constant time | `isKeyOfTheDatabaseUseless` |
| a key used past its roles | its roles some of its maker's, checked at each endpoint | `isKeyBoundToItsRoles` |
| a key used on the accounts (to sign out, change a password, make a key) | refused at the door for the module of the accounts | `isKeyNoPerson` |
| a key used past its end | `Ends` read at each request | `isKeyEnded` |
| a key used after it was revoked | its facts retracted; the sessions a process keeps forgotten at once there | `isKeyRevokedEverywhere`, people `isKeysSeenAndRevokedBySuper` |
| another tenant's key seen or revoked | `app.Own`: a 404 | `isKeyRevokedEverywhere` |
| a program that floods | `KeyLimit` apart, and the limits of the address and of the tenant | `isKeyLimitedApart` |
| a cookie and a key mixed in one request | the session's cookie decides; the key only without one | `isCookieBeforeKey` |

Next: [Translate the app](languages.md).
