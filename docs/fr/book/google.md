# Se connecter avec Google

La tâche : quelqu'un ouvre l'app des factures (une app : l'application, le serveur et ses pages) et se connecte avec son
compte Google, sans mot de passe chez nous. La première fois, son cabinet est créé, comme le crée une inscription, et
son adresse n'a pas besoin d'un mail pour être vérifiée, puisque Google l'a vérifiée. Puis il revient à la page d'où il
est parti. Pareil pour Microsoft, Apple, GitHub, ou le fournisseur (provider) d'une entreprise. Personne ne se connecte
en tant qu'un autre avec un token (un jeton : un texte secret qui prouve un droit) pris ailleurs, avec une connexion
commencée dans son propre navigateur, ou avec une adresse dont Google ne se porte pas garant. Le code est
`src/auth/oidc.ce` et `src/auth/jose.ce`, les contrats `src/api/oidc.ce` (un contrat : ce qu'un endpoint prend, ce qu'il
rend et le rôle qu'il demande, lu par le serveur et par les pages ; un endpoint est une adresse de l'API avec sa méthode
HTTP, comme `POST /clients`), les tests `tests/oidc.test.ce` ; l'app des factures se connecte avec un fournisseur dans
`examples/invoices/tests/l3.test.ce` (`isSignedInWithGoogle`).

Ce qui est utilisé : OpenID Connect (OIDC), la façon dont la plupart des fournisseurs de comptes disent à une app qui
s'est connecté, l'app étant leur *relying party* (elle se fie à la parole du fournisseur) ; le parcours (flow) du *code
d'autorisation* (authorization code) avec PKCE ; `state` et `nonce` ; l'*ID token*, un JWT signé (un JSON Web Token : un
objet JSON signé, écrit en texte) qui dit qui est l'utilisateur, vérifié par les clés que le fournisseur publie ; les
réglages `SignInWith`, `OidcLink`, `OidcSignUp`, `OidcPage`, `OidcTime` et ceux de chaque fournisseur ; les endpoints
`Providers`, `OidcStart`, `OidcBack`, `OidcBackPost`, `OidcFinish` et `Unlink` ; dans les tests, `apptest.Provider`.

## 1. Les réglages de chaque fournisseur

Chez Google (sa console Cloud, *APIs & Services*, *Credentials*), créez un client OAuth du type *Web application*, et
donnez-lui une *authorized redirect URI* (l'adresse où Google a le droit de renvoyer le navigateur) : l'`APP_ORIGIN` de
l'app, suivi de `/auth/oidc/callback`. Google donne un client id (l'identifiant de l'app chez lui) et un client secret
(le secret qui va avec). Puis :

```sh
export APP_SIGN_IN_WITH=google
export APP_GOOGLE_ID=1234-abc.apps.googleusercontent.com APP_GOOGLE_SECRET="$(cat /etc/invoices/google.secret)"
```

`SignInWith` liste les fournisseurs activés, par leur nom, séparés par des virgules, dans l'ordre où la page les montre.
Chaque fournisseur a besoin de ses réglages, et un démarrage sans eux s'arrête, en nommant chacun :

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

| fournisseur | ses réglages | ce qui lui est propre |
|---|---|---|
| `google` | `APP_GOOGLE_ID`, `APP_GOOGLE_SECRET` | Gmail et Google Workspace ; ses tokens le nomment `https://accounts.google.com` ou `accounts.google.com`, les deux sont acceptés |
| `microsoft` | `APP_MICROSOFT_ID`, `APP_MICROSOFT_SECRET`, `APP_MICROSOFT_TENANT` (`common`) | Entra ID (les comptes de travail et d'école) et les comptes personnels : `common` prend les deux, `organizations` les premiers, `consumers` les seconds, ou l'id du tenant d'une entreprise (un tenant : un client d'une plateforme, comme un cabinet ou une entreprise, avec ses données à lui) ; chaque token est vérifié contre l'émetteur (issuer : celui qui signe le token et s'y nomme) de son propre tenant (son `tid`) |
| `apple` | `APP_APPLE_ID` (le *Services ID*), `APP_APPLE_TEAM`, `APP_APPLE_KEY_ID`, `APP_APPLE_KEY` (le `.p8` en PEM, ses fins de ligne réelles ou écrites `\n`) | Apple demande un client secret que l'app signe elle-même : un JWT de 5 minutes, en ES256, fait à chaque connexion à partir de la clé (`auth.ClientSecret`) ; Apple poste sa réponse (`form_post`) ; il ne donne le nom de l'utilisateur qu'une fois, à la première connexion |
| `github` | `APP_GITHUB_ID`, `APP_GITHUB_SECRET` | OAuth 2.0 sans OpenID Connect : pas d'ID token ; l'utilisateur et son adresse principale vérifiée sont lus dans l'API de GitHub |
| `oidc` | `APP_OIDC_ISSUER` (https), `APP_OIDC_ID`, `APP_OIDC_SECRET`, `APP_OIDC_NAME` (`SSO`), `APP_OIDC_SCOPES` (`openid email profile`) | n'importe quel fournisseur OpenID Connect, par son seul émetteur : Okta, Keycloak, Auth0, l'Entra ID d'une entreprise ; son bouton dit `OidcName` |
| un fournisseur de l'app | `APP_<NAME>_ID`, `APP_<NAME>_SECRET` | plusieurs fournisseurs OpenID Connect à la fois, chacun par `auth.Provider` |

Le fournisseur propre à l'app, à côté de ceux que Centauri connaît :

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/api
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/apptest
use deps/www-celestial/centauri/src/auth
use std/bug
use std/dict
use std/json
use std/value
invoices = json.Parse("{}")!
made = json.Parse("{}")!
```

```cesia norun
(* a sketch: the invoices sign in with Google alone *)
Okta = auth.Provider("okta", title = "Okta", issuer = "https://acme.okta.com")
App = app.Of([auth.Module(providers = [Okta]), (* ... *)], (* ... *))
```

`auth.Provider(name, title, issuer, scopes)` lit `APP_OKTA_ID` et `APP_OKTA_SECRET` (son nom avec une majuscule, puis
`Id` et `Secret`) ; `APP_SIGN_IN_WITH=google,okta` l'active. Son document de découverte (discovery document), où le
fournisseur liste ses endpoints et ses clés, est lu à `issuer/.well-known/openid-configuration` et gardé un jour dans la
mémoire du processus. Son émetteur doit être celui donné.

L'app des factures ne change rien à son code : le module des comptes sert les fournisseurs des réglages.

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

## 2. Le parcours de la page

Une connexion se fait en quatre étapes, dont deux chez le fournisseur :

1. La page demande `GET /auth/providers` (`[{Name: "google", Title: "Google"}]`) et montre un bouton pour chacun.
2. Un clic envoie `POST /auth/oidc/start {Provider: "google", Return: "/invoices?Unpaid=true"}`, le départ. La réponse
   est `{Url}`, l'adresse de la page de Google, et un cookie (un petit texte que le navigateur garde et renvoie à chaque
   requête), `__Host-oidc` (`oidc` en http simple) : `HttpOnly`, `SameSite=Strict`, `Max-Age` de `OidcTime` (600
   secondes). La page envoie le navigateur à `Url`.
3. L'utilisateur se connecte chez Google, qui renvoie son navigateur à `/auth/oidc/callback?code=...&state=...`. Ce
   callback (l'adresse où le fournisseur renvoie le navigateur) n'écrit rien : il répond `303` vers la page du réglage
   `OidcPage` (`/signin/callback`), avec ce que Google a donné dans le *fragment* de l'adresse, après `#` :
   `/signin/callback#code=...&state=...`. Un navigateur n'envoie jamais un fragment à un serveur : le code n'est donc
   dans aucun log (le journal où un serveur écrit ses requêtes), aucun proxy (un serveur intermédiaire), aucun `Referer`
   (la ligne de la requête où le navigateur nomme la page d'où il vient ; le `303` dit aussi
   `Referrer-Policy: no-referrer`). Seuls les champs de la réponse d'OAuth passent (`code`, `state`, `error`, `iss`,
   `user`), chacun de 4 000 octets au plus.
