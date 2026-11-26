# Passkeys and two-factor

The task: the owners of an office must have a second factor. At her first sign-in, Ada sets up an app of codes on her
phone and keeps ten recovery codes; from then on her password alone opens nothing. Then she adds a passkey and signs
in with it alone, her phone checking her face. A phishing site that copies the page gets nothing it can use; a code
seen over her shoulder serves once; a lost phone is taken away by an admin. The code is `src/auth/passkeys.ce` and
`src/auth/second.ce`, the contracts `src/api/passkeys.ce` and `src/api/factors.ce`, the tests
`tests/passkeys.test.ce` and `tests/second.test.ce`; the invoices do it in `examples/invoices/tests/l3.test.ce`
(`isPasskeyAndTwoFactor`).

What it uses: passkeys (WebAuthn, *Web Authentication Level 3* of the W3C) and their two ceremonies; TOTP (RFC 6238)
and recovery codes; the second step of a sign-in and its ticket; the settings `Passkeys`, `PasskeyCheck`,
`PasskeyTime`, `PasskeyCounter`, `PasskeyOrigins`, `RpId`, `RpName`, `Passwords`, `TwoFactor`, `TwoFactorRoles`,
`Totp*` and `Step*`; in tests, `apptest.Device` and `t.SetUp`.

## 1. The settings

```sh
export APP_TWO_FACTOR_ROLES=owner      # the owners must have a second factor; super for the super-admins
```

| setting | values | what it does |
|---|---|---|
| `APP_TWO_FACTOR` | `off`, `optional` (the default), `required` | `optional`: a user turns TOTP on if he wants; `required`: everyone must; `off`: no TOTP at all |
| `APP_TWO_FACTOR_ROLES` | roles, with commas (none) | the roles that must have a second factor, `super` for the super-admins |
| `APP_TOTP_ALGORITHM`, `APP_TOTP_DIGITS`, `APP_TOTP_PERIOD`, `APP_TOTP_SKEW` | `SHA1`, 6, 30, 1 | the codes: `SHA1` or `SHA256`, 6 to 8 digits, 15 to 120 seconds a code, 0 to 3 codes before and after now taken; the defaults are what every app of codes reads |
| `APP_TOTP_ISSUER` | the app's name | the name the app of codes shows beside the account |
| `APP_STEP_TIME`, `APP_STEP_TRIES` | 300, 5 | how long the second step of a sign-in waits, and how many codes it takes |
| `APP_PASSKEYS` | `on` (the default), `off` | the passkeys' endpoints, or a 403 |
| `APP_PASSKEY_CHECK` | `required` (the default), `preferred`, `discouraged` | whether the device must verify its user (a face, a finger, a PIN): WebAuthn's `userVerification` |
| `APP_PASSKEY_TIME` | 300 | how long a ceremony waits, in seconds |
| `APP_PASSKEY_COUNTER` | `refuse` (the default), `allow` | a passkey whose counter goes back: refused, or only an event |
| `APP_PASSKEY_ORIGINS` | none | other origins a ceremony may come from, with commas (an app of Android, a site of the same relying party) |
| `APP_RP_ID`, `APP_RP_NAME` | the host of `APP_ORIGIN`, the app's name | the *relying party*, as the device knows the site: its id, which its passkeys are bound to, and its name |
| `APP_PASSWORDS` | `on` (the default), `off` | `off`: no sign-up nor sign-in by password, only passkeys and providers |

The codes of SHA-1 and the signatures of ES256, RS256 and PS256 are OpenSSL's: the app's tasks allow `ffi=crypto`, as
those of the invoices do. It is loaded once a process, at its first use; an app that uses none of them needs no such
permission.

```java
// Spring Boot: Spring Security's passkeys (6.4 and after, with com.webauthn4j:webauthn4j-core), from Spring's docs
http.webAuthn(w -> w.rpName("Invoices").rpId("invoices.example").allowedOrigins("https://invoices.example"));
// Spring Security 7 asks several factors as authorities (@EnableMultiFactorAuthentication, FactorGrantedAuthority);
// among them a password, a one-time token by mail (oneTimeTokenLogin) and a passkey; TOTP is a library's
```

