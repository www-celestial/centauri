# S'inscrire et se connecter

La tâche : quelqu'un crée un compte pour son cabinet et en devient l'owner (le propriétaire). Il invite un comptable,
qui s'inscrit avec l'invitation et rejoint le cabinet. Chacun se connecte avec son e-mail et son mot de passe, voit
ses sessions (une session est le temps où un utilisateur reste connecté), se déconnecte de l'une ou de toutes. Et
personne n'entre en devinant, par un bot (un programme qui se fait passer pour un visiteur) ou depuis un autre site.
Sur Centauri, c'est une ligne de l'app (l'application, le serveur et ses pages), `auth.Module()`, et des réglages. Ce
chapitre dit ce qu'elle fait, et comment la changer. Le code est dans `src/auth/`, ses tests dans
`tests/auth.test.ce`, et l'app des factures s'en sert dans `examples/invoices`.

Ce qu'il utilise :

- Argon2id (la fonction qui calcule l'empreinte d'un mot de passe) ;
- des sessions faites d'un token (un jeton : un texte secret qui prouve un droit) coupé en deux ;
- le cookie (un petit texte que le navigateur garde et renvoie à chaque requête) `__Host-sid` ;
- les tenants (un tenant est un client de la plateforme, comme un cabinet ou une entreprise, avec ses données à lui),
  plusieurs ou un seul ;
- l'inscription ouverte, sur invitation ou fermée ;
- les rôles ;
- la déconnexion partout ;
- les limites (le nombre de requêtes permis dans un temps donné), les blocages ;
- la preuve de travail (proof of work : un petit calcul que le navigateur doit faire avant d'envoyer, qui coûte cher à
  un robot) ;
- le champ piège (un champ caché du formulaire, que seul un bot remplit) ;
- CSRF (cross-site request forgery : une requête envoyée par la page d'un autre site, avec le cookie de
  l'utilisateur) ;
- les headers de sécurité (les en-têtes que porte chaque réponse HTTP).

## 1. Le module des comptes

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

Il sert le contrat `api.Accounts` (package api, `src/api/auth.ce`), qu'une page lit comme tout autre. Un contrat dit ce
que prend un endpoint (une adresse de l'API avec sa méthode HTTP, comme `POST /clients`), ce qu'il rend et le rôle
qu'il demande ; il est lu par le serveur et par les pages :

| endpoint | ce qu'il fait |
|---|---|
| `POST /auth/signup` | crée un compte et le connecte ; dans une app à plusieurs tenants, crée aussi son tenant, dont il est l'owner |
| `POST /auth/signin` | connecte : un cookie de session revient |
| `POST /auth/signout`, `/auth/signout-all` | termine cette session, ou toutes les sessions de l'utilisateur |
| `GET /auth/me`, `/auth/sessions`, `DELETE /auth/sessions/:id` | qui est connecté, ses sessions, en terminer une |
| `POST /auth/password` | un nouveau mot de passe : l'ancien est demandé, les autres sessions sont terminées |
| `GET /auth/challenge` | un défi de preuve de travail, quand il en faut un |
| `GET /auth/members`, `POST /auth/invites`, `PUT /auth/members/:id/roles`, `DELETE /auth/members/:id` | les membres du tenant, pour ses admins |
| `POST /auth/join`, `GET /auth/tenants`, `POST /auth/tenant` | prendre une invitation avec un compte, les tenants de l'utilisateur, entrer dans un autre |

Une app qui demande plus à l'inscription le dit dans son contrat, `SignUp = api.SignUpOf({Phone: check.Text(6, 20)})`,
et le donne au module, `auth.Module(signUp = SignUp, facts = f)`. `f(user, tenant, x)` rend les faits (les données de
Cepheus : chacun dit qu'une chose a un champ d'une valeur) qu'elle écrit dans le même groupe que le compte (un groupe
d'écritures, que Cepheus applique en entier ou pas du tout). Le compte et les faits de l'app existent ensemble, ou
aucun des deux.

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

## 2. Les mots de passe

Un mot de passe n'est gardé que par son hash (une empreinte : un nombre calculé à partir d'un texte, d'où on ne peut
pas revenir au texte) Argon2id (RFC 9106 ; les réglages de libsodium, une bibliothèque de cryptographie : 64 MiB,
2 passes), soit environ 65 ms d'un cœur. Les hashs se calculent sur des threads (des fils d'exécution) à eux, au plus
`APP_HASH_SLOTS` à la fois (2 par défaut), chacun avec au plus 64 autres qui attendent. Un flot de connexions prend donc
une mémoire bornée, et reçoit un 503 (le code HTTP « service indisponible ») au-delà. Un mot de passe a de
`APP_PASSWORD_MIN` (12 par défaut) à 128 octets, et aucune règle de composition (NIST SP 800-63B, 5.1.1.2, n'en
conseille aucune). Un login (l'identifiant de connexion) qui n'existe pas est vérifié contre le hash d'un mot de passe
tiré au hasard : il prend donc autant de temps, et reçoit la même réponse. Le temps et les mots d'une réponse ne disent
à personne quels comptes existent (`isUnknownLoginAnsweredAsAWrongPassword`).

## 3. Les sessions

Le cookie est `id.secret` : `id` est la chose (*thing* dans le code) de la session dans Cepheus, `secret` 32 octets
tirés au hasard par le noyau. La base de données ne garde que le hash BLAKE2b du secret : une copie volée de la base
n'ouvre donc aucune session (`isNoSecretKept`). Une requête lit la session par son id (dans la mémoire du programme),
calcule le hash du secret et compare en temps constant. Il n'y a aucune recherche par la valeur du secret, qu'une
mesure du temps pourrait apprendre.

Chaque processus garde ensuite ce qu'il a lu, pendant `APP_SESSION_CACHE` secondes (2 par défaut, jusqu'à 60 ; 0 ne
garde rien), dans l'état qui compte aussi ses limites. Les requêtes suivantes de cette session, pendant ces secondes, ne
lisent rien dans la base, et leur session et toutes leurs limites coûtent un seul aller-retour vers cet état
([Vitesse](speed.md)). La clé sous laquelle c'est gardé est le BLAKE2b du cookie entier : une recherche par cette clé
ne dit donc rien du secret par son temps. Un cookie fait à la main, ou un id volé avec un autre secret, est un cookie
jamais vu : il est lu dans la base comme avant, et refusé (`isForgedCookieNobodyBesideAKeptOne`). Un cookie qui ne
nomme personne est gardé comme « personne » : un navigateur qui continue d'envoyer une session terminée ne coûte pas
de lecture non plus. Le temps qu'un changement met à être vu :

| un changement | dans le processus qui l'a fait | dans les autres workers de `--workers` (les processus qui servent la même app), ou écrit directement dans Cepheus |
|---|---|---|
| la déconnexion, la déconnexion partout, une session terminée, un nouveau mot de passe | à la requête suivante | en `APP_SESSION_CACHE` secondes au plus |
| un rôle donné ou retiré, un membre sorti, un utilisateur désactivé ou fait super-admin (l'administrateur de toute la plateforme, au-dessus des tenants), par les routes (un endpoint et la fonction qui y répond) des comptes | à la requête suivante | en `APP_SESSION_CACHE` secondes au plus |
| la fin de la session elle-même, par inactivité ou en tout | exacte : ce qui est gardé finit avec elle | exacte |

Une écriture d'un utilisateur connecté, par les routes des comptes, fait oublier toutes les sessions que garde son
processus : la requête suivante de chacune relit sa session (`isRoleTakenSeenAtOnce`, `isSignedOutForGood`,
`isRemovedMemberOut`, `isDisabledBySuper`). Une écriture qu'aucune route des comptes n'a faite est vue quand ce qui
était gardé arrive à sa fin (`isChangeOutsideSeenWithinSessionCache`). Spring Security garde les rôles d'une session
dans la session, depuis sa connexion : là, un rôle retiré ne compte qu'à la prochaine connexion de l'utilisateur, à
moins que l'app ne termine elle-même ses sessions.

```text
Set-Cookie: __Host-sid=65581.9f2c...e41a; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict; Secure
```

- `__Host-` : le navigateur exige `Secure`, `Path=/` et aucun `Domain`, donc aucun sous-domaine ne peut le poser. En
  http simple (dev sur une autre machine du réseau), c'est `sid`, sans `Secure`.
- `HttpOnly` : aucun script de la page ne le lit (le vol du token par XSS, cross-site scripting : un script d'un
  attaquant glissé dans la page) ; `SameSite=Strict` : aucune page d'un autre site ne l'envoie.
- Une session finit après `APP_SESSION_IDLE` secondes sans être vue (8 heures) et `APP_SESSION_MAX` en tout
  (30 jours). Un nouveau secret à chaque connexion (pas de fixation de session : un attaquant ne peut pas faire garder
  à la victime, après sa connexion, un secret qu'il connaît d'avance). Se déconnecter la retire, donc une copie volée
  du cookie ne vaut plus rien ensuite (`isSignedOutForGood`). Un utilisateur désactivé, ou sorti de son tenant, est
  dehors à sa requête suivante.
- Une app native garde le même `id.secret` dans le Keychain ou le Keystore (les coffres à secrets d'Apple et
  d'Android) et l'envoie dans un header `Cookie` : une seule manière.

Chaque requête a alors `r.User` : `{Id, Tenant, Member, Session, Roles, Super, Email, Name, Until}`, ses rôles avec
tous les rôles qu'ils incluent, et `Until`, l'heure où sa session finit si elle n'est pas revue d'ici là.

## 4. Tenants, inscription, invitations

| réglage | valeurs | ce qu'il fait |
|---|---|---|
| `APP_TENANCY` | `multi` (défaut), `single` | plusieurs tenants, chacun créé par son premier owner ; ou un seul pour tout le monde, dont le premier utilisateur est l'owner |
| `APP_SIGN_UP` | `open` (défaut), `invite`, `closed` | tout le monde s'inscrit ; seulement avec une invitation ; personne (les comptes sont faits par un admin) |
| `APP_OWNER_ROLES`, `APP_MEMBER_ROLES` | des rôles, séparés par des virgules | les rôles de qui crée un tenant (`owner`), et de qui rejoint le tenant unique (`member`) |
| `APP_INVITE_TIME` | secondes | la durée d'une invitation (une semaine) |

Un admin d'un tenant invite : `POST /auth/invites {Email, Roles}` donne un code une seule fois (seul son hash est
gardé), pour cet e-mail seulement. S'inscrire avec ce code, ou faire `POST /auth/join` avec un compte, crée un membre
avec ces rôles, une seule fois (`isByInvitationOnly`). L2 l'envoie par mail.

Personne ne donne ni ne retire un rôle qu'il n'a pas lui-même : un admin ne fait pas d'owner, et ne retire rien à un
owner. Un tenant garde au moins un owner (`isNoRaiseOfOwnRoles`).

```java
// Spring Boot: an Invitation entity, its repository, a controller that checks the token, the e-mail, the expiry,
// and a role hierarchy bean: RoleHierarchyImpl.fromHierarchy("owner > admin > accountant")
```

## 5. Contre les essais au hasard et les bots

| défense | réglage (défaut) | ce que rencontre un attaquant |
|---|---|---|
| limite des connexions par adresse | `APP_SIGN_IN_PER_IP` (20 par minute) | un 429 (le code « trop de requêtes ») avec `Retry-After` |
| limite des inscriptions par adresse | `APP_SIGN_UP_PER_IP` (10 par heure) | un 429 |
| nouveaux tenants par heure, pour tous | `APP_TENANTS_PER_HOUR` (100) | un 429 : pas de flot de tenants |
| blocage d'un login | `APP_LOCK_AFTER` (5), `APP_LOCK_MOST` (900 s) | après 5 échecs de suite, une attente de 1 s, puis 2, 4... jusqu'à 15 minutes, pour toutes les adresses ; le bon mot de passe attend aussi |
| preuve de travail | `APP_POW` (`attack`), `APP_POW_BITS` (18), `APP_POW_AFTER` (50) | sous attaque (50 connexions ratées dans la dernière minute, ou 3 pour ce login), un 428 (le code « condition préalable requise ») avec un défi : 2^18 hashs pour le client, un pour le serveur, une réponse qui ne sert qu'une fois |
| champ piège | `APP_HONEYPOT` (`Website`) | une inscription dont le champ caché est rempli est refusée, et fait un événement `bot` |
| limites de chaque requête | `APP_LIMIT_IP` (600), `APP_LIMIT_USER` (1 200), `APP_LIMIT_TENANT` (6 000) par minute | un 429 |

Les échecs d'un login sont comptés dans Cepheus, donc chaque worker les voit. Les limites sont comptées dans la mémoire
de chaque processus (GCRA, le generic cell rate algorithm : un seul nombre par clé) : 600 par minute, c'est donc 600 par
minute dans chacun des processus de `--workers 4`. Le blocage retarde plutôt qu'il ne ferme : un attaquant qui essaie
le login d'une victime ne peut pas la tenir dehors longtemps, et chaque essai lui coûte une preuve de travail dès que
l'attaque est vue.

La preuve de travail, du côté du client, quand une connexion répond un 428 :

```text
1. GET /auth/challenge, or the challenge of the 428: {"Challenge": "1794528600.18.9c41...e0.5d2f...", "Bits": 18}
2. find a nonce n such that BLAKE2b-256("<challenge>.<n>") starts with 18 bits at zero
3. send again, with "Proof": "<challenge>:<n>"
```

`auth.Solve(challenge, keys)` fait l'étape 2 en Cesia, pour un test ou un programme ; une page la fait en WebAssembly
(le code compilé que le navigateur exécute).

## 6. Les autres sites, et les headers

- Une requête qui change quelque chose depuis une page d'un autre site (`Sec-Fetch-Site: cross-site`, ou une `Origin`
  autre que `APP_ORIGIN`) reçoit un 403 (le code « interdit »), et la session de son cookie n'est jamais lue (CSRF).
  Pas de token à porter dans les formulaires.
- La page d'un partenaire (une origine de `APP_CORS` ; une origine est le schéma, l'hôte et le port d'un site) peut
  lire les réponses, et demande avant d'écrire (le preflight CORS : une requête que le navigateur envoie d'abord pour
  demander la permission) ; elle n'a pas de session (jamais de credentials, les cookies et identifiants que le
  navigateur joindrait ; jamais `*`).