4. La page lit le fragment et l'envoie, la fin : `POST /auth/oidc/finish {State, Code, Iss}` (ou `Error` ; le `User`
   d'Apple). La réponse est le `Account` et le `Return`, avec le cookie de la session (le temps où un utilisateur reste
   connecté), comme les donne une connexion par mot de passe ; ou le 401 d'un second facteur (le chapitre [Passkeys et
   double authentification](passkeys.md)). La page va à `Return`.

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

Pourquoi ce rebond : le cookie du parcours est `SameSite=Strict`, donc le navigateur ne l'envoie pas avec la requête qui
vient du site de Google ; le callback n'en a pas besoin, puisqu'il ne fait que passer la réponse. La fin est une requête
de la page de l'app elle-même, et celle-ci envoie le cookie. Apple poste sa réponse depuis son site
(`response_mode=form_post`) : le callback accepte aussi ce POST (`OidcBackPost`). C'est la seule requête venue d'un
autre site que Centauri accepte, puisqu'il n'écrit rien.

```java
// Spring Boot: oauth2Login() serves /oauth2/authorization/{registrationId} and the callback
// /login/oauth2/code/{registrationId}, and keeps the request of the flow in the HTTP session
@Bean SecurityFilterChain web(HttpSecurity http) throws Exception {
  return http.oauth2Login(Customizer.withDefaults()).build();
}
```

