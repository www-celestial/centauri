# Réglages, profils et déploiement

La tâche : faire tourner l'app des factures (une app : l'application, le serveur et ses pages) sur un portable, sans
rien installer d'autre que Cesia ; puis dans un test ; puis en production, derrière https. En production, il y a un
vrai serveur Cepheus, des health checks (des adresses que l'orchestrateur interroge pour savoir si l'app vit ;
l'orchestrateur est le programme qui lance et relance les serveurs, comme Kubernetes), des métriques pour Prometheus, et
de nouvelles versions sans qu'une requête soit perdue. Le code est `src/app/settings.ce` et `src/app/app.ce` (`Run`).

Ce qu'il utilise : des réglages tirés des variables `APP_*`, lus une fois à travers une forme (ce qu'une valeur doit
être : un texte de 1 à 120 octets, un nombre entier...) ; les trois profils (un profil est une manière de lancer l'app :
dev, test ou prod) ; `/health/live` et `/health/ready` ; `/metrics` ; un arrêt qui laisse finir les requêtes en cours ;
`--workers` et `HUP` ; TLS (le chiffrement de https).

## 1. Les réglages, d'une seule façon

Chaque réglage est un champ d'une forme. Il est lu **une fois**, au démarrage, dans une variable d'environnement :
`APP_` suivi de son nom en majuscules, `CepheusUrl` dans `APP_CEPHEUS_URL`. Ce que l'environnement ne donne pas prend
le défaut de l'app (les `defaults` de `Of`), sinon celui de Centauri. Un réglage faux ou manquant arrête le démarrage,
et tous les réglages faux sont nommés d'un coup :

```text
$ APP_PROFILE=prod APP_PORT=high cesia do serve
centauri: APP_PORT: a whole number from 0 to 65535.
$ APP_PROFILE=prod cesia do serve
centauri: APP_ORIGIN: an https:// address is needed in prod.
centauri: APP_SECRET: a secret of 32 bytes at least is needed in prod (the key of the cursors and of the challenges).
centauri: APP_CEPHEUS_URL: the database is needed in prod, as cepheus://localhost:7400/app.
```

