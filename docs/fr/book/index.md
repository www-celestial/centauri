# Centauri

Centauri est le framework backend de Cesia, sur la base de données Cepheus : le code sur lequel on bâtit le serveur
d'une app (l'application, le serveur et ses pages). Une app est une liste de modules, chacun un record (une valeur faite
de champs nommés) de ses kinds (un kind : une sorte de chose dans la base de données, comme les factures ou les
clients), de ses règles et de ses routes. Une route est un endpoint (une adresse de l'API avec sa méthode HTTP, comme
`POST /clients`) d'un contrat (ce qu'un endpoint prend, ce qu'il rend et le rôle qu'il demande, lu par le serveur et par
les pages), et la fonction qui y répond. Tout ce qu'une app peut vouloir choisir est un réglage, avec un défaut : un
tenant (un client de la plateforme, comme un cabinet ou une entreprise, avec ses données à lui) ou plusieurs,
l'inscription ouverte, sur invitation ou fermée, les limites, les rôles, les blocages, la preuve de travail (proof of
work : un petit calcul que le navigateur doit faire avant d'envoyer, qui coûte cher à un robot), les fournisseurs
(providers, comme Google) avec lesquels se connecter, le second facteur, les langues. Les chapitres sont des tutoriels :
chacun fait une vraie tâche d'une vraie app, les factures d'un cabinet, pas à pas, avec à côté la façon de Spring Boot,
et finit sur des tests qui passent. L'app entière est dans
[`examples/invoices`](https://github.com/www-celestial/centauri/tree/main/examples/invoices), avec ses tests.

1. [Votre première API](first-api.md) : une ressource vérifiée par ses formes (une forme dit ce qu'une valeur doit
   être : un texte de 1 à 120 octets, un nombre entier...), listée par pages et par filtres, avec ses droits par rôle et
   par tenant. Les contrats, les routes, les formes, la sortie filtrée, les erreurs en Problem Details (le format
   standard des erreurs d'une API HTTP, RFC 9457), les pages par un curseur, `app.Own`, OpenAPI ; et un module fait par
   le générateur, `cesia do new-module`.
2. [S'inscrire et se connecter](sign-up.md) : les comptes, les mots de passe, les sessions (une session : le temps où
   un utilisateur reste connecté), la déconnexion partout, les tenants, les invitations, les rôles, et les défenses :
   les limites, les blocages, la preuve de travail, le piège à bots (un bot : un programme qui se fait passer pour un
   visiteur), les autres sites refusés, les headers (les lignes d'en-tête des réponses HTTP).
3. [Payer une facture une seule fois](pay-once.md) : un groupe d'écritures, tout ou rien, `Expect` pour un paiement
   fait une seule fois, des numéros sans trou (`app.Next`), `app.Retry`, et qui l'a payée : l'historique de Cepheus et
   les événements de Centauri.
4. [Réglages, profils et déploiement](settings.md) : les `APP_*` lus une fois à travers une forme, les profils dev,
   test et prod, la santé (health), les métriques, un arrêt qui ne perd aucune requête, TLS, une image (de conteneur).
5. [Des tests sans serveur ni Docker](testing.md) : `apptest`, une app en mémoire, des clients qui s'inscrivent et
   appellent ; les trois tests que Centauri fait de toute app, `Isolated`, `Fuzz`, `Surface`.
6. [S'inscrire avec une vérification de l'e-mail, et un mot de passe oublié](check-email.md) : des adresses vérifiées
   par le lien d'un mail, avant une session ou après, un nouveau mot de passe par le lien d'un mail, la même réponse
   qu'une adresse ait un compte ou non (le mail ; les jobs en arrière-plan, des travaux faits hors de la requête ; des
   codes gardés sous forme de hash, une empreinte d'où on ne peut pas revenir au code).
7. [Le rapport de chaque nuit](nightly-report.md) : un mail à 06:00 à Paris, une exécution par jour quel que soit le
   nombre de serveurs, réessayé quand le serveur de mail est en panne (les jobs dans le groupe de leur écriture ; des
   schedules, des horaires de cron sur de vrais fuseaux horaires ; les nouvelles tentatives, la liste des morts, SMTP
   sur TLS, Postmark).
8. [Le scan d'une facture](scans.md) : un fichier reçu à mesure qu'il arrive, son type vérifié par ses premiers octets,
   gardé par parties dans le vault de Cepheus (son coffre de fichiers), relu par plages (`api.Upload`, `app.Store`,
   `app.Download`, `Range`).
9. [Les factures impayées, en direct](live.md) : chaque page change quand la base de données change, depuis n'importe
   quel serveur, sans broker, l'intermédiaire qui d'habitude passe les messages d'un serveur à l'autre (WebSocket ;
   `cepheus.Watch`, une question à la base qui se relance à chaque changement ; la session et les droits ; les
   endpoints comme actions).
10. [Quand la connexion tombe](connection.md) : une page qui reste utilisable pendant une coupure et reprend
    après sans recharger : la ligne qui le dit, les actions gardées et faites une seule fois (`Idempotency-Key`),
    les vues live qui ne manquent rien, un changement par-dessus un changement montré comme un conflit
    (`app.Unchanged`), des envois et des téléchargements qui reprennent (`client.Upload`, `client.Download`), avec
    Socket.IO, SignalR, MQTT et Spring Boot à côté.
11. [Prévenir un partenaire, et prendre ses réponses](partner.md) : des webhooks (des appels HTTP que l'app envoie à un
    partenaire quand quelque chose arrive) signés selon Standard Webhooks, réessayés, reçus une seule fois ; des appels
    qui n'atteignent jamais le réseau de l'app elle-même (SSRF : une requête qu'un attaquant fait faire au serveur) ;
    `Idempotency-Key` (le header qui fait qu'une requête envoyée deux fois n'est faite qu'une fois).
12. [Changer le schéma sans rien arrêter](schema.md) : des migrations (des programmes qui changent les données ou leur
    forme d'une version à l'autre) lancées une seule fois quel que soit le nombre de processus, un champ rempli,
    étendre puis resserrer (*expand, then contract*), et ce qui attend l'A2 de Cepheus.
13. [Se connecter avec Google](google.md) : Google, Microsoft, Apple, GitHub ou tout fournisseur d'OpenID Connect, par
    le code et PKCE, l'ID token (le jeton que le fournisseur signe pour dire qui s'est connecté) vérifié par les clés du
    fournisseur, un compte lié par une adresse vérifiée ou créé à la première connexion (`SignInWith`, `OidcLink`,
    `OidcSignUp`, `apptest.Provider`).
14. [Passkeys et double authentification](passkeys.md) : des passkeys (des clés d'accès gardées par l'appareil, qui
    remplacent le mot de passe) de WebAuthn créées et utilisées, une inscription sans mot de passe, TOTP (le code à six
    chiffres d'une app d'authentification, qui change toutes les 30 secondes) et les codes de secours, la seconde étape
    d'une connexion sur chaque voie d'entrée, demandée à tous ou à certains rôles, et un appareil perdu
    (`apptest.Device`, `t.SetUp`).
15. [Une API pour un partenaire](partner-api.md) : une clé de programme (un secret qu'un programme envoie à la place de
    la session d'une personne) avec certains des rôles de celui qui l'a créée, montrée une fois, envoyée comme
    `Authorization: Bearer`, limitée à part, révoquée ; le document OpenAPI et un client généré à partir de lui.
16. [Traduire l'app](languages.md) : des catalogues de messages partagés avec les pages, les pluriels de CLDR (les
    règles de pluriel d'Unicode pour chaque langue), la langue du compte puis celle du navigateur, les erreurs et les
    mails traduits, le français fourni, les pages d'administration en français aussi (`i18n`, `Langs`).
17. [Ouvrir une fonction à un seul cabinet](flags.md) : des feature flags (des interrupteurs qui ouvrent une fonction)
    pour tout le monde, une part des utilisateurs, un tenant ou un utilisateur, basculés depuis les pages
    d'administration sans redémarrage (`flags`).
18. [Sécurité](security.md) : chaque menace du Top 10 de l'OWASP (la liste des dix risques les plus courants des
    applications web), et les autres, avec la défense de Centauri et son test.
19. [L'administration](administration.md) : les endpoints des pages du super-admin (l'administrateur de toute la
    plateforme, au-dessus des tenants), et ce qu'ils montrent.
20. [Les pages d'administration](admin.md) : les pages du super-admin dans le navigateur, en WebAssembly (le code
    compilé que le navigateur exécute). Elles montrent un tableau de bord en direct, les utilisateurs, les tenants, les
    événements, le log (le journal du processus), les jobs, les webhooks, les fichiers, les réglages, les données de
    chaque kind changées sur place, la piste d'audit, les clés de programme, les feature flags, les seconds facteurs
    d'un utilisateur. Avec une image à chaque étape, votre propre page d'administration pour les factures, et les pages
    en français, avec l'admin de Django à côté.
21. [Vitesse](speed.md) : ce que Centauri ajoute à un démarrage, à une requête et sous charge, à côté de std/http seul,
    de Go et de Spring Boot, où passe le temps, et ce que coûtent les pièces du premier mois.

La référence des packages (un package : un dossier de fichiers Cesia groupés sous un nom), chaque nom public avec ses
paramètres, est sous [Référence](ref/index.html).