## 3. Ce qui est vérifié, et pourquoi

Le départ tire un secret de 32 octets aléatoires pour cette connexion, le garde dans le cookie de ce navigateur, et
garde son hash BLAKE2b (une empreinte : un nombre calculé à partir d'un texte, d'où on ne peut pas revenir au texte)
dans un parcours enregistré dans Cepheus (`centauri_oidc`), avec le fournisseur, le `Return` et son heure d'expiration.
Trois valeurs que porte le fournisseur sont chacune un BLAKE2b de ce secret, donc la base de données n'en garde aucune :

- `state`, envoyé au fournisseur et rendu par lui : la fin le compare à celui du cookie, en un temps qui ne laisse rien
  deviner. Une connexion commencée dans le navigateur d'un attaquant et finie dans celui de sa victime (pour que la
  victime travaille dans le compte de l'attaquant : le *login CSRF*) a un autre cookie, ou aucun : un `403`
  (`isLoginCsrfRefused`).
- `nonce`, envoyé au fournisseur, qui l'écrit dans l'ID token : un token d'une autre connexion, d'un autre navigateur, a
  un autre nonce (`isTokenOfAnotherAppOrSignInRefused`).
- le vérificateur (verifier) de PKCE (*Proof Key for Code Exchange*, RFC 7636) : le fournisseur reçoit son SHA-256
  (`code_challenge`, `S256`) au départ, et le vérificateur lui-même avec le code à la fin. Un code intercepté sur son
  chemin de retour ne sert à rien sans le cookie (`isFlowCookieGuarded` : la forme du cookie, le challenge, l'adresse du
  callback, et aucune partie du secret dans l'adresse du fournisseur).

La fin termine le parcours tout de suite, par une écriture qui exige que son hash soit encore tel qu'il était : une
seconde fin du même parcours est un `403` (`isFinishedOnce`). Puis :

- **l'émetteur de la réponse** : quand le fournisseur se nomme dans la réponse (`iss`, RFC 9207), ce doit être le
  fournisseur de ce parcours, sinon un `401` « The provider's answer names another issuer. » (`isMixUpRefused`). Quand
  son document de découverte dit qu'il le fait toujours (`authorization_response_iss_parameter_supported`), une réponse
  sans lui est refusée aussi (`isIssuerAskedWhenPromised`). Un *mix-up* (un mélange), c'est le fournisseur d'un
  attaquant qui obtient le code destiné à un autre ; le code ne va qu'à l'endpoint de token (token endpoint) du
  fournisseur que nomme le parcours, lu dans son propre document de découverte.
- **le code échangé** à cet endpoint de token, avec le secret du client et le vérificateur (`client_secret_post`), en un
  seul essai, par `app.Call` et ses vérifications des adresses ([partenaire](partner.md)).
- **la signature de l'ID token** (`src/auth/jose.ce`, d'après la RFC 8725, les bonnes pratiques des JWT) : l'algorithme
  est un de ceux de l'app (RS256, PS256, ES256, EdDSA), jamais le choix du token lui-même. `none` et les HMAC (des
  signatures par un secret partagé) sont refusés, pour qu'une clé publique ne puisse pas servir de secret. La clé est
  une de celles du jeu du fournisseur (JWKS, son *JSON Web Key Set*), choisie par le `kid` du token et vérifiée contre
  son algorithme. Les clés qu'un token nomme en lui-même (`jwk`, `jku`, `x5u`, `x5c`) ne sont jamais lues : un token
  signé par sa propre clé ne prouve rien (`isForgedTokenRefused`). Le jeu est gardé dans la mémoire du processus le
  temps que dit son `Cache-Control` (de 5 minutes à un jour, une heure sans lui), et relu, au plus une fois par minute,
  pour un `kid` qu'il ne contient pas : le fournisseur a changé ses clés (`isRotationRead`).