## 2. A passkey: two calls a ceremony

A *passkey* is a pair of keys that the user's device keeps (iCloud Keychain, Google Password Manager, Windows Hello, a
security key). The server keeps only the public key: there is nothing in the database to steal, and nothing to type,
so nothing to give a phishing site. Each *ceremony* of WebAuthn is two calls: the server gives its options and a
ticket; the page hands the options to the browser, which asks the device; the page sends back what the device made,
with the ticket.

```js
// the page, a sketch in JavaScript: a new passkey of the signed-in user
const c = await post('/auth/passkeys/options')
const made = await navigator.credentials.create({publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(JSON.parse(c.Options))})
await post('/auth/passkeys', {Ticket: c.Ticket, Credential: JSON.stringify(made.toJSON()), Name: "Ada's phone"})

// a sign-in: no e-mail asked, the device offers the passkeys it holds for this site
const s = await post('/auth/passkey/options')
const got = await navigator.credentials.get({publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(JSON.parse(s.Options))})
const account = await post('/auth/passkey', {Ticket: s.Ticket, Credential: JSON.stringify(got.toJSON())})
```

The options of a new passkey name the relying party (`RpId`, `RpName`), the user (his *handle*, 16 random bytes made
at his first passkey, with no e-mail nor name in it; his e-mail and name as the device shows them), the algorithms
the app takes (ES256, EdDSA, RS256, PS256, in this order), the passkeys he has already (so a device doesn't make a
second), a key the device keeps for the site (`residentKey: required`), `userVerification` as `PasskeyCheck` says, and
`attestation: none`: the brand of the device is not checked, its key is. The *challenge* is 32 random bytes; the ticket
is `id.challenge`, the database keeps the hash of the challenge only, and the ticket serves once, for `PasskeyTime`
seconds.

What the device sent is checked as WebAuthn's sections 7.1 and 7.2 say, each refusal a `400` "This passkey's answer is
not valid: ..." that names the check:

- the client's data, as the browser wrote it: its type (`webauthn.create`, or `webauthn.get`), its challenge (this
  ceremony's), its origin (`APP_ORIGIN`, or one of `PasskeyOrigins`), and no frame of another site (`crossOrigin`,
  `topOrigin`). A phishing site's page has its own origin, which the browser writes: the answer is refused
  (`isPhishingRefused`, `isMadeOnlyHere`).
- the device's data: the SHA-256 of `RpId` (a passkey of another site is bound to another), the user present, the user
  verified when `PasskeyCheck = required` (`isVerificationAsked`).
- for a new passkey, its public key (a COSE key in CBOR: ES256 on P-256, EdDSA on Ed25519, RS256 or PS256 of 2,048
  bits at least) and its id, never kept before: a `409` "This passkey is kept already." otherwise.
