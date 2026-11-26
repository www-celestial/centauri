# Sign up and sign in

The task: someone makes an account for his office and becomes its owner; he invites an accountant, who signs up with
the invitation and joins the office; each signs in with his e-mail and password, sees his sessions, signs out of one or
of all; and nobody gets in by guessing, by a bot or from another site. On Centauri this is one line of the app,
`auth.Module()`, and settings; this chapter tells what it does, and how to change it. The code is `src/auth/`, its tests
`tests/auth.test.ce`, and the invoices use it in `examples/invoices`.

What it uses: Argon2id, sessions as a token cut in two, the `__Host-sid` cookie, tenants (many or one), sign-up open,
by invitation or closed, roles, signing out everywhere, limits, lockouts, proof of work, the trap field, CSRF, the
headers of security.

## 1. The module of the accounts

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/apptest
use deps/www-celestial/centauri/src/auth
use std/bug
use std/result
use std/value
use std/json
Roles = json.Parse("{}")!
ana = json.Parse("{}")!
invoices = json.Parse("{}")!
status = json.Parse("{}")!
```

```cesia norun
App = app.Of([auth.Module(), invoices.Module], name = "invoices", roles = Roles, defaults = {MemberRoles: "accountant"})
```

It serves the contract `api.Accounts` (package api, `src/api/auth.ce`), which a page reads as any other:

| endpoint | what it does |
|---|---|
| `POST /auth/signup` | makes an account and signs it in; in a multi-tenant app it makes its tenant too, and he owns it |
| `POST /auth/signin` | signs in: a session cookie comes back |
| `POST /auth/signout`, `/auth/signout-all` | ends this session, or every session of the user |
| `GET /auth/me`, `/auth/sessions`, `DELETE /auth/sessions/:id` | who is signed in, his sessions, ending one |
| `POST /auth/password` | a new password: the old one asked, the other sessions ended |
| `GET /auth/challenge` | a challenge of proof of work, when one is asked |
| `GET /auth/members`, `POST /auth/invites`, `PUT /auth/members/:id/roles`, `DELETE /auth/members/:id` | the members of the tenant, for its admins |
| `POST /auth/join`, `GET /auth/tenants`, `POST /auth/tenant` | taking an invitation with an account, the user's tenants, entering another |

An app that asks more at sign-up says so in its contract, `SignUp = api.SignUpOf({Phone: check.Text(6, 20)})`, gives it
to the module, `auth.Module(signUp = SignUp, facts = f)`, and `f(user, tenant, x)` gives the facts it writes in the
same group as the account: the account and the app's facts exist together, or neither.

```java
// Spring Boot: a SecurityFilterChain, a UserDetailsService, a PasswordEncoder, a controller of sign-up, Spring
// Session for more than one process, and the tables of users, roles and offices
@Bean SecurityFilterChain chain(HttpSecurity http) throws Exception {
  return http.authorizeHttpRequests(a -> a.requestMatchers("/auth/**").permitAll().anyRequest().authenticated())
    .formLogin(f -> f.loginProcessingUrl("/auth/signin")).logout(l -> l.logoutUrl("/auth/signout"))
    .sessionManagement(s -> s.sessionFixation().newSession())
    .csrf(c -> c.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())).build();
}
@Bean PasswordEncoder passwords() { return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8(); }
```

## 2. Passwords

A password is kept as its Argon2id hash only (RFC 9106; libsodium's settings: 64 MiB, 2 passes), about 65 ms of a core.
The hashes run on threads of their own, at most `APP_HASH_SLOTS` at once (2), each with 64 others waiting at most: a
flood of sign-ins takes a bounded memory, and gets 503 past it. A password has `APP_PASSWORD_MIN` to 128 bytes (12), and
no rule of composition (NIST SP 800-63B, 5.1.1.2, advises none). A login that doesn't exist is checked against a hash
of a random password, so it takes as long, and gets the same answer: the time and the words of a reply tell nobody
which accounts exist (`isUnknownLoginAnsweredAsAWrongPassword`).

## 3. Sessions

The cookie is `id.secret`: `id` the session's thing in Cepheus, `secret` 32 random bytes of the kernel. The database
keeps the BLAKE2b hash of the secret only, so a stolen copy of the database opens no session (`isNoSecretKept`). A
request reads the session by its id (in the program's memory), hashes the secret and compares in constant time: no
search by the secret's value, which a measure of time could learn.

Each process then keeps what it read, for `APP_SESSION_CACHE` seconds (2 by default, up to 60; 0 keeps nothing), in
the state that also counts its limits: the next requests of that session in those seconds read nothing from the
database, and their session and all their limits take one round trip to that state ([Speed](speed.md)). What it is
kept under is the BLAKE2b of the whole cookie: a lookup by it tells nothing of the secret by its time, and a cookie
made by hand, or a stolen id with another secret, is a cookie never seen, read from the database as before and
refused (`isForgedCookieNobodyBesideAKeptOne`). A cookie that names nobody is kept as nobody, so a browser that keeps
sending an ended session costs no read either. How long a change takes to be seen:

| a change | in the process that made it | in the other workers of `--workers`, or written straight to Cepheus |
|---|---|---|
| sign-out, sign-out everywhere, a session ended, a new password | at the next request | within `APP_SESSION_CACHE` seconds |
| a role given or taken, a member out, a user disabled or made super, by the routes of the accounts | at the next request | within `APP_SESSION_CACHE` seconds |
| the session's own end, idle or in all | exact: what is kept ends with it | exact |

A write of a signed-in user through the routes of the accounts forgets every session its process keeps, so the next
request of each reads its session again (`isRoleTakenSeenAtOnce`, `isSignedOutForGood`, `isRemovedMemberOut`,
`isDisabledBySuper`); a write that no route of the accounts made is seen when what was kept ends
(`isChangeOutsideSeenWithinSessionCache`). Spring Security keeps the roles of a session in the session from its
sign-in: there, a role taken holds from the user's next sign-in, unless the app ends his sessions itself.

```text
Set-Cookie: __Host-sid=65581.9f2c...e41a; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict; Secure
```

- `__Host-`: the browser insists on `Secure`, `Path=/` and no `Domain`, so no subdomain sets it. Over plain http (dev on
  another machine of the network) it is `sid`, without `Secure`.
- `HttpOnly`: no script of the page reads it (token theft by XSS); `SameSite=Strict`: no page of another site sends it.
- A session ends after `APP_SESSION_IDLE` seconds unseen (8 hours) and `APP_SESSION_MAX` in all (30 days); a new
  secret at each sign-in (no fixation of a session); signing out retracts it, so a stolen copy of the cookie is worth
  nothing after (`isSignedOutForGood`); a user disabled, or taken out of his tenant, is out at his next request.
- A native app keeps the same `id.secret` in the Keychain or Keystore and sends it in a `Cookie` header: one way.

Every request then has `r.User`: `{Id, Tenant, Member, Session, Roles, Super, Email, Name, Until}`, its roles with
every role they include, `Until` the time its session ends unless it is seen again.

## 4. Tenants, sign-up, invitations

| setting | values | what it does |
|---|---|---|
| `APP_TENANCY` | `multi` (default), `single` | many tenants, each made by its first owner; or one for everybody, whose first user owns it |
| `APP_SIGN_UP` | `open` (default), `invite`, `closed` | anyone signs up; only with an invitation; nobody (accounts made by an admin) |
| `APP_OWNER_ROLES`, `APP_MEMBER_ROLES` | roles, with commas | the roles of who makes a tenant (`owner`), and of who joins the one tenant (`member`) |
| `APP_INVITE_TIME` | seconds | how long an invitation lasts (a week) |

An admin of a tenant invites: `POST /auth/invites {Email, Roles}` gives a code once (only its hash is kept), for that
e-mail only; signing up with it, or `POST /auth/join` with an account, makes a member with those roles, once
(`isByInvitationOnly`). L2 sends it by mail.

Nobody gives or takes a role he hasn't himself: an admin makes no owner, and takes nothing from one; a tenant keeps one
owner at least (`isNoRaiseOfOwnRoles`).

```java
// Spring Boot: an Invitation entity, its repository, a controller that checks the token, the e-mail, the expiry,
// and a role hierarchy bean: RoleHierarchyImpl.fromHierarchy("owner > admin > accountant")
```

## 5. Against guessing and bots

| defense | setting (default) | what an attacker meets |
|---|---|---|
| limit of sign-ins per address | `APP_SIGN_IN_PER_IP` (20 a minute) | 429 with `Retry-After` |
| limit of sign-ups per address | `APP_SIGN_UP_PER_IP` (10 an hour) | 429 |
| new tenants an hour, for all | `APP_TENANTS_PER_HOUR` (100) | 429: no flood of tenants |
| lockout of a login | `APP_LOCK_AFTER` (5), `APP_LOCK_MOST` (900 s) | after 5 failures in a row, a wait of 1 s, then 2, 4... up to 15 minutes, for every address; the right password waits too |
| proof of work | `APP_POW` (`attack`), `APP_POW_BITS` (18), `APP_POW_AFTER` (50) | under attack (50 failed sign-ins in the last minute, or 3 of this login), a 428 with a challenge: 2^18 hashes for the client, one for the server, an answer serving once |
| trap field | `APP_HONEYPOT` (`Website`) | a sign-up whose hidden field is filled is refused, and is an event `bot` |
| limits of every request | `APP_LIMIT_IP` (600), `APP_LIMIT_USER` (1200), `APP_LIMIT_TENANT` (6000) a minute | 429 |

The failures of a login are counted in Cepheus, so every worker sees them; the limits are counted in each process's
memory (GCRA, one number a key: 600 a minute is 600 a minute in each of `--workers 4`). The lockout delays rather than
locks, so an attacker who tries a victim's login can't keep him out for long, and each try costs him a proof of work
once the attack is seen.

Proof of work, the client's side, when a sign-in answers 428:

```text
1. GET /auth/challenge, or the challenge of the 428: {"Challenge": "1794528600.18.9c41...e0.5d2f...", "Bits": 18}
2. find a nonce n such that BLAKE2b-256("<challenge>.<n>") starts with 18 bits at zero
3. send again, with "Proof": "<challenge>:<n>"
```

`auth.Solve(challenge, keys)` does step 2 in Cesia, for a test or a program; a page does it in WebAssembly.

## 6. Other sites, and the headers

- A request that changes something from a page of another site (`Sec-Fetch-Site: cross-site`, or an `Origin` other than
  `APP_ORIGIN`) gets a 403, and the session of its cookie is never read (CSRF). No token to carry in forms.
- A partner's page (an origin of `APP_CORS`) may read the answers, and asks before it writes (CORS preflight); it has no
  session (never credentials, never `*`).
- Every response has `Content-Security-Policy` (`APP_CSP`: no script but the app's own and its WebAssembly, no
  framing), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`, `Cache-Control: no-store`, and over https `Strict-Transport-Security` for two years.