- **ses claims** (les affirmations du token : qui, pour qui, jusqu'à quand ; OpenID Connect Core 3.1.3.7) : `iss` celui
  du fournisseur ; `aud` le client id de cette app, et `azp` aussi quand le token a plusieurs audiences, les apps à qui
  il est destiné (« it is for another app. ») ; `exp` pas passé et `iat` pas dans le futur, avec une minute d'écart
  d'horloge permise dans chaque sens ; `nonce` celui de cette connexion ; `sub`, l'utilisateur chez le fournisseur, un
  texte de 1 à 255 octets (`isTokenOfAnotherAppOrSignInRefused` : une autre audience, un autre nonce, passé, futur, un
  autre émetteur, chacun un `401`).

Un refus du fournisseur (`Error`) n'est montré que par les codes d'OAuth 2.0 et d'OpenID Connect (`access_denied`,
`login_required`...) : « The provider refused: access_denied. » ; tout autre texte qu'il a envoyé n'est pas montré, pour
que personne ne mette un script ou un mensonge dans la bouche de l'app (`isProviderTextNotShown`).

```java
// Spring Boot checks the ID token's iss, aud, azp, exp, iat and nonce (OidcIdTokenValidator), and the signature by the
// provider's JWKS; PKCE for a client with a secret is a customizer of the authorization request:
var resolver = new DefaultOAuth2AuthorizationRequestResolver(registrations, "/oauth2/authorization");
resolver.setAuthorizationRequestCustomizer(OAuth2AuthorizationRequestCustomizers.withPkce());
http.oauth2Login(o -> o.authorizationEndpoint(a -> a.authorizationRequestResolver(resolver)));
// Microsoft's common tenant: each token's issuer is its tenant's, a validator of your own
// (OidcIdTokenDecoderFactory.setJwtValidatorFactory); Apple's client secret, a JWT you sign: by hand
```

## 4. Quel compte

L'utilisateur chez un fournisseur, c'est son `sub`. Centauri garde une *identité* (`centauri_identity`) pour chaque
fournisseur avec lequel un utilisateur se connecte, unique par le fournisseur, l'émetteur et le sujet (subject). À la
fin :

1. Une identité connue : son utilisateur se connecte.
2. Sinon, un compte qui a la même adresse, quand le fournisseur dit que l'adresse est vérifiée : avec
   `OidcLink = verified` (le défaut), l'identité lui est liée, avec un événement `oidc-link`, et il se connecte ; avec
   `never`, un `409` « An account has this address: sign in to it, then link Google from your account. » Une adresse
   dont le fournisseur ne se porte pas garant ne prend jamais un compte : un `403` (`isLinkedOnlyByAVerifiedAddress`).