- for a sign-in, the passkey of its id (a `401` "This passkey is not known here." otherwise), its user handle (another
  user's is refused), its flag of backup unchanged, its signature over the device's data and the hash of the client's
  data, by its own algorithm (`isMadeThenSignedInEs256`, `isEdDsaToo`; a signature changed is a `401`), and its
  counter.

The *counter*: a device that counts adds one at each signature. When the passkey or the device has counted, the new
count must be higher than the one kept; a count that goes back is a copy of the key (a cloned security key): an event
`passkey-cloned`, and with `PasskeyCounter = refuse` a `401` "This passkey's counter went back: it may be a copy. Use
another way to sign in." (`isClonedKeyRefused`). The passkeys that are synced between devices (Apple's, Google's)
count 0 each time, and that is taken (`isCounterOfZeroTaken`). The count is written by a write that expects the old one:
of two sign-ins with one passkey at the same moment, one is a `401` "This passkey was used at the same moment: sign in
again."

A passkey whose device verified its user is two factors at once (the device held, and a face, a finger or a PIN): it
signs in without the step of TOTP. A passkey whose device didn't (with `PasskeyCheck` `preferred` or `discouraged`)
is one factor: the second step comes as after a password, when one is needed (`isVerificationAsked`).

`GET /auth/passkeys` lists the user's passkeys (`Name`, `Created`, `Last`, `Verified`); `DELETE /auth/passkeys/:id`
takes one away, unless it is his last way to sign in (`409`, `isLastWayKept`). With `Passkeys = off` every one of
the endpoints that make a passkey or sign in or up with one is a `403` (`isOffMeansOff`); the list and the
removal stay, so a user can still see and take away what he made.

```java
// Spring Boot: webAuthn() serves POST /webauthn/register/options, /webauthn/register, /webauthn/authenticate/options
// and /login/webauthn, and keeps the credentials in memory unless given a JdbcUserCredentialRepository and a
// JdbcPublicKeyCredentialUserEntityRepository (6.5); a passkey is made for a user already signed in
```

## 3. Signing up without a password

```text
POST /auth/signup/passkey/options {Email, Name, Tenant?, Invite?, Proof?}   -> {Ticket, Options}
POST /auth/signup/passkey         {Ticket, Credential}                      -> the Account, and a session
```

The first call checks what a sign-up checks (closed, by invitation, the trap field, the limits of the address, the
proof of work), then begins a ceremony that keeps the fields. The second makes the account with its passkey in one
group, without a password: a sign-in by password with that e-mail is a `401`, as for a wrong one
(`isSignedUpWithoutPassword`). An address to check by mail waits for its link, as `SignUp` does. With `Passwords =
off`, signing up and in by password are a `403` ("Signing up with a password is off: use a passkey or a provider.",
"Signing in with a password is off: ...") (`isPasswordOff`).

```java
// Spring Boot: Spring's passkeys are made for a user signed in already; an account made by its passkey is by hand
```

## 4. TOTP and recovery codes

TOTP (*Time-based One-Time Password*, RFC 6238, over HOTP, RFC 4226): the server and the user's app of codes (Google
Authenticator, 1Password, Aegis) share a secret of 20 random bytes; every 30 seconds both compute a code of 6 digits
from it and the time. Nothing goes over the network but the code.

```text
POST /auth/totp                   -> {Secret, Uri, Codes}     a new secret, not on yet
POST /auth/totp/confirm {Code}    -> the factors               a code of the app turns it on
POST /auth/recovery {Code}        -> {Codes}                   10 new recovery codes, with a code of the app
POST /auth/totp/off {Code}        -> the factors               with a code of the app or a recovery code
GET  /auth/factors                -> {Totp, Recovery, Password, Passkeys, Identities}
```

