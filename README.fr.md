# Centauri

Centauri est le framework backend de [Cesia](https://github.com/www-celestial/cesia-lang), sur la base de données
[Cepheus](https://github.com/www-celestial/cepheus) : des API typées ; des comptes, des tenants (les clients de la
plateforme, comme des cabinets ou des entreprises, chacun avec ses données) et des rôles ; la connexion avec Google et
les autres fournisseurs (providers) ; les passkeys (des clés d'accès gardées par l'appareil, qui remplacent le mot de
passe) et la double authentification ; les clés de programme ; des défenses contre les bots et contre les mots de passe
devinés ; les traductions ; les feature flags (des interrupteurs qui ouvrent une fonction à tous, à une part des
utilisateurs, à un tenant ou à un utilisateur) ; une administration de toute la plateforme ; et des tests d'une app
entière en mémoire. Le tout est écrit avec des fonctions et des records (des valeurs faites de champs nommés). Pas de
classe, pas d'annotation, pas de conteneur de dépendances : ce qu'utilise un handler (la fonction qui répond à une
requête) arrive dans sa requête.

**Documentation en français : https://www-celestial.github.io/centauri/fr/** (en anglais : https://www-celestial.github.io/centauri/)

La famille : [Cesia](https://www-celestial.github.io/cesia-lang/) (le langage) · [Cemacs](https://www-celestial.github.io/cemacs/) (l'éditeur) ·
[Cepheus](https://www-celestial.github.io/cepheus/) (la base de données) · [Ceti](https://www-celestial.github.io/ceti/) (le pilote de navigateur) ·
[Centauri](https://www-celestial.github.io/centauri/) (le backend).

```cesia norun
(* src/notes/endpoints/endpoints.ce: the contract, read by the server and by the pages *)
use deps/www-celestial/centauri/src/api
use std/check

Note = check.Record({Id: check.Id(), Text: check.Text()})
Add = api.Post("/notes", body = check.Record({Text: check.Text(1, 500)}), out = Note, role = "member")

(* src/notes/notes.ce: the kind, the handler, the module *)
use deps/www-celestial/cepheus/cesia/cepheus
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/auth
use src/notes/endpoints as e

Kind = app.Kind("note", {Tenant: cepheus.Link(), Text: cepheus.Text()})

defn add(r, x)
  made = cepheus.Insert(Kind, {Tenant: r.User.Tenant, Text: x.Text}, r.Db, by = r.User.Id, why = r.Why)?
  app.Own(Kind, made, r)
end

App = app.Of([auth.Module(), app.Module("notes", kinds = [Kind], serve = [app.Serve(e.Add, add)])])

(* src/main.ce *)
app.Run(App)
```

C'est un serveur entier ([`examples/notes`](https://github.com/www-celestial/centauri/tree/main/examples/notes), avec
ses tests). `POST /notes` prend un corps JSON vérifié par sa forme (ce qu'une valeur doit être ; un 422 avec chaque
champ faux), répond 401 sans session et 403 sans le rôle, écrit dans le tenant de celui qui demande, garde qui a écrit
et pourquoi, et ne renvoie que les champs de `Note`. Avec lui viennent l'inscription et la connexion, les sessions, les
membres, les invitations, les endpoints de l'administration et `/openapi.json` en dev.

## Ce qu'il apporte

- **Contrats** : les endpoints (une adresse de l'API avec sa méthode HTTP, comme `POST /clients`) sont des valeurs
  (`api.Get`, `api.Post`...), avec leurs formes tirées de `std/check`, lues par le serveur et par les pages (une
  définition, deux côtés) ; OpenAPI 3.2 fait à partir d'eux ; les erreurs comme une seule valeur Cesia, envoyées en
  Problem Details (le format standard des erreurs d'une API HTTP, RFC 9457) ; des pages par un curseur scellé, jamais
  par un offset (un décalage en nombre de lignes).
- **Comptes** : les mots de passe hachés avec Argon2id ; les sessions (le temps où un utilisateur reste connecté)
  faites d'un token (un jeton : un texte secret qui prouve un droit) coupé en deux, dans le cookie `__Host-sid`
  (HttpOnly, Secure, SameSite=Strict), un petit texte que le navigateur garde et renvoie à chaque requête ; des
  tenants, plusieurs ou un seul (`APP_TENANCY`) ; l'inscription ouverte, sur invitation ou fermée (`APP_SIGN_UP`) ; les
  invitations par mail ; des rôles qui incluent des rôles, et personne ne donne un rôle qu'il n'a pas.
- **Connexion avec un fournisseur** (OpenID Connect) : Google, Microsoft, Apple, GitHub, tout fournisseur par son
  issuer (l'adresse qui le nomme), et ceux de l'app elle-même (`APP_SIGN_IN_WITH`) ; le code avec PKCE, `state` et
  `nonce` tirés d'un cookie du navigateur, l'ID token (le jeton que le fournisseur signe pour dire qui s'est connecté)
  vérifié par les clés du fournisseur (gardées, et relues quand elles changent), l'`iss` de la RFC 9207 ; un compte lié
  seulement par une adresse que le fournisseur a vérifiée, ou créé à la première connexion.
- **Passkeys et double authentification** : les passkeys de WebAuthn niveau 3 (ES256, EdDSA, RS256, PS256 ; l'origine ;
  la relying party, soit le site tel que l'appareil le connaît ; l'utilisateur vérifié ; un compteur qui ne peut pas
  reculer), une inscription sans mot de passe ; TOTP (le code à six chiffres d'une app d'authentification, qui change
  toutes les 30 secondes) et les codes de secours, scellés et hachés avec une clé, chaque code une seule fois ; une
  seconde étape de la connexion, demandée à tous ou à certains rôles (`APP_TWO_FACTOR`, `APP_TWO_FACTOR_ROLES`), sur
  chaque voie d'entrée.
- **Clés de programme** (un secret qu'un programme envoie à la place de la session d'une personne) :
  `Authorization: Bearer id.secret`, avec certains des rôles de celui qui l'a créée, montrée une fois, hachée, limitée à
  part (`APP_KEY_LIMIT`), jamais sur les comptes, révoquée dès la requête suivante ; nommée dans le document OpenAPI.
- **Langues** (`i18n`) : des catalogues de messages partagés par le serveur et les pages, les règles de pluriel de CLDR
  (la base de données d'Unicode sur les langues), la langue du compte puis celle du navigateur (`APP_LANGS`), les
  Problem Details, les erreurs des formes et les mails traduits ; le français vient avec.
- **Feature flags** (`flags`) : pour tout le monde, une part des utilisateurs, un tenant ou un utilisateur ; des faits
  dans Cepheus lus en mémoire, basculés sans redémarrage.
- **Un générateur** : `cesia do new-module NAME` écrit un module qui marche, et son test, qui passe.
- **Défenses** : des limites par adresse, utilisateur, tenant et endpoint (GCRA, le Generic Cell Rate Algorithm) ; un
  délai qui double après des connexions échouées ; la preuve de travail (proof of work : un petit calcul que le
  navigateur doit faire avant d'envoyer, qui coûte cher à un robot) sous attaque ; un champ piège pour les bots (des
  programmes qui se font passer pour des visiteurs) ; un plafond de nouveaux tenants par heure ; le refus des requêtes
  venues d'autres sites (CSRF), CORS (la règle qui dit quels autres sites peuvent appeler l'API) pour des partenaires
  nommés ; des headers de sécurité (des lignes d'en-tête de la réponse HTTP) sur chaque réponse ; un GET qui ne fait
  que lire ; chaque écriture avec qui et pourquoi dans l'historique de Cepheus, chaque connexion, échec et refus un
  événement.
- **Administration** : les endpoints du super-admin (l'administrateur de toute la plateforme, au-dessus des tenants) :
  utilisateurs, tenants, rôles, sessions, événements, logs, métriques, réglages, kinds (les sortes de choses de la base
  de données) et leurs choses, jobs (les travaux faits en arrière-plan), clés de programme, feature flags, seconds
  facteurs d'un utilisateur, invitations par mail. Et ses pages dans le navigateur (`admin`), écrites en Cesia avec
  Ceres et compilées en WebAssembly (le code compilé que le navigateur exécute) : un tableau de bord en direct
  (requêtes, échecs, durées p50 et p99, refus et connexions échouées, jobs), les utilisateurs et les tenants avec leurs
  rôles changés sur place, les événements et le log par filtre ou en direct, les jobs et les webhooks (les appels que
  l'app envoie à un partenaire) relancés, les fichiers, les réglages, les données de chaque kind changées à travers ses
  vérifications, la piste d'audit, les clés et les flags, les facteurs d'un utilisateur retirés et une session
  terminée, la seconde étape à la connexion ; une app ajoute ses propres pages, colonnes et actions avec `pages.Page`,
  `Kind`, `Column` et `Action`. Aucune nouvelle voie d'entrée : les pages appellent les endpoints du rôle super par la
  même porte (ce que Centauri vérifie à l'entrée de chaque requête) que tout client. Elles parlent anglais ou français,
  la langue que le serveur parle au super-admin, avec les nombres et les heures écrits comme en français ; les pages
  propres à une app disent leurs textes avec `pages.Say`, et `apptest.Untranslated` trouve un texte sans son français.
- **Réglages** : des variables `APP_*` lues une fois à travers une forme ; trois profils, dev, test et prod ; la santé
  (health) et les métriques.
- **Tests** : `apptest.Start` fait tourner une app en mémoire sur un fork (une copie qui part de l'état présent) de la
  base de données ; `apptest.Isolated` prouve sur chaque endpoint qu'aucun tenant ne lit les données d'un autre,
  `apptest.Fuzz` qu'aucune entrée cassée ne fait un 500, `apptest.Surface` qu'aucun changement ne casse un client ;
  `apptest.Provider` joue un fournisseur OpenID sur https, `apptest.Device` un appareil de passkeys, `t.SetUp` un
  utilisateur qui installe son second facteur.
- **Jobs en arrière-plan** (`jobs`) : écrits dans le groupe de l'écriture qui les demande, pris une seule fois,
  réessayés après un backoff (une pause plus longue à chaque échec), morts puis relancés à la main ; des schedules de
  cron (des horaires qui se répètent) sur l'horloge d'un vrai fuseau horaire, une exécution par créneau sur l'ensemble
  des serveurs.
- **Mail** (`mail`) : SMTP sur TLS ou STARTTLS seulement, Postmark, des fichiers et le log en dev, une boîte dans les
  tests ; des adresses vérifiées par le lien d'un mail, les mots de passe oubliés, une inscription qui répond la même
  chose pour toute adresse.
- **Fichiers** : les uploads (les fichiers envoyés au serveur) lus à mesure qu'ils arrivent, leur type par leurs
  premiers octets, gardés par parties dans le vault de Cepheus (son coffre de fichiers), lus par plages.
- **Écrans en direct** : `std/live` sur `/live` avec la session et les droits ; chaque show (une liste en direct
  qu'une page demande par son nom) est un `cepheus.Watch`, une question à la base qui se relance à chaque changement
  (pas de broker) ; les endpoints comme actions.
- **Webhooks** (`hooks`) selon Standard Webhooks, envoyés et reçus ; `app.Call`, qui n'atteint jamais le réseau de
  l'app elle-même (SSRF) ; `Idempotency-Key` ; des migrations lancées une seule fois.

## État

Version 0.4 : les trois premiers lots (L1, L2, L3) et les pages d'administration, en anglais et en français, avec ce
livre dans les deux langues. Elle demande la branche main de Cesia (`std/crypto` signe et vérifie RS256, PS256 et ES256
et calcule HMAC-SHA1 par la libcrypto d'OpenSSL, et `std/cbor`), pas encore dans une release, et celle de Ceres ;
`tools/deps.sh` met Cepheus et Ceres dans `deps/`. Une app dont les utilisateurs se connectent avec un fournisseur, une
passkey ou TOTP en SHA-1 (le défaut) autorise `ffi=crypto` à ses tâches.

Licence MIT.
