# Security

Each threat of the OWASP Top 10:2025, and the others an app of accounts and tenants meets, with Centauri's defense, on
by default, and the test that proves it. The tests are in `src/app/app.test.ce` (app), `tests/auth.test.ce` (auth),
`tests/apptest.test.ce` (apptest) and `examples/invoices/tests/invoices.test.ce` (invoices).

| threat | defense | test |
|---|---|---|
| **A01** broken access control: another's data read or changed by its id (IDOR) | the role on the endpoint (401, 403); the tenant from `r.User`, never from the request; `app.Own` (404, never 403); the output through its shape | `apptest.Isolated` on every endpoint, and it catching a route without `app.Own` (apptest `isLeakCaught`); invoices `isOfficesApart`, `isAccountantSeesInvoicesOnly`; app `isMadeOwnedAndNumbered` |
| roles raised by who has them not | nobody gives or takes a role he hasn't; a tenant keeps an owner; a role written wrong in a contract stops the start | auth `isNoRaiseOfOwnRoles`; app `isRoleWrittenWrongRefused`, `isRoleChecked` |
| fields that leak (API3:2023) or that a sender adds | `check.Out` sends the declared fields only; `check.Read` drops the others | app `isOutputFilteredAndErrorsHidden`, `isMadeOwnedAndNumbered`; std/check `isInvoiceRead` |
| **A02** security misconfiguration | three fixed profiles; prod refuses to start without https, a secret and a database, naming each; headers on every response; no OpenAPI nor detail of errors in prod | app `isSecurityHeaders`, `isOpenApiInTestOnly`, `isOutputFilteredAndErrorsHidden`; the example of `Read` in prod |
| **A03** supply chain | no package of others: Centauri, Cesia, Cepheus are ours; `deps/` checked file by file by `cesia.lock`; libsodium and OpenSSL, fuzzed by their projects | Cesia refuses a file whose fingerprint differs from `cesia.lock` |
| **A04** cryptographic failures | Argon2id; BLAKE2b of session secrets, compared in constant time; cursors sealed (XSalsa20-Poly1305) under a key for each endpoint and tenant, challenges under HMAC-SHA-256; the kernel's randomness; no algorithm chosen by the client (no JWT) | auth `isNoSecretKept`, `isForgedCookieNobody`; app `isPagedBySealedCursors`, `isCursorOfBeforeRead` |
| **A05** injection | a question of Cepheus is a structure, its values never code; JSON in, JSON out; a CSV cell that starts with `=`, `+`, `-`, `@` gets a `'` | `apptest.Fuzz` with SQL, HTML and formulas; invoices `isCsvOfTheFilter` |
| **A06** insecure design | writes with `Expect`, numbers with `Incr` in the group, `unique`; no transaction open between two requests; a GET only reads | invoices `isPaidOnceAtTheSameMoment`, `isNumberedInOrderAtOnce`; app `isGetThatWritesRefused` |
| **A07** authentication failures | sessions cut in two, `__Host-`, `HttpOnly`, `SameSite=Strict`, a new one at each sign-in; failures counted and delays that double; the same answer and time for an unknown login; sessions that end; sign-out for good; the sessions a process keeps (`APP_SESSION_CACHE`, 2 s) kept under the BLAKE2b of their cookie, forgotten at once by a write of the accounts in that process, seen within those seconds elsewhere | auth `isLockedAfterFailures`, `isUnknownLoginAnsweredAsAWrongPassword`, `isSignedOutForGood`, `isSessionIdleAndOld`, `isForgedCookieNobody`, `isPasswordChanged`, `isDisabledBySuper`, `isRoleTakenSeenAtOnce`, `isChangeOutsideSeenWithinSessionCache`, `isForgedCookieNobodyBesideAKeptOne` |
| **A08** integrity failures | no deserialization of objects: JSON becomes values, then a shape; a cursor or a challenge made by hand is refused | app `isPagedBySealedCursors`; invoices `isBadCursorRefused`; auth `isProofOfWorkAsked` (forged) |
| **A09** logging and alerting failures | every write with who and why (Cepheus); sign-ins, failures, lockouts, refusals, invitations, roles as events; metrics of refusals; no secret, body, cookie or query in a log | auth `isEventsAndAdministration`, `isNoSecretKept` (the logs too) |
| **A10** exceptional conditions | errors are values, sent as Problem Details; a panic stops its fiber alone and answers 500 with no detail in prod; a deadline for each request | `apptest.Fuzz` (no 500), and it catching a handler that fails (apptest `isCrashCaught`) |
| cross-site request forgery | a write from another site refused, its cookie never read; SameSite=Strict | app `isOtherSiteRefused`; invoices `isOtherOriginRefused` |
| denial of service | limits per address (IPv6 by /64), user, tenant, endpoint, a request refused by its role counted too; the bounds of std/http (head, body, time, memory); password hashes in bounded slots; events of refusals written once a minute a key; the sessions kept bounded by count and by time | app `isLimited`; auth `isSignUpLimitedByAddressAndTenantsByHour` |
| bots | proof of work under attack, answers serving once; the trap field; new tenants capped an hour | auth `isProofOfWorkAsked`, `isProofOfWorkUnderAttack`, `isBotTrapped`, `isSignUpLimitedByAddressAndTenantsByHour` |
| token theft | no token in the page; the cookie unreadable by a script; a session ended is ended at once in its process, and within `APP_SESSION_CACHE` seconds (2) in the other workers | auth `isSignedOutForGood`, `isSessionsListedAndEnded`, `isChangeOutsideSeenWithinSessionCache` |
| API breaks (never break user space) | the surface compared at each test | `apptest.Surface`, and it catching what breaks (apptest `isSurfaceKept`) |

What L1 does not do yet: the third wall, a token of Cepheus per role that reads only its kinds (G16), for roles that
must never see some kinds (an outside accountant); multi-factor and passkeys (L3); checking a new password against the
lists of leaked ones; mail that answers a sign-up with an e-mail taken without saying it is taken (L2: until then the
sign-up says so, which the limits and proof of work slow down).