- Chaque réponse a `Content-Security-Policy` (`APP_CSP` : aucun script sauf ceux de l'app et son WebAssembly, pas de
  framing, la page montrée dans le cadre d'une autre), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
  `Cache-Control: no-store`, et en https `Strict-Transport-Security` pour deux ans.

## 7. Ses tests

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

`tests/auth.test.ce` a un test par menace : deviner (`isLockedAfterFailures`), des comptes trouvés par leur réponse
(`isUnknownLoginAnsweredAsAWrongPassword`), une preuve de travail rejouée ou forgée (`isProofOfWorkAsked`), l'attaque
vue (`isProofOfWorkUnderAttack`), les bots (`isBotTrapped`), les flots (`isSignUpLimitedByAddressAndTenantsByHour`),
une session volée (`isSignedOutForGood`, `isSessionIdleAndOld`, `isForgedCookieNobody`), des secrets dans la base ou
dans les logs, les journaux où le serveur écrit ce qui se passe (`isNoSecretKept`), des rôles élevés
(`isNoRaiseOfOwnRoles`), un membre sorti (`isRemovedMemberOut`), un utilisateur désactivé (`isDisabledBySuper`), ce
que chaque processus garde des sessions (`isRoleTakenSeenAtOnce`, `isChangeOutsideSeenWithinSessionCache`,
`isForgedCookieNobodyBesideAKeptOne`), et les réglages des tenants et de l'inscription (`isSingleTenant`,
`isByInvitationOnly`).