3. Sinon, un nouveau compte, comme le crée `SignUp` (son tenant, ses rôles, `SignUp` fermé ou sur invitation selon les
   réglages, l'identité dans le même groupe : une seule écriture de Cepheus, appliquée tout entière ou pas du tout), son
   adresse marquée vérifiée (aucun mail n'est envoyé : `isSignedInWithGoogle`), sans mot de passe (`isSignedUpThenIn`).
   `OidcSignUp = off` le refuse : alors seuls les comptes créés autrement se connectent avec un fournisseur. Le code
   d'une invitation donné au départ (`Invite`) fait entrer dans son tenant.

Puis, comme toute connexion : un utilisateur désactivé est refusé, un second facteur est demandé quand il en a un ou que
les réglages le demandent (`isSecondFactorAfterTheProvider`), et la session s'ouvre avec son cookie. Le cookie du
parcours prend fin.

Ce que « vérifiée » veut dire change selon le fournisseur : l'`email_verified` de Google ; celui d'Apple aussi
(`"true"`, en texte) ; l'adresse principale de GitHub marquée vérifiée. L'`email` de Microsoft peut être n'importe quel
texte qu'a tapé l'admin d'une entreprise : il n'est donc pris pour vérifié que quand le token dit que le propriétaire du
domaine l'a vérifié (`xms_edov`), ou pour un compte personnel (`isMicrosoftAndAppleRead`).

Un utilisateur connecté lie un fournisseur depuis son compte : `POST /auth/oidc/start {Provider: "google", Link: true}`,
puis les mêmes étapes. La fin répond son `Account` sans nouvelle session, ou un `409` quand ce compte Google est celui
d'un autre utilisateur. `GET /auth/factors` liste ses identités, et `DELETE /auth/identities/:id` en délie une, sauf si
c'est sa dernière façon de se connecter (pas de mot de passe, pas de passkey, la clé d'accès gardée par l'appareil qui
remplace le mot de passe, pas d'autre identité) : un `409` « This is your last way to sign in: add another first. »

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

## 5. Son test

`apptest.Provider(t)` est un fournisseur OpenID Connect écrit en Cesia, sur un port libre de cette machine, en https
avec un certificat d'une autorité faite pour les tests (`.cesia/tls`, par `openssl`, que les permissions du test
autorisent : `exec=openssl`, `ffi=ssl`, `ffi=crypto`, `net=own`). Il publie son document de découverte et ses clés. Son
endpoint de token vérifie PKCE et le secret du client, et signe un ID token avec sa propre clé (ES256 par défaut, ou
RS256 par `alg`, avec une paire de clés donnée ou créée). Ses `Settings` l'activent dans une app comme `oidc`
(`SignInWith`, `OidcIssuer`, `OidcId`, `OidcSecret`, et `CallAllow` et `CallCa`, puisqu'il est sur cette machine).

```cesia norun
defn isSignedInWithGoogle()
  first = apptest.Start(invoices.App)?
  p = apptest.Provider(first)?
  t = apptest.Start(invoices.App, settings = dict.Put("OidcName", "Google", p.Settings))?
  bug.Assert(value.Equal(t.Anyone().Call(api.Providers)?, [{Name: "oidc", Title: "Google"}]), "the button")
  out = apptest.ProviderSignIn(t, p, start = {Return: "/invoices?Unpaid=true"})
  a = json.Parse(out.Body)?
  bug.Assert(out.Status == 201 and a.Return == "/invoices?Unpaid=true" and a.Checked == true and "owner" in a.Roles, "an office of her own: $(out.Body)")
  (* ... *)
  made.Status == 201 and value.Len(t.Mails()) == 0
end
```

`apptest.ProviderSignIn(t, p, claims, how, start)` joue les quatre étapes. Ses parties sont `apptest.Begun(t, start)`
(le départ, comme le fait la page : son cookie et les paramètres de l'adresse du fournisseur),
`apptest.CodeFor(p, b, claims, how)` (le code d'un utilisateur, Ana par défaut, dont un test change les claims : un
autre `aud`, un vieil `exp`), et `apptest.Finished(t, b, x, cookie)` (la fin, avec le cookie de ce navigateur ou celui
d'un autre). `how` fait signer le fournisseur de travers, comme le ferait un faussaire : `{Alg: "none"}`,
`{Alg: "HS256"}` (sa clé publique comme secret), `{Own: true}` (une clé à lui dans l'en-tête du token).
`apptest.Rotate(p, pair)` change ses clés.

## 6. Contre quoi il protège

| menace | défense | test |
|---|---|---|
| un token d'une autre app, ou d'une autre connexion (substitution) | `aud` et `azp` ceux de cette app ; `nonce` tiré du cookie de ce navigateur | `isTokenOfAnotherAppOrSignInRefused` |
| une réponse d'un autre fournisseur (mix-up) | le `iss` de la réponse vérifié quand il est donné (RFC 9207) ; le code envoyé seulement à l'endpoint de token du fournisseur du parcours | `isMixUpRefused` |
| un parcours fini deux fois | le parcours prend fin à sa première fin, par une écriture qui exige qu'il soit encore là | `isFinishedOnce` |
| une connexion commencée dans un navigateur et finie dans un autre (login CSRF, CSRF du callback) | `state` tiré du cookie du navigateur qui l'a commencée ; la fin refusée depuis un autre site ; le callback n'écrit rien | `isLoginCsrfRefused`, `isCallbackPassedOn` |
| un retour vers un autre site (open redirect) | `Return` seulement un chemin de l'app, quelle que soit son écriture (`//evil.example`, `https://...`, `/\evil.example`), sinon `/` | `isReturnKeptInTheApp` |
| un token signé par une clé qu'il apporte, par aucune, ou par HMAC avec la clé publique | les algorithmes de l'app ; les clés du jeu du fournisseur seulement | `isForgedTokenRefused` |
| un token après son temps | `exp`, `iat`, une minute d'écart | `isTokenOfAnotherAppOrSignInRefused` |
| un compte pris par une adresse dont le fournisseur ne se porte pas garant | lié seulement par une adresse vérifiée, comme le dit `OidcLink` ; le `xms_edov` de Microsoft | `isLinkedOnlyByAVerifiedAddress`, `isMicrosoftAndAppleRead` |
| un texte du fournisseur montré à l'utilisateur | seuls les codes d'OAuth nommés | `isProviderTextNotShown` |
| le second facteur sauté en se connectant avec un fournisseur | la même étape qu'après un mot de passe | `isSecondFactorAfterTheProvider` |
| le code ou le secret d'un parcours lu dans un log ou dans la base de données | le code dans le fragment ; la base de données ne garde que le hash du secret ; `__Host-oidc`, `HttpOnly`, `SameSite=Strict` | `isFlowCookieGuarded` |

Suite : [Passkeys et double authentification](passkeys.md).