Un secret (`check.Secret()`) n'est jamais écrit dans un log (le journal où le serveur note ce qu'il fait), et
l'administration le montre `(secret)`. Ce sont par exemple `APP_SECRET`, `APP_CEPHEUS_TOKEN`, et ceux des fournisseurs
(providers), comme Google : `APP_GOOGLE_SECRET`, `APP_APPLE_KEY`... Une app ajoute ses propres réglages, avec leurs
formes, et les lit dans `r.Settings` :

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/auth
use std/check
use std/json
invoices = json.Parse("{}")!
```

```cesia norun
Settings = check.Record({MailFrom: check.Email(optional = true, default = "office@example.com")})
App = app.Of([auth.Module(), invoices.Module], settings = Settings, defaults = {Tenancy: "single"})
```

```java
// Spring Boot: application.yml, application-prod.yml, @ConfigurationProperties with @Validated, and the order of
// precedence of its 15 sources (command line, SPRING_APPLICATION_JSON, the environment, the files...)
@ConfigurationProperties("app") @Validated record AppProps(@NotBlank String origin, @NotNull Duration sessionIdle) {}
```

Les réglages de Centauri lui-même, à côté de ceux des comptes ([S'inscrire et se connecter](sign-up.md)) :

| réglage | défaut | ce que c'est |
|---|---|---|
| `APP_PROFILE` | `dev` | `dev`, `test` ou `prod` |
| `APP_ORIGIN` | `http://localhost:PORT` | l'adresse de l'app telle que les navigateurs la voient : https en prod ; son schéma décide de `__Host-` et de HSTS (un header qui dit au navigateur de ne venir qu'en https ; un header est une ligne d'information en tête d'une requête ou d'une réponse) |
| `APP_PORT`, `APP_HOST` | 8080, 127.0.0.1 | là où l'app écoute |
| `APP_CEPHEUS_URL`, `APP_CEPHEUS_TOKEN`, `APP_CEPHEUS_CA` | | la base de données ; son token (un jeton : un texte secret qui prouve un droit) ; le certificat de l'autorité de son cluster (l'ensemble de ses serveurs), pour TLS quand elle est sur une autre machine |
| `APP_CEPHEUS_READ_TOKEN`, `APP_GET_DB` | `fork` en dev et en test, `read` en prod avec le token, sinon `same` | la base de données d'un GET : un fork (une copie de la base, dans la mémoire du programme) dont les écritures sont attrapées, ou un token qui ne fait que lire |
| `APP_SECRET` | aléatoire à chaque démarrage | la clé des curseurs (la marque d'où reprend la page suivante d'une liste), des challenges (les défis que le navigateur doit résoudre ou signer), et des secrets de TOTP (le code à six chiffres d'une app d'authentification, qui change toutes les 30 secondes) et des codes de secours. 32 octets au moins, la même pour chaque worker (un des processus de l'app) et à chaque démarrage : avec une autre, aucun secret de TOTP ne peut être lu ([passkeys](passkeys.md#4-totp-et-codes-de-secours)) |
| `APP_CERT`, `APP_KEY` | | un certificat et sa clé, en PEM : https |
| `APP_HTTP3`, `APP_HTTP3_PORT` | `off`, 0 | `on` : HTTP/3 sur QUIC (un transport sur UDP) à côté de TCP, les mêmes routes, sur le port UDP `APP_HTTP3_PORT` (0 : `APP_PORT`) ; demande `APP_CERT` et `APP_KEY` ; un système sans QUIC (pas de ngtcp2 sur un OpenSSL 3.5 ou plus récent) laisse TCP seul, avec un avertissement ([ce que QUIC ajoute](connection.md#11-ce-que-quic-ajoute-et-quand-on-revient-à-tcp)) |
| `APP_HTTP3_CONGESTION` | `bbr` | la vitesse à laquelle HTTP/3 envoie, réglée sur ce que le chemin laisse passer : `bbr` (le plus rapide sur chaque lien que mesure le livre de Cesia), `cubic` ou `reno` |
| `APP_WEBTRANSPORT` | `off` | `on` : les écrans en direct prennent des sessions WebTransport (un canal entre la page et l'app, sur HTTP/3), que les pages mettent en course avec WebSocket (le même canal, sur TCP) ; demande `APP_HTTP3=on` sur `APP_PORT` |
| `APP_CORS` | | les origines des partenaires (une origine : le début d'une adresse, son schéma, son hôte et son port), séparées par des virgules |
| `APP_TRUST_PROXY` | false | l'adresse du client est la dernière de `X-Forwarded-For`, qu'écrit le proxy (un serveur intermédiaire) placé devant |
| `APP_LIMIT_IP`, `APP_LIMIT_USER`, `APP_LIMIT_TENANT` | 600, 1 200, 6 000 | des requêtes par minute, avec des rafales d'un quart ; chaque requête compte, même une requête refusée à cause de son rôle |
| `APP_MAX_BODY`, `APP_TIMEOUT` | 1 MiB, 60 s | le plus grand corps de requête ; le temps d'une requête, de son premier octet à sa réponse |
| `APP_LOG_REQUESTS`, `APP_LOG_LINES` | true (false en test), 1 000 | une ligne de log par requête ; les lignes que garde l'administration |
| `APP_ADMIN_PORT` | 0 (aucun) | `/metrics` pour Prometheus, sur 127.0.0.1 seulement |
| `APP_CSP` | les scripts et le WebAssembly de l'app elle-même | la Content-Security-Policy (le header qui dit au navigateur ce qu'une page a le droit de charger et de lancer) |
| `APP_UPLOAD_PART`, `APP_UPLOADS_AT_ONCE` | 1 MiB, 16 | les parties d'un fichier dans le vault (le coffre de fichiers de Cepheus) ; les uploads (les envois de fichiers) qu'un processus prend en même temps ([le scan](scans.md)) |
| `APP_CALL_TIMEOUT`, `APP_CALL_PLAIN`, `APP_CALL_ALLOW`, `APP_CALL_CA` | 10 s, `refuse`, aucun | les appels vers d'autres services : leur délai, le http en clair, les hôtes du réseau qu'ils ont le droit d'atteindre, leurs autorités ([le partenaire](partner.md)) |
| `APP_IDEMPOTENCY_KEY`, `APP_IDEMPOTENCY_TIME` | `honored`, un jour | le header `Idempotency-Key` (une clé qui fait qu'une requête envoyée deux fois ne s'exécute qu'une fois) : honoré, exigé ou ignoré ; combien de temps une clé est gardée |
| `APP_IDEMPOTENCY_SCOPE`, `APP_IDEMPOTENCY_LEASE` | `account`, 0 | à qui est une clé, au compte ou à la session ; après combien de temps une clé laissée en cours par un serveur arrêté est lâchée pour un nouvel essai, 0 jamais ([quand la connexion tombe](connection.md)) |
| `APP_OUTBOX`, `APP_OUTBOX_COUNT`, `APP_OUTBOX_BYTES`, `APP_OUTBOX_WAIT` | `on`, 100, 1 Mio, une heure | les actions d'une page demandées pendant qu'elle est coupée de son application : gardées dans l'ordre et envoyées à son retour (`off` : refusées tout de suite) ; le plus qui attendent, leurs octets, combien de temps une action peut attendre ([quand la connexion tombe](connection.md)) |
| `APP_RECONNECT_FIRST`, `APP_RECONNECT_MAX` | 500 ms, 30 s | les bornes de l'attente d'une page avant de réessayer son application, tirée au hasard sous une borne qui double (*full jitter*) |
| `APP_PING_EVERY`, `APP_DEAD_AFTER` | 15 s, 30 s | le *heartbeat* d'une page (un petit message régulier qui prouve que l'autre côté entend), et le silence de son application qu'elle prend pour une coupure (plus que `APP_PING_EVERY`) |
| `APP_RESUME_TIME`, `APP_RESUME_BYTES` | 120 s, 1 Mio | combien de temps l'application garde un écran live dont la connexion a lâché, et les octets de ses trames, pour la page qui revient (0 : jamais) |
| `APP_JOB_WORKERS`, `APP_JOB_KEEP` | 4, une semaine | les fibers (une fiber est un fil d'exécution léger, à l'intérieur du processus) d'un processus qui font tourner les jobs (un job : un travail fait en arrière-plan, hors de la requête) ; 0 : aucune ici ; combien de temps un job fini est gardé ([le rapport](nightly-report.md)) |
| `APP_MAIL_URL`, `APP_MAIL_FROM`, `APP_MAIL_TIMEOUT`, `APP_MAIL_CA` | `log:` en dev, `test:` en test, requis en prod | le transport des mails, leur expéditeur, leur délai, les autorités du serveur d'une entreprise |
| `APP_EMAIL_CHECK`, `APP_SIGN_UP_ANSWER`, `APP_CHECK_TIME`, `APP_RESET_TIME`, `APP_CHECK_PAGE`, `APP_RESET_PAGE`, `APP_MAILS_PER_HOUR` | `off`, `tell`, 2 jours, 1 heure, `/check-email`, `/reset-password`, 5 | les vérifications d'adresses, et les nouveaux mots de passe par mail ([la vérification](check-email.md)) |
| `APP_HOOK_TOLERANCE`, `APP_HOOK_TIMEOUT` | 300 s, 15 s | les webhooks (un webhook : un appel HTTP que l'app envoie à un partenaire quand quelque chose arrive) : à quelle distance de maintenant peut être un message reçu ; le délai de chaque essai |
| `APP_ADMIN_PATH` | `/admin` | là où les pages d'administration sont servies, `off` pour aucune ([les pages d'administration](admin.md)) |
| `APP_LANGS` | `en` | les langues que parle l'app, séparées par des virgules, la première étant le défaut ; `en` seul ne traduit rien ; les pages d'administration les parlent aussi : l'anglais et le français ([les langues](languages.md)) |
| `APP_KEY_LIMIT` | 600 | les requêtes par minute de chaque clé de programme (une *API key* : un secret qu'un programme envoie à la place d'une personne connectée), avec une rafale d'un quart, à part de celles des utilisateurs ([l'API pour un partenaire](partner-api.md)) |
| `APP_PASSWORDS` | `on` | `off` : ni inscription ni connexion par mot de passe, seulement les passkeys (des clés d'accès gardées par l'appareil, qui remplacent le mot de passe) et les fournisseurs |
| `APP_TWO_FACTOR`, `APP_TWO_FACTOR_ROLES` | `optional`, aucun | TOTP `off`, `optional` (un utilisateur l'active) ou `required` (exigé de tout le monde) ; les rôles, séparés par des virgules, qui doivent avoir un second facteur (`super` pour les super-admins, les administrateurs de toute la plateforme, au-dessus des tenants, ses clients) ([passkeys](passkeys.md)) |
| `APP_TOTP_ALGORITHM`, `APP_TOTP_DIGITS`, `APP_TOTP_PERIOD`, `APP_TOTP_SKEW`, `APP_TOTP_ISSUER` | `SHA1`, 6, 30 s, 1, le nom de l'app | les codes de TOTP : `SHA1` ou `SHA256`, de 6 à 8 chiffres, de 15 à 120 secondes par code, de 0 à 3 codes acceptés avant et après maintenant ; le nom que montre l'app de codes |
| `APP_STEP_TIME`, `APP_STEP_TRIES` | 300 s, 5 | combien de temps attend la seconde étape d'une connexion (de 60 à 1 800), et combien de codes accepte un ticket (de 1 à 20) |
| `APP_PASSKEYS`, `APP_PASSKEY_CHECK`, `APP_PASSKEY_TIME`, `APP_PASSKEY_COUNTER`, `APP_PASSKEY_ORIGINS` | `on`, `required`, 300 s, `refuse`, aucune | les passkeys : activées ou non ; la vérification de son utilisateur par l'appareil, `required`, `preferred` ou `discouraged` ; combien de temps attend une cérémonie (un échange entre le serveur et l'appareil, dans les mots de WebAuthn), de 30 à 1 800 ; un compteur qui recule, refusé ou seulement noté (`allow`) ; d'autres origines d'où peut venir une cérémonie, séparées par des virgules |
| `APP_RP_ID`, `APP_RP_NAME` | l'hôte d'`APP_ORIGIN`, le nom de l'app | la *relying party* des passkeys (la partie qui se fie à l'appareil : le site) : l'id auquel elles sont liées, et le nom que montre l'appareil |
| `APP_INVITE_PAGE` | `/join` | la page du front (la partie de l'app qui tourne dans le navigateur) qu'ouvre le lien d'une invitation, sous `APP_ORIGIN`, avec le code dans son fragment (la partie de l'adresse après `#`, que le navigateur n'envoie jamais au serveur) |
| `APP_SIGN_IN_WITH` | aucun | les fournisseurs avec lesquels on se connecte, séparés par des virgules : `google`, `microsoft`, `apple`, `github`, `oidc`, ou un fournisseur propre à l'app (`auth.Provider`) ; chacun a besoin de ses réglages, sinon le démarrage s'arrête ([Google](google.md)) |
| `APP_OIDC_LINK`, `APP_OIDC_SIGN_UP`, `APP_OIDC_PAGE`, `APP_OIDC_TIME` | `verified`, `on`, `/signin/callback`, 600 s | un compte lié par une adresse que le fournisseur a vérifiée, ou `never` ; un compte créé à une première connexion, ou `off` ; la page à laquelle le callback (l'adresse où le fournisseur renvoie le navigateur) passe la réponse du fournisseur ; combien de temps attend une connexion par un fournisseur (de 60 à 3 600) |
| `APP_GOOGLE_ID`, `APP_GOOGLE_SECRET` | aucun | le client de l'app chez Google (l'app telle que le fournisseur la connaît, par un id et un secret) |
| `APP_MICROSOFT_ID`, `APP_MICROSOFT_SECRET`, `APP_MICROSOFT_TENANT` | aucun, aucun, `common` | le client de l'app chez Microsoft, et son tenant (chez Microsoft, l'annuaire des comptes d'une organisation) : `common`, `organizations`, `consumers`, ou l'id d'un tenant |
| `APP_APPLE_ID`, `APP_APPLE_TEAM`, `APP_APPLE_KEY_ID`, `APP_APPLE_KEY` | aucun | le *Services ID* d'Apple, l'équipe, l'id de la clé, et la clé (`.p8`, PEM) qui signe le client secret |
| `APP_GITHUB_ID`, `APP_GITHUB_SECRET` | aucun | le client de l'app chez GitHub |
| `APP_OIDC_ISSUER`, `APP_OIDC_ID`, `APP_OIDC_SECRET`, `APP_OIDC_NAME`, `APP_OIDC_SCOPES` | aucun, aucun, aucun, `SSO`, `openid email profile` | n'importe quel fournisseur d'OpenID Connect (le standard par lequel un fournisseur dit à une app qui s'est connecté) : son émetteur (issuer : celui qui signe le token et s'y nomme), en https ; son client ; le titre de son bouton ; ses scopes (les informations que l'app demande au fournisseur) |
| `APP_<NAME>_ID`, `APP_<NAME>_SECRET` | aucun | le client d'un fournisseur propre à l'app : `auth.Provider("okta", ...)` lit `APP_OKTA_ID` et `APP_OKTA_SECRET` |
| `APP_FLAGS_REFRESH` | 1 s | tous les combien un processus relit les feature flags (un feature flag : un interrupteur qui ouvre une fonction à tous, à une part des utilisateurs, à un tenant ou à un utilisateur), de 0 à 3 600 secondes ([les flags](flags.md)) |

## 2. Trois profils

Voici leurs seules différences ; rien d'autre ne change avec eux :

| | dev | test | prod |
|---|---|---|---|
| le détail d'un 500 (le code « erreur du serveur ») dans sa réponse | oui | oui | non : seulement le numéro de la requête |
| `/openapi.json` | oui | oui | non |
| `APP_ORIGIN`, `APP_SECRET`, `APP_CEPHEUS_URL` | défauts | défauts | requis, https |
| la base de données d'un GET | un fork : une écriture est attrapée, un 500 qui nomme la route (une adresse de l'API avec sa méthode HTTP, et la fonction qui y répond) | de même | un token qui ne fait que lire, quand il est donné |
| sans `APP_CEPHEUS_URL` | une base de données en mémoire, qui ne garde rien | (le fork d'apptest) | refusé |
| une ligne de log par requête | oui | non | oui |

## 3. Santé et métriques

- `GET /health/live` : 200 tant que le processus répond. `GET /health/ready` : 200 tant que la base de données répond
  et que le processus n'est pas en train de s'arrêter, sinon 503. Ils passent avant les limites. Ce sont eux que
  demandent le `HEALTHCHECK` de Docker et les probes de Kubernetes (les questions qu'il pose à un conteneur pour savoir
  s'il vit et s'il est prêt).
- Chaque requête écrit une ligne de JSON : son numéro, sa méthode, sa route (le motif, jamais la query, la partie de
  l'adresse après `?`), son statut, son temps en millisecondes, son adresse, son utilisateur. Jamais un corps, un cookie
  (un petit texte que le navigateur garde et renvoie à chaque requête) ou un token.
- `centauri_requests_total{route,status}`, `centauri_refused_total{reason}` (`origin`, `limit`, `signin`, `role`),
  `centauri_signins_total{result}` (`ok`, une session ouverte par n'importe quelle entrée ; `failed`), et les `http_*`
  de std/metrics : sur `127.0.0.1:APP_ADMIN_PORT/metrics` pour Prometheus, et en lignes à
  `GET /admin/metrics` pour le super-admin.

## 4. En production

```sh
cepheus token add invoices --database invoices=write --config /etc/cepheus/cluster.toml > /etc/invoices/app.token
cepheus token add invoices-read --database invoices=read --config /etc/cepheus/cluster.toml > /etc/invoices/read.token
export APP_PROFILE=prod APP_ORIGIN=https://invoices.example APP_HOST=0.0.0.0 APP_PORT=8443
export APP_CEPHEUS_URL=cepheus://localhost:7400/invoices APP_CEPHEUS_TOKEN="$(cat /etc/invoices/app.token)"
export APP_CEPHEUS_READ_TOKEN="$(cat /etc/invoices/read.token)" APP_SECRET="$(cat /etc/invoices/secret)"
export APP_CERT=/etc/invoices/fullchain.pem APP_KEY=/etc/invoices/key.pem APP_ADMIN_PORT=9090
cesia run --workers 4 --allow native=cepheus,ffi=sodium,ffi=ssl,ffi=crypto,env,net,read=/etc/invoices src/main.ce
APP_ADMIN_EMAIL=ops@invoices.example APP_ADMIN_PASSWORD=... cesia do admin    # the first super-admin
```

- `--workers 4` sert le port avec 4 processus (chacun a sa propre copie de la base en mémoire, et ses propres
  limites). `kill -HUP` les remplace sans perdre une connexion. `kill -TERM` cesse d'en prendre de nouvelles, laisse
  finir celles qui sont en cours, chacune avant son délai, puis sort.
- Une image (ce que lance un conteneur, comme une image Docker) : une base avec la libc, `cesia` et son `lib/`, le
  dossier de l'app avec ses `deps/` (vérifiés par `cesia.lock`). Ni JVM, ni `node_modules`.

```java
// Spring Boot: spring-boot-starter-actuator for health and metrics, management.server.port for a port apart,
// server.shutdown=graceful, server.ssl.* for TLS, and a JRE in the image
```

## 5. Ses tests

`src/app/app.test.ce` : les headers de chaque réponse, et HSTS en https seulement (`isSecurityHeaders`) ; le détail
d'un 500 caché en prod (`isOutputFilteredAndErrorsHidden`) ; OpenAPI (le format standard qui décrit une API HTTP) en
test seulement (`isOpenApiInTestOnly`) ; les limites (`isLimited`) ; un GET qui écrit, refusé
(`isGetThatWritesRefused`) ; les réglages masqués pour l'administration (`isAdminOfTheApp`). Et dans la référence de
`Read`, un démarrage en prod sans ses réglages, chacun nommé.