## 7. Its tests

```cesia norun
defn isLockedAfterFailures()
  t = apptest.Start(App, settings = {LockAfter: "3"})?
  t.SignUp(ana)?
  codes = [status(t.SignIn("ana@example.com", "wrong password $k")) for k in 1..4]
  bug.Assert(value.Equal(codes, [401, 401, 401, 429]), "locked at the 4th: $codes")
  t.Advance(2)
  result.IsOk(t.SignIn("ana@example.com", "correct horse 12"))
end
```

`tests/auth.test.ce` holds one test per threat: guessing (`isLockedAfterFailures`), accounts found by their answer
(`isUnknownLoginAnsweredAsAWrongPassword`), proof of work replayed or forged (`isProofOfWorkAsked`), the attack seen
(`isProofOfWorkUnderAttack`), bots (`isBotTrapped`), floods (`isSignUpLimitedByAddressAndTenantsByHour`), a stolen
session (`isSignedOutForGood`, `isSessionIdleAndOld`, `isForgedCookieNobody`), secrets in the database or the logs
(`isNoSecretKept`), roles raised (`isNoRaiseOfOwnRoles`), a member out (`isRemovedMemberOut`), a user disabled
(`isDisabledBySuper`), what each process keeps of the sessions (`isRoleTakenSeenAtOnce`,
`isChangeOutsideSeenWithinSessionCache`, `isForgedCookieNobodyBesideAKeptOne`), and the settings of tenancy and sign-up
(`isSingleTenant`, `isByInvitationOnly`).