`Secret` is in base32, to type into the app; `Uri` is its `otpauth://totp/invoices%3Aada%40example.com?secret=...`
address (Google's *Key Uri Format*), which the page shows as a QR code; `Codes` are the ten recovery codes, each
`xxxxx-xxxxx` (50 random bits), each good for one sign-in without the app, shown this once. Nothing is on before a
code of the app confirms the secret, so a user who scanned nothing locks himself out of nothing.

- A code is taken from `TotpSkew` steps before to as many after now (a phone's clock a little off), and **once**: the
  step of the last code taken is kept, and a code of that step or an earlier one is refused. A code seen over a
  shoulder and typed again is a `401` (`isCodeTakenOnce`); two requests with one code at once, one of them fails (the
  write of the step expects the old one).
- A recovery code is read in any case, its `-` and spaces ignored, and ends when used (`isRecoveryCodeOnce`).
- TOTP is turned off only with a code: a session alone, held by a thief, turns nothing off (`isTurnedOffOnlyWithACode`).
  When the settings ask it of the user, his next sign-in sets it up again: that is how he moves his codes to a new
  phone himself (`isTurnedOffThenSetUpAgainWhenAsked`).
- At rest, the secret is sealed (XSalsa20-Poly1305) under a key drawn from `APP_SECRET`, and each recovery code is kept
  as a BLAKE2b with that key: a copy of the database gives neither (`isSecretSealed`). So `APP_SECRET` must stay the
  same, in every worker and at every start (it is required in prod): with another one, no secret of TOTP and no
  recovery code can be read, and their users need an admin (section 6). Without `APP_SECRET` (dev), the key is new at
  each start.
- The algorithm, the digits and the period are the settings'; RFC 6238's own vectors give its codes exactly
  (`isRfc6238Exact`), and `SHA256` with 8 digits works the same (`isAskedOfEveryoneWithSha256`).

## 5. The second step of a sign-in

When the user has TOTP on, or the settings ask it of him (`TwoFactor = required`, or one of his roles in
`TwoFactorRoles`), a sign-in that checked his password gives no session yet. It answers a `401` whose Problem Details
hold a ticket of the second step:

```json
{"type": "about:blank", "title": "Unauthorized", "status": 401, "detail": "A second factor is needed: send the code of your app.",
 "instance": "urn:request:4f2a1c-1794528000", "second": {"Ticket": "65601.3c1f...", "Methods": ["totp", "recovery"], "Setup": false}}
```

The page asks the code and sends `POST /auth/second {Ticket, Code}`: a code of the app, or a recovery code. The session
comes back as after a password (`isPasswordAloneNotEnough`).

- The ticket has the form of a session's cookie, `id.secret`; the database keeps the hash of its secret; it lasts
  `StepTime` (300 seconds). A ticket made by hand, of another step, or late is a `403` (`isTicketForgedRefused`).
- Each ticket takes `StepTries` codes (5), then ends: a `403` "This sign-in has ended: sign in again.". The wrong codes
  count against the user, in Cepheus as the failures of a password do (every worker sees them), with the delay that
  doubles after `LockAfter` of them (a `429`); and the limit of the address, `SignInPerIp` a minute, holds too: 6
  digits can't be guessed (`isGuessingStopped`).
- When the settings ask a second factor of a user who has none, `Setup` is true and `Methods` is `["totp"]`: the page
  calls `POST /auth/second/setup {Ticket}`, which gives the secret, its address and the recovery codes, and the first
  code sent to `POST /auth/second` turns TOTP on and opens the session. A sign-up of a role that must have one makes
  the account, then gives this `401` and no session (`isAskedOfARole`).

The step is asked on every way in, not only after a password: a passkey whose device didn't verify its user
(`isVerificationAsked`), a sign-in with a provider (`isSecondFactorAfterTheProvider`), the link of a mail that checks
an address (`isPasskeyAndTwoFactor`), a new password by the link of a mail (`isAskedOnEveryWayIn`), a tenant entered
(`POST /auth/tenant`), an invitation taken (`POST /auth/join`). Only a passkey verified by its device skips it. The
admin pages ask it too, at their sign-in ([the admin pages](admin.md)).

```java
// Spring Boot: TOTP by a library (java-totp, googleauth), its secret on the user by hand, and the state between
// the two steps in the HTTP session; Spring Security 7's multi-factor authentication asks each factor as an authority
```

## 6. When a device is lost

- A phone lost, with the recovery codes: the user signs in with one (an event `recovery`), turns TOTP off with
  another, and sets it up again on his new phone. Unless the settings ask it of him: then he can't turn it off, and
  an admin takes it away.
- A passkey lost: the user takes it away from another device, by `DELETE /auth/passkeys/:id`.
- Both lost: a super-admin takes the factors away, `POST /admin/users/:id/factors/reset {Totp: true, Passkeys: true}`,
  from the page of the user in [the admin pages](admin.md) ("Take away the TOTP and the recovery codes of ...", each
  asked first). His sessions go on; his next sign-in is by password, or a provider, alone; when the settings ask a
  second factor of him, he sets a new one up at that sign-in. An event `factors-reset` names it
  (`isFactorsShownAndReset`). How the super-admin makes sure who asks is the platform's to decide: Centauri trusts
  the role super.

## 7. Its test

`apptest.Device(t, alg, uv)` is a device of passkeys in software (ES256 through OpenSSL, or EdDSA through libsodium,
verifying its user when `uv`). `apptest.Made(d, options, t)` gives the credential that a page sends for a new passkey
(and the device that now knows the user's handle); `apptest.Signed(d, options, t, count)` gives the assertion of a
sign-in. Their other arguments make the answer wrong on purpose, as an attacker or a cloned key would: `origin`,
`rpId`, `kind`, `uv`, `cross` (a frame), `handle`, `tamper` (a byte of the signature changed), `count`. `t.SetUp(err)`
ends a sign-up or a sign-in that the settings stopped at a second factor not yet set up: it sets TOTP up as its owner
would and gives `{Client, Secret, Codes}`; `auth.TotpCode(secret, at, t.Env)` is the code his app would show.

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/api
use deps/www-celestial/centauri/src/apptest
use std/bug
use std/result
use std/value
use std/json
ada = json.Parse("{}")!
invoices = json.Parse("{}")!
```

```cesia norun
defn isPasskeyAndTwoFactor()
  t = apptest.Start(invoices.App, settings = {TwoFactorRoles: "owner"})?
  stopped = t.SignUp(ada)
  bug.Assert(result.IsErr(stopped) and stopped.Error.Status == 401 and stopped.Error.Problem.second.Setup, "asked at the check of her address: $stopped")
  s = t.SetUp(stopped)?
  a = s.Client
  bug.Assert(value.Len(s.Codes) == 10 and a.Call(api.MyFactors)?.Totp, "TOTP on")
  d = apptest.Device(t)?
  c = a.Call(api.PasskeyNew)?
  a.Call(api.PasskeyAdd, {Ticket: c.Ticket, Credential: apptest.Made(d, c.Options, t).Credential, Name: "Ada's phone"})?
  password = t.SignIn(ada.Email, ada.Password)
  bug.Assert(password.Error.Status == 401, "the password alone: a second step")
  start = t.Anyone().Call(api.PasskeyStart)?
  key = t.Anyone().Call(api.PasskeySignIn, {Ticket: start.Ticket, Credential: apptest.Signed(apptest.Made(d, c.Options, t).Device, start.Options, t)})
  result.IsOk(key) and key.Value.Email == ada.Email
end
```

The invoices check addresses by mail: `t.SignUp` follows the link, and the check of her address is where the step is
asked.

## 8. What it defends against

| threat | defense | test |
|---|---|---|
| a password stolen | TOTP or a passkey asked after it | second `isPasswordAloneNotEnough`; invoices `isPasskeyAndTwoFactor` |
| codes of TOTP guessed (brute force) | `StepTries` a ticket; the user's failures and their delay that doubles; `SignInPerIp` | second `isGuessingStopped` |
| a code seen and typed again (replay) | each step's code once: the last step kept, written with `Expect` | second `isCodeTakenOnce` |
| a recovery code used twice | ended when used, by a write that expects it | second `isRecoveryCodeOnce` |
| a ticket of the second step forged, of another, late | its hash kept; `StepTime` | second `isTicketForgedRefused` |
| TOTP turned off by who holds a session only | a code asked; never when the settings ask it | second `isTurnedOffOnlyWithACode` |
| the secrets of TOTP read in a copy of the database | sealed under a key of `APP_SECRET`; recovery codes keyed | second `isSecretSealed` |
| a second factor skipped by another way in | the step on every way in but a verified passkey | second `isAskedOnEveryWayIn`; oidc `isSecondFactorAfterTheProvider`; passkeys `isVerificationAsked`; invoices `isPasskeyAndTwoFactor` |
| a passkey's answer from a phishing site, another relying party, another ceremony, a frame | the origin, the hash of `RpId`, the type and the challenge, `crossOrigin` and `topOrigin` checked | passkeys `isPhishingRefused`, `isMadeOnlyHere` |
| a ticket or an assertion used twice | the ticket ends at its first use; an answer signs one challenge | passkeys `isTicketAndAssertionOnce` |
| a cloned passkey | its counter must grow; `passkey-cloned`; refused by `PasskeyCounter` | passkeys `isClonedKeyRefused`, `isCounterOfZeroTaken` |
| user verification skipped | `PasskeyCheck = required`; without it, the second step | passkeys `isVerificationAsked` |
| a user locked out by taking away his last way in | a `409` | passkeys `isLastWayKept` |

Next: [An API for a partner](partner-api.md).
