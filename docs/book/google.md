# Sign in with Google

The task: someone opens the invoices and signs in with his Google account, without a password of ours; the first time,
his office is made, as a sign-up makes it, and his address needs no mail to check it, since Google checked it; then he
comes back to the page he started from. The same for Microsoft, Apple, GitHub, or the provider of a company. Nobody
signs in as another by a token taken elsewhere, a sign-in started in his own browser, or an address Google doesn't
vouch for. The code is `src/auth/oidc.ce` and `src/auth/jose.ce`, the contracts `src/api/oidc.ce`, the tests
`tests/oidc.test.ce`; the invoices sign in with a provider in `examples/invoices/tests/l3.test.ce`
(`isSignedInWithGoogle`).

What it uses: OpenID Connect (OIDC), the way most providers of accounts tell an app who signed in: the app is its
*relying party* (it relies on the provider's word); the flow of the *authorization code* with PKCE; `state` and
`nonce`; the *ID token*, a signed JWT that says who the user is, checked by the keys the provider publishes; the
settings `SignInWith`, `OidcLink`, `OidcSignUp`, `OidcPage`, `OidcTime` and those of each provider; the endpoints
`Providers`, `OidcStart`, `OidcBack`, `OidcBackPost`, `OidcFinish` and `Unlink`; in tests, `apptest.Provider`.

## 1. The settings of each provider

At Google (its Cloud console, *APIs & Services*, *Credentials*), make a client of OAuth of the type *Web application*,
and give it one *authorized redirect URI*: the app's `APP_ORIGIN` and `/auth/oidc/callback`. Google gives a client id
and a client secret. Then:

```sh
export APP_SIGN_IN_WITH=google
export APP_GOOGLE_ID=1234-abc.apps.googleusercontent.com APP_GOOGLE_SECRET="$(cat /etc/invoices/google.secret)"
```

`SignInWith` lists the providers turned on, by name, with commas, in the order the page shows them. Each provider
needs its settings, and a start without one stops, naming each:

```text
$ APP_SIGN_IN_WITH=google,apple,nobody cesia do serve
centauri: APP_GOOGLE_ID: needed to sign in with google.
centauri: APP_GOOGLE_SECRET: needed to sign in with google.
centauri: APP_APPLE_ID: needed to sign in with apple.
centauri: APP_APPLE_TEAM: needed to sign in with apple.
centauri: APP_APPLE_KEY_ID: needed to sign in with apple.
centauri: APP_APPLE_KEY: needed to sign in with apple.
centauri: APP_SIGN_IN_WITH: nobody is no provider (google, microsoft, apple, github, oidc, or one of the app's).
```

(`isSettingMissingNamed`.)

| provider | its settings | what is particular to it |
|---|---|---|
| `google` | `APP_GOOGLE_ID`, `APP_GOOGLE_SECRET` | Gmail and Google Workspace; its tokens name it `https://accounts.google.com` or `accounts.google.com`, both taken |
| `microsoft` | `APP_MICROSOFT_ID`, `APP_MICROSOFT_SECRET`, `APP_MICROSOFT_TENANT` (`common`) | Entra ID (work and school accounts) and personal accounts: `common` takes both, `organizations` the first, `consumers` the second, or the id of one company's tenant; each token is checked against the issuer of its own tenant (its `tid`) |
| `apple` | `APP_APPLE_ID` (the *Services ID*), `APP_APPLE_TEAM`, `APP_APPLE_KEY_ID`, `APP_APPLE_KEY` (the `.p8` in PEM, its line ends real or written `\n`) | Apple asks a client secret that the app signs itself: a JWT of 5 minutes, ES256, made at each sign-in from the key (`auth.ClientSecret`); it posts its answer (`form_post`); it gives the user's name once, at the first sign-in |
| `github` | `APP_GITHUB_ID`, `APP_GITHUB_SECRET` | OAuth 2.0 without OpenID Connect: no ID token; the user and his verified primary address are read from GitHub's API |
| `oidc` | `APP_OIDC_ISSUER` (https), `APP_OIDC_ID`, `APP_OIDC_SECRET`, `APP_OIDC_NAME` (`SSO`), `APP_OIDC_SCOPES` (`openid email profile`) | any provider of OpenID Connect by its issuer alone: Okta, Keycloak, Auth0, a company's Entra ID; its button says `OidcName` |
| one of the app's | `APP_<NAME>_ID`, `APP_<NAME>_SECRET` | several providers of OpenID Connect at once, each by `auth.Provider` |

The provider of the app's own, beside those Centauri knows:

```
(* a sketch: the invoices sign in with Google alone *)
Okta = auth.Provider("okta", title = "Okta", issuer = "https://acme.okta.com")
App = app.Of([auth.Module(providers = [Okta]), ...], ...)
```

`auth.Provider(name, title, issuer, scopes)` reads `APP_OKTA_ID` and `APP_OKTA_SECRET` (its name with a capital, then
`Id` and `Secret`); `APP_SIGN_IN_WITH=google,okta` turns it on. Its discovery document, where the provider lists its
endpoints and its keys, is read at `issuer/.well-known/openid-configuration`, kept a day in the memory of the process,
and its issuer must be the one given.

The invoices change nothing in their code: the module of the accounts serves the providers of the settings.

```yaml
# Spring Boot: spring-boot-starter-oauth2-client, and each provider in application.yml (from Spring's docs)
spring:
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${GOOGLE_ID}
            client-secret: ${GOOGLE_SECRET}
            scope: openid, email, profile
          okta:
            client-id: ${OKTA_ID}
            client-secret: ${OKTA_SECRET}
            scope: openid, email, profile
        provider:
          okta:
            issuer-uri: https://acme.okta.com
# Google, GitHub, Facebook and Okta have defaults (CommonOAuth2Provider); Microsoft and Apple are providers to write.
```

## 2. The page's flow

A sign-in is four steps, two of them at the provider:

1. The page asks `GET /auth/providers` (`[{Name: "google", Title: "Google"}]`) and shows a button each.
2. A click sends `POST /auth/oidc/start {Provider: "google", Return: "/invoices?Unpaid=true"}`. The answer is `{Url}`, the
   address of Google's page, and a cookie, `__Host-oidc` (`oidc` over plain http): `HttpOnly`, `SameSite=Strict`,
   `Max-Age` of `OidcTime` (600 seconds). The page sends the browser to `Url`.
3. The user signs in at Google, which sends his browser back to `/auth/oidc/callback?code=...&state=...`. This
   callback writes nothing: it answers `303` to the page of the setting `OidcPage` (`/signin/callback`) with what Google
   gave in the *fragment* of the address, after `#`: `/signin/callback#code=...&state=...`. A browser never sends a
   fragment to a server, so the code sits in no log, no proxy, no `Referer` (the `303` also says
   `Referrer-Policy: no-referrer`). Only the fields of OAuth's answer pass (`code`, `state`, `error`, `iss`, `user`),
   each 4,000 bytes at most.
4. The page reads the fragment and sends it: `POST /auth/oidc/finish {State, Code, Iss}` (or `Error`; Apple's `User`).
   The answer is the `Account` and `Return`, with the session's cookie, as a sign-in by password gives them; or the 401
   of a second factor (chapter [Passkeys and two-factor](passkeys.md)). The page goes to `Return`.

```js
// the page, a sketch in JavaScript (the invoices have no front of their own in the repository)
const {Url} = await post('/auth/oidc/start', {Provider: 'google', Return: location.pathname + location.search})
location.assign(Url)
// ... and at /signin/callback:
const got = new URLSearchParams(location.hash.slice(1)); history.replaceState(null, '', location.pathname)
const account = await post('/auth/oidc/finish', {State: got.get('state'), Code: got.get('code') ?? undefined,
  Iss: got.get('iss') ?? undefined, Error: got.get('error') ?? undefined, User: got.get('user') ?? undefined})
location.assign(account.Return)
```

Why the bounce: the cookie of the flow is `SameSite=Strict`, so the browser doesn't send it on the request that
comes from Google's site; the callback doesn't need it, since it only passes the answer on. The finish is a request of
the app's own page, which sends it. Apple posts its answer from its site (`response_mode=form_post`): the callback
takes that POST too (`OidcBackPost`), the one request of another site that Centauri takes, since it writes nothing.

```java
// Spring Boot: oauth2Login() serves /oauth2/authorization/{registrationId} and the callback
// /login/oauth2/code/{registrationId}, and keeps the request of the flow in the HTTP session
@Bean SecurityFilterChain web(HttpSecurity http) throws Exception {
  return http.oauth2Login(Customizer.withDefaults()).build();
}
```

## 3. What is checked, and why

The start draws a secret of 32 random bytes for this sign-in, keeps it in the cookie of this browser, and keeps its
BLAKE2b hash in a flow of Cepheus (`centauri_oidc`) with the provider, the `Return` and its end. Three values the
provider carries are each a BLAKE2b of that secret, so the database keeps none of them:

- `state`, sent to the provider and given back: the finish compares it with the cookie's, in a time that tells nothing.
  A sign-in started in an attacker's browser and finished in his victim's (so that the victim works in the attacker's
  account: *login CSRF*) has another cookie, or none: a `403` (`isLoginCsrfRefused`).
- `nonce`, sent to the provider, which writes it into the ID token: a token of another sign-in, of another browser,
  has another nonce (`isTokenOfAnotherAppOrSignInRefused`).
- the verifier of PKCE (*Proof Key for Code Exchange*, RFC 7636): the provider gets its SHA-256 (`code_challenge`,
  `S256`) at the start, and the verifier itself with the code at the end. A code caught on its way back is of no use
  without the cookie (`isFlowCookieGuarded`: the cookie's form, the challenge, the callback's address, and no part of
  the secret in the provider's address).

The finish ends the flow at once, by a write that expects its hash as it was: a second finish of the same flow is a
`403` (`isFinishedOnce`). Then:

- **the issuer of the answer**: when the provider names itself in the answer (`iss`, RFC 9207), it must be the
  provider of this flow, else a `401` "The provider's answer names another issuer." (`isMixUpRefused`); when its
  discovery document says it always does (`authorization_response_iss_parameter_supported`), an answer without it is
  refused too (`isIssuerAskedWhenPromised`). A *mix-up* is
  an attacker's provider that gets the code meant for another; the code goes only to the token endpoint of the
  provider the flow names, read from its own discovery document.
- **the code exchanged** at that token endpoint, with the client's secret and the verifier (`client_secret_post`), one
  try, through `app.Call` and its checks of addresses ([partner](partner.md)).
- **the ID token's signature** (`src/auth/jose.ce`, after RFC 8725, the best practices of JWT): the algorithm is one of
  the app's (RS256, PS256, ES256, EdDSA), never the token's own choice: `none` and the HMACs are refused, so a public
  key can't be used as a secret; the key is one of the provider's set (JWKS, its *JSON Web Key Set*), chosen by the
  token's `kid` and checked against its algorithm; the keys a token names in itself (`jwk`, `jku`, `x5u`, `x5c`) are
  never read, so a token signed by its own key proves nothing (`isForgedTokenRefused`). The set is kept in the memory of
  the process for the time its `Cache-Control` gives (5 minutes to a day, an hour without), and read again, at most once
  a minute, for a `kid` it doesn't hold: the provider turned its keys (`isRotationRead`).
- **its claims** (OpenID Connect Core 3.1.3.7): `iss` the provider's; `aud` this app's client id, and `azp` too when the
  token has several audiences ("it is for another app."); `exp` not past and `iat` not in the future, a minute of skew
  either way; `nonce` this sign-in's; `sub`, the user at the provider, a text of 1 to 255 bytes
  (`isTokenOfAnotherAppOrSignInRefused`: another audience, another nonce, past, future, another issuer, each a `401`).

A refusal of the provider (`Error`) is shown only by the codes of OAuth 2.0 and OpenID Connect
(`access_denied`, `login_required`...): "The provider refused: access_denied."; any other text it sent is not shown, so
nobody puts a script or a lie in the app's mouth (`isProviderTextNotShown`).

```java
// Spring Boot checks the ID token's iss, aud, azp, exp, iat and nonce (OidcIdTokenValidator), and the signature by the
// provider's JWKS; PKCE for a client with a secret is a customizer of the authorization request:
var resolver = new DefaultOAuth2AuthorizationRequestResolver(registrations, "/oauth2/authorization");
resolver.setAuthorizationRequestCustomizer(OAuth2AuthorizationRequestCustomizers.withPkce());
http.oauth2Login(o -> o.authorizationEndpoint(a -> a.authorizationRequestResolver(resolver)));
// Microsoft's common tenant: each token's issuer is its tenant's, a validator of your own
// (OidcIdTokenDecoderFactory.setJwtValidatorFactory); Apple's client secret, a JWT you sign: by hand
```

## 4. Which account

The user at a provider is his `sub`. Centauri keeps an *identity* (`centauri_identity`) for each provider a user
signs in with, unique by the provider, the issuer and the subject. At the finish:

1. An identity known: its user signs in.
2. Else an account with the same address, when the provider says the address is verified: with `OidcLink = verified`
   (the default), the identity is linked to it, an event `oidc-link`, and he signs in; with `never`, a `409` "An account
   has this address: sign in to it, then link Google from your account." An address the provider doesn't vouch for
   never takes an account: a `403` (`isLinkedOnlyByAVerifiedAddress`).
3. Else a new account, as `SignUp` makes it (its tenant, its roles, `SignUp` closed or by invitation as set, the
   identity in the same group), its address marked checked (no mail is sent: `isSignedInWithGoogle`), no password
   (`isSignedUpThenIn`). `OidcSignUp = off` refuses it: then only accounts made otherwise sign in with a provider. An
   invitation's code given at the start (`Invite`) joins its tenant.

Then, as any sign-in: a disabled user is refused, a second factor is asked when he has one or the settings ask it
(`isSecondFactorAfterTheProvider`), and the session opens with its cookie. The cookie of the flow ends.

What "verified" means differs by provider: Google's `email_verified`; Apple's too (`"true"` as a text); GitHub's
primary address marked verified; Microsoft's `email` may be any text that a company's admin typed, so it is taken as
verified only when the token says the domain's owner verified it (`xms_edov`) or for a personal account
(`isMicrosoftAndAppleRead`).

A signed-in user links a provider from his account: `POST /auth/oidc/start {Provider: "google", Link: true}`, then the
same steps; the finish answers his `Account` without a new session, or a `409` when that Google account is another
user's. `GET /auth/factors` lists his identities, and `DELETE /auth/identities/:id` unlinks one, unless it is his last
way to sign in (no password, no passkey, no other identity): a `409` "This is your last way to sign in: add another
first."

```java
// Spring Boot: an OidcUserService of your own finds or makes the user, links by address, and refuses an address the
// provider doesn't vouch for; the session is Spring's (a sketch: identities, linkOrMake and authorities are yours)
@Bean OAuth2UserService<OidcUserRequest, OidcUser> oidcUsers(UserRepo users) {
  var standard = new OidcUserService();
  return req -> {
    OidcUser u = standard.loadUser(req);
    var key = req.getClientRegistration().getRegistrationId() + "|" + u.getIssuer() + "|" + u.getSubject();
    var account = identities.findByKey(key).map(i -> i.user).orElseGet(() -> linkOrMake(key, u));   // by hand
    return new DefaultOidcUser(authorities(account), u.getIdToken(), u.getUserInfo());
  };
}
```

## 5. Its test

`apptest.Provider(t)` is a provider of OpenID Connect in Cesia, on a free port of this machine, over https with a
certificate of an authority made for the tests (`.cesia/tls`, by `openssl`, which the test's permissions allow:
`exec=openssl`, `ffi=ssl`, `ffi=crypto`, `net=own`). It publishes its discovery document and its keys, and its token
endpoint checks PKCE and the client's secret and signs an ID token with its own key (ES256 by default, or RS256 by
`alg`, with a pair of keys given or made). Its `Settings` turn it on in an app as `oidc` (`SignInWith`, `OidcIssuer`,
`OidcId`, `OidcSecret`, and `CallAllow` and `CallCa`, since it is on this machine).

```
defn isSignedInWithGoogle()
  first = apptest.Start(invoices.App)?
  p = apptest.Provider(first)?
  t = apptest.Start(invoices.App, settings = dict.Put("OidcName", "Google", p.Settings))?
  bug.Assert(value.Equal(t.Anyone().Call(api.Providers)?, [{Name: "oidc", Title: "Google"}]), "the button")
  out = apptest.ProviderSignIn(t, p, start = {Return: "/invoices?Unpaid=true"})
  a = json.Parse(out.Body)?
  bug.Assert(out.Status == 201 and a.Return == "/invoices?Unpaid=true" and a.Checked == true and "owner" in a.Roles, "an office of her own: $(out.Body)")
  ...
  made.Status == 201 and value.Len(t.Mails()) == 0
end
```

`apptest.ProviderSignIn(t, p, claims, how, start)` plays the four steps; its parts are `apptest.Begun(t, start)` (the
start, as the page does it: its cookie and the query of the provider's address), `apptest.CodeFor(p, b, claims, how)`
(the code of a user, Ana by default, whose claims a test changes: another `aud`, an old `exp`), and
`apptest.Finished(t, b, x, cookie)` (the finish, with this browser's cookie or another's). `how` makes the provider
sign wrong, as a forger would: `{Alg: "none"}`, `{Alg: "HS256"}` (its public key as the secret), `{Own: true}` (a key
of its own in the token's header). `apptest.Rotate(p, pair)` turns its keys.

## 6. What it defends against

| threat | defense | test |
|---|---|---|
| a token of another app, or of another sign-in (substitution) | `aud` and `azp` this app's; `nonce` drawn from this browser's cookie | `isTokenOfAnotherAppOrSignInRefused` |
| an answer of another provider (mix-up) | the answer's `iss` checked when given (RFC 9207); the code sent only to the token endpoint of the flow's provider | `isMixUpRefused` |
| a flow finished twice | the flow ends at its first finish, by a write that expects it | `isFinishedOnce` |
| a sign-in started in one browser and finished in another (login CSRF, CSRF of the callback) | `state` drawn from the cookie of the browser that started; the finish refused from another site; the callback writes nothing | `isLoginCsrfRefused`, `isCallbackPassedOn` |
| a return to another site (open redirect) | `Return` a path of the app only, however written (`//evil.example`, `https://...`, `/\evil.example`), else `/` | `isReturnKeptInTheApp` |
| a token signed by a key it brings, by none, or by HMAC with the public key | the algorithms the app's; keys from the provider's set only | `isForgedTokenRefused` |
| a token past its time | `exp`, `iat`, a minute of skew | `isTokenOfAnotherAppOrSignInRefused` |
| an account taken by an address the provider doesn't vouch for | linked only by a verified address, as `OidcLink` says; Microsoft's `xms_edov` | `isLinkedOnlyByAVerifiedAddress`, `isMicrosoftAndAppleRead` |
| a provider's text shown to the user | only the codes of OAuth named | `isProviderTextNotShown` |
| the second factor skipped by signing in with a provider | the same step as a password's | `isSecondFactorAfterTheProvider` |
| the code or the secret of a flow read in a log or the database | the code in the fragment; the database keeps the hash of the secret only; `__Host-oidc`, `HttpOnly`, `SameSite=Strict` | `isFlowCookieGuarded` |

Next: [Passkeys and two-factor](passkeys.md).
