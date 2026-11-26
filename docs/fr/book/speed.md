# Vitesse

Ce que coûte Centauri, mesuré sur une machine (Intel Core i7-4720HQ, 4 cœurs et 8 threads, Linux 7.2) le 2026-11-25.
À côté : les mêmes réponses servies par std/http seul, et, sous charge, Go et Spring Boot. Chaque chiffre est la
médiane de 21 exécutions, en alternance avec les autres, avec la plus petite et la plus grande entre crochets. D'autres
travaux tournaient sur la machine, et la charge moyenne est donnée (le load average : le nombre moyen de processus qui
veulent le processeur). « Avant », c'est Centauri tel que l'a écrit son premier lot ; « maintenant », après le travail
sur le coût d'une requête ; les deux sur le binaire de la branche main de Cesia. « Maintenant » avec une page prend
aussi l'`encode.Base64` plus rapide de la branche `centauri-cost` de Cesia. Les mesures sont dans `bench/`.

## Le démarrage

De la commande au premier 200, puis la mémoire résidente (celle que le processus occupe vraiment en RAM) 1 s plus tard,
au repos (21 exécutions chacun, charge de 1,4 à 4,8) :

| serveur | première réponse | mémoire au repos |
|---|---:|---:|
| std/http, le moteur de Cepheus chargé, libsodium ouvert | 26,6 ms [25,6 ; 51,9] | 21 MB [19 ; 21] |
| Centauri avant (ses comptes et une route, c'est-à-dire une adresse de l'API et la fonction qui y répond ; les réglages lus, l'état, les clés, les routes) | 33,2 ms [31,7 ; 41,6] | 30 MB [28 ; 30] |
| Centauri maintenant | 33,9 ms [32,4 ; 72,5] | 32 MB [30 ; 32] |

Centauri ajoute 7,3 ms à un démarrage, dans son budget de 10 ms ; avant et maintenant diffèrent de moins que leur
dispersion. La mémoire au repos a 2 MB de plus après la première requête, parce que le tas (la mémoire où le programme
range ses valeurs) passe à sa taille suivante une requête plus tôt : après 1 000 requêtes, les deux tiennent 35 MB.

## Une requête, dans le programme

Une app est l'application, le serveur et ses pages ; son handler est la fonction qui répond à une requête ; un profil
est une manière de lancer l'app (dev, test ou prod). Voici la moyenne de 2 000 appels du handler de l'app, sans le
réseau, dans le profil prod (21 tours, charge de 3,1 à 3,9) :

| réponse | std/http | Centauri avant | Centauri maintenant |
|---|---:|---:|---:|
| un JSON d'un champ, public | 3,5 µs [3,3 ; 6,4] | 41,6 µs [39,9 ; 48,6] | 21,5 µs [20,2 ; 49,8] |
| une chose (*thing* dans le code) par son id, connecté (`app.Own`) | 6,0 [5,3 ; 11,1] | 77,0 [75,4 ; 97,9] | 40,2 [38,1 ; 82,4] |
| une page de 20 choses, connecté | 56,8 [53,4 ; 66,4] | 255 [246 ; 414] | 150 [143 ; 170] |

std/http demande sa page parmi toutes les notes. Demandée comme la demande le handler de Centauri, parmi les notes d'un
seul tenant (un client de la plateforme, comme un cabinet ou une entreprise, avec ses données à lui), elle prend
58,0 µs [55,0 ; 91,6]. Ce que Centauri ajoute à une requête est passé de 38 à 18 µs (public), de 71 à 34 µs
(connecté), de 198 à 92 µs (une page). Chaque requête alloue moitié moins : 1 557 mots de mémoire (un mot : la case
de mémoire de base de la machine) là où elle en prenait 3 172 (public ; std/http seul, 571), 1 975 là où elle en
prenait 5 213 (connecté), 16 618 là où elle en prenait 25 502 (une page). Ce qui a changé :

- **Un seul aller-retour vers l'état du processus.** L'état est une fiber (un fil d'exécution léger, à l'intérieur du
  processus), puisque aucune fonction de Cesia ne change une variable de son module. Une requête l'interroge une fois,
  pour sa session (le temps où un utilisateur reste connecté) et toutes ses limites : celles de l'adresse, de
  l'utilisateur, du tenant et de l'endpoint (une adresse de l'API avec sa méthode HTTP, comme `POST /clients`). Avant,
  elle demandait ses limites et lisait sa session à part. L'état garde les sessions qu'il a lues pendant
  `APP_SESSION_CACHE` secondes, 2 par défaut ([S'inscrire et se connecter](sign-up.md#3-les-sessions) dit ce que cela
  change, avec ses tests) : une requête connectée ne lit rien dans la base de données. Avant, lire la session prenait
  environ 27 µs d'une requête.
- **Ce dont chaque endpoint a besoin, fait une fois au démarrage** : la fonction de la forme de sa sortie (une forme dit
  ce qu'une valeur doit être : un texte de 1 à 120 octets, un nombre entier...), la taille de ses pages, son statut,
  les labels de sa métrique, les headers de sécurité d'une réponse JSON (un header : une ligne d'information en tête
  d'une requête ou d'une réponse). Une ligne conforme à sa forme sort telle quelle.
- **Aucun champ ajouté à une copie.** Ajouter trois champs à la requête, à la porte (ce que Centauri vérifie à l'entrée
  de chaque requête), prenait 171 mots ; un record (des champs nommés, gardés ensemble) fait d'un coup en prend 20. La
  porte fait donc la requête routée entière, avec les deux champs que lui donnent les routes de std/http.
- **Un curseur ne scelle que sa ligne** (un curseur : la marque d'où reprend la page suivante d'une liste ; sceller :
  chiffrer et authentifier), sous une clé de l'app propre à son endpoint et à son tenant : il est plus court d'un
  tiers. L'`encode.Base64` de Cesia écrit ses chiffres comme des nombres, et son texte en un seul appel : 24 µs pour
  125 octets au lieu de 56.

## Où va le temps maintenant

Chaque morceau retiré de la requête à tour de rôle, la requête entière mesurée (publique, 21,0 µs dans cette série), et
les mots de mémoire qu'il allouait :

| morceau | µs | mots |
|---|---:|---:|
| l'aller-retour vers l'état (session et limites) | 6,3 | 462 |
| la ligne du log (le journal où le serveur note ce qu'il fait) que garde l'administration | 3,1 | 210 |
| la métrique `centauri_requests_total{route,status}` | 2,1 | 111 |
| le site d'où vient la requête (Origin, Sec-Fetch-Site) | 1,7 | 11 |
| la sortie à travers sa forme | 1,6 | 26 |
| le reste : le numéro de la requête, son adresse, son record pour le handler, son rôle, les routes | environ 3 | |

Un morceau coûte à une requête deux ou trois fois ce qu'il coûte seul dans une boucle : dans une requête, le code et les
données de l'interpréteur quittent les caches du processeur (ses petites mémoires rapides) entre deux morceaux. Un
aller-retour vers l'état coûte deux changements de fiber, environ 230 mots, même quand l'état n'a rien à faire. Une
page ajoute son curseur scellé, environ 47 µs : le Base64 en Cesia, 24 µs, et le scellement de libsodium à travers la
couche de C de Cesia, 10 µs.

## Sous charge

/hello, un JSON d'un champ, public (le /json de Spring Boot, le même) ; 256 connexions gardées ouvertes, 4 threads ; les
serveurs sur 4 threads (deux cœurs), la charge (le programme qui envoie les requêtes) sur les 4 autres ; 2 s par mesure
après 1 s de chauffe, les cinq serveurs à tour de rôle (21 tours, charge de 3,1 à 8,1) ; le processeur que prend
chacun, mesuré à part sur 5 s. Le p99 est le temps sous lequel répondent 99 % des requêtes :

| serveur | requêtes/s | p99 | mémoire | processeur |
|---|---:|---:|---:|---:|
| std/http | 27 928 [19 811 ; 30 559] | 16,0 ms | 40 MB | 0,9 cœur |
| Centauri avant | 10 631 [8 690 ; 11 429] | 36,0 ms | 45 MB | |
| Centauri maintenant | 13 444 [11 115 ; 14 302] | 27,1 ms | 46 MB | 0,95 cœur |
| Go 1.26 net/http | 84 159 [61 723 ; 95 465] | 13,0 ms | 18 MB | 2,9 cœurs |
| Spring Boot 4.0.5 (Tomcat, virtual threads, Java 21) | 60 252 [14 612 ; 65 816] | 7,3 ms | 509 MB | 3,2 cœurs |

Aucune requête n'a échoué. Un serveur Cesia tourne sur un domain (un fil d'exécution qui tourne sur un cœur du
processeur), donc sur un cœur ; Go et Spring Boot en prennent trois. Par cœur, std/http sert autant que Go
(32 000 requêtes par seconde), Spring Boot 17 000 et Centauri 15 000. Sous charge, Centauri ajoute 35 µs de processeur à
une requête, là où il en ajoute 18 dans le programme. Avec 256 requêtes en vol, chacune garde ses données pendant
qu'elle attend l'état ; et le collector (le ramasse-miettes, qui libère la mémoire que plus rien n'utilise), environ un
huitième du temps du serveur dans un profilage par échantillons (où l'on note à intervalles réguliers ce que fait le
programme), en déplace et en marque davantage.

## Le premier mois : ce qu'ajoute L2, et ce que coûtent ses morceaux

L2 ne doit pas rendre plus lente une requête de L1. Mesuré comme L1 l'a été : `bench/micro.ce` dans le programme,
21 exécutions en alternance entre la branche main de Centauri (0.1, f4b845d, sur la main de Cesia) et L2 (sur Cesia
avec les corps par morceaux), sur les cœurs 0, 1, 4, 5 (2026-11-26, charge de 2,8 à 4,0) ; des médianes en µs, avec
leur [min ; max] :

| requête | main | L2 |
|---|---:|---:|
| std/http seul, un JSON d'un champ | 3,47 [3,33 ; 6,33] | 3,64 [3,44 ; 6,34] |
| Centauri, public, un JSON d'un champ | 21,25 [20,55 ; 38,16] | 21,65 [21,15 ; 41,57] |
| Centauri, connecté, une chose par son id (`app.Own`) | 39,02 [37,00 ; 55,03] | 39,65 [38,74 ; 56,19] |
| Centauri, connecté, une page de 20 choses | 143,37 [140,21 ; 221,00] | 145,36 [140,95 ; 183,80] |

Les intervalles se recouvrent partout. Les médianes diffèrent de 1,4 à 1,9 % pour Centauri, et de 5 % pour std/http
seul, que L2 ne change pas : la différence est celle des deux builds de Cesia (les binaires compilés), pas celle de la
porte de L2. Ce que L2 ajoute à une requête de L1 : pour une requête qui change quelque chose, une recherche du header
`Idempotency-Key` (une clé qui fait qu'une requête envoyée deux fois ne s'exécute qu'une fois) ; pour chaque requête,
deux tests d'un indicateur (un upload, c'est-à-dire un envoi de fichier ; un stream, une réponse envoyée par morceaux).

Ce que coûtent les nouveaux morceaux, dans le programme, 21 exécutions, la moyenne de 500 appels par exécution
(`bench/month.ce`, 2026-11-26, charge de 2,5 à 2,8) ; des médianes [min ; max] :

| morceau | coût |
|---|---:|
| un job (un travail fait en arrière-plan, hors de la requête) écrit dans un groupe (des écritures faites toutes ensemble, ou pas du tout), pris, lancé (il ne fait rien), fini, sur un fork (une base dans la mémoire du programme) | 93,1 µs [91,3 ; 169,7] |
| un mail fabriqué (1 KB de texte : ses headers vérifiés, son texte en base64) | 343 µs [335 ; 397] |
| un webhook (un appel HTTP que l'app envoie à un partenaire quand quelque chose arrive) signé (HMAC-SHA256 de 80 octets) | 15,7 µs [15,4 ; 23,3] |
| une adresse vérifiée contre les blocs spéciaux (SSRF : faire appeler par le serveur une adresse qu'il ne devrait pas appeler) | 21,9 µs [21,4 ; 24,3] |
| le prochain créneau d'un schedule de cron (un horaire qui se répète, écrit comme pour cron, le planificateur d'Unix) à Paris | 10,4 µs [9,7 ; 11,5] |
| un `POST`, sans clé / avec une nouvelle `Idempotency-Key` / avec une clé déjà vue | 94,8 [92,7 ; 128,9] / 198 [194 ; 306] / 52,6 [51,3 ; 84,1] µs |
| une écriture vue par une page en direct à travers un WebSocket (une connexion qui reste ouverte entre la page et le serveur), médiane de 20 écritures | 0,12 ms [0,11 ; 0,12] |
| un fichier de 10 MiB rangé par parties, sur un fork | 270 MB/s [238 ; 278] |

Sur un vrai serveur Cepheus, sur le SSD de cette machine, 21 exécutions (charge de 1,3 à 2,9) : 10 MiB d'octets
aléatoires envoyés et rangés en 274 ms [210 ; 2 986] (38 MB/s), relus en 51 ms [46 ; 56] (207 MB/s), une plage de
64 KiB en leur milieu en 0,9 ms [0,9 ; 1,1]. Un job sur un serveur coûte, en plus de son CPU ci-dessus, ses trois
groupes (écrit avec l'écriture qui le crée, pris, fini), chacun forcé sur le disque. C'est de l'ordre des 7 021 groupes
par seconde [1 799 ; 8 604] que 64 fibers écrivent par une seule connexion (mesuré par Cepheus) : donc quelques
milliers de jobs par seconde et par base, là où une app de gestion en demande des dizaines.

Où c'est lent, et pourquoi : un mail est fabriqué en 343 µs, surtout le base64 écrit en Cesia (une boucle de
l'interpréteur : 2,4 fois plus rapide depuis le dernier changement de Cesia, encore 0,2 µs par octet) ; le CPU d'un
job, ce sont ses deux écritures et ses arguments relus à travers leur forme. Ni l'un ni l'autre n'est sur le chemin
d'une requête. Ce qui n'a pas été mesuré face aux géants : le `@Scheduled` de Spring Boot avec ShedLock, son
JavaMailSender, ses uploads multipart vers S3, son STOMP avec un broker ; les chiffres ci-dessus sont ceux de Centauri
seul.

## Le premier trimestre : ce qu'ajoute L3, et ce que coûtent ses morceaux

L3 ne doit pas rendre plus lente une requête de L1. Mesuré comme avant : `bench/micro.ce` dans le programme,
21 exécutions en alternance entre la main de Centauri (0.3, fd982a9) et L3, les deux sur le même build de Cesia (sa
branche de L3, pour que seul Centauri diffère), sur les cœurs 0, 1, 4, 5 (2026-11-26, charge de 2,4 à 2,7) ; des
médianes en µs, avec leur [min ; max] :

| requête | main | L3 |
|---|---:|---:|
| Centauri, public, un JSON d'un champ | 22,85 [21,06 ; 26,76] | 23,41 [22,69 ; 30,24] |
| Centauri, connecté, une chose par son id (`app.Own`) | 41,23 [39,47 ; 60,99] | 42,35 [41,12 ; 45,35] |
| Centauri, connecté, une page de 20 choses | 145,91 [142,00 ; 158,99] | 148,74 [144,85 ; 174,57] |

Les intervalles se recouvrent ; les médianes sont de 0,6 à 2,8 µs (1,9 à 2,7 %) au-dessus de celles de main. Ce que L3
ajoute à chaque requête : la porte lit `Origin`, `Sec-Fetch-Site` et `Authorization` en un seul passage sur les
headers (L1 lisait les deux premiers en deux passages) ; une requête sans cookie de session (un cookie : un petit texte
que le navigateur garde et renvoie à chaque requête) cherche une clé de programme (une *API key* : un secret qu'un
programme envoie à la place d'une personne connectée) ; le `why` de l'historique nomme la clé de programme quand il y
en a une. Une première version de L3 coûtait 3,7 µs de plus. Son record `env`, que chaque requête lit de nombreuses
fois, avait dépassé 32 champs, le seuil où un dictionnaire de Cesia quitte son unique bloc de clés pour une table. Les
mots des langues sont allés dans un seul de ses champs (`env.Words`), et une app qui ne parle qu'anglais n'en teste rien
à une requête (sa porte est choisie au démarrage de l'app).

Ce que coûtent les nouveaux morceaux, dans le programme, 21 exécutions, la moyenne de 2 000 appels par exécution (20
pour les connexions), sur un fork de Cepheus (`bench/l3.ce`, 2026-11-26, charge de 1,6 à 2,3) ; des médianes
[min ; max] :

| morceau | coût |
|---|---:|
| une chose par son id, avec un cookie / avec une clé de programme (`Authorization: Bearer`) | 47,8 [46,3 ; 70,4] / 48,2 [46,6 ; 53,4] µs |
| une erreur d'un champ (422), en anglais / en français (ses Problem Details, le format standard des erreurs d'une API HTTP, relus et traduits) | 96,9 [93,9 ; 98,5] / 121,0 [117,3 ; 162,9] µs |
| `i18n.Say` d'un message de std/check, lu face aux modèles français de Centauri | 7,6 [7,0 ; 14,3] µs |
| `flags.On`, la table des flags (des feature flags : des interrupteurs qui ouvrent une fonction à tous, à une part des utilisateurs, à un tenant ou à un utilisateur) dans la mémoire du processus | 3,45 [3,24 ; 6,61] µs |
| une connexion par mot de passe (Argon2id, la fonction qui calcule l'empreinte d'un mot de passe ; 64 MiB) | 60,9 [60,2 ; 63,8] ms |
| une connexion par mot de passe, puis le code de l'app de codes (TOTP, le code à six chiffres d'une app d'authentification, qui change toutes les 30 secondes : la seconde étape) | 61,8 [61,1 ; 68,8] ms |
| une connexion par passkey (une clé d'accès gardée par l'appareil, qui remplace le mot de passe) : les options, la réponse de l'appareil (sa signature ES256, faite dans le même programme), la vérification | 1,02 [0,98 ; 1,56] ms |
| une connexion par un fournisseur (provider) d'OpenID Connect sur cette machine, en https : le début, le code à son token endpoint, l'ID token (le jeton que le fournisseur signe pour dire qui s'est connecté) vérifié, une session | 4,57 [4,43 ; 5,30] ms |

Ce que cela dit : une clé de programme coûte à une requête ce que coûte un cookie. Les deux sont une lecture par un id,
un hash (une empreinte : un nombre calculé à partir d'un texte, d'où on ne peut pas revenir au texte) et une
comparaison. Un second facteur ajoute moins d'une milliseconde à une connexion qu'Argon2id fait durer 60 ms. Une
passkey connecte en une milliseconde, soixante fois plus vite qu'un mot de passe, puisque rien n'est haché lentement :
la signature de l'appareil est vérifiée (ES256 par OpenSSL : 145 µs de ce temps). La connexion par un fournisseur,
c'est surtout l'aller-retour vers son token endpoint, ici sur cette machine, avec un handshake TLS (la poignée de main
qui ouvre une connexion chiffrée) à chaque fois ; à travers Internet, s'y ajoutent le temps propre du fournisseur et
les allers-retours vers lui, non mesurés ici. Une erreur traduite coûte 24 µs de plus : les erreurs seulement, et
seulement dans une app de plusieurs langues. Pas mesuré à côté des géants : le `oauth2Login()` de Spring Security, son
`webAuthn()` et ses one-time tokens (des jetons à usage unique). Les signatures face à celles de Node sont dans le livre
de Cesia (Cryptography) : RS256 en 76 µs, là où Node prend 64 µs avec une clé lue à chaque fois, et 37 avec une clé
analysée une seule fois.

## Les pages d'administration dans un navigateur

Les pages de [l'administration](admin.md), compilées de Cesia en WebAssembly (le code compilé que le navigateur
exécute), sont mesurées dans chrome-headless-shell 153 (WebGL par SwiftShader, sur le processeur) et Firefox 160, sans
fenêtre, en 1 280 sur 900, sur cette machine (un portable de 8 threads, d'autres travaux en cours : charge de 3 à 9).
L'app est celle des factures de `cesia do admin-serve`, avec 100 005 clients (`ROWS=100000`), sur une base de données
en mémoire, servie sur 127.0.0.1 avec les fichiers compressés en brotli. Le travail d'une frame (une image de l'écran),
c'est le temps entre l'appel de la page par le navigateur et sa frame peinte (`Stats()` de `ceres.js`). Ce n'est pas
l'attente d'avant, qui dans Chrome headless (sans fenêtre) est celle de SwiftShader.

| | Chrome | Firefox |
|---|---|---|
| les fichiers des pages | `page.wasm` 521 406 B, 134 330 en brotli ; `page.js` 4 123, `ceres.js` 6 089, `admin.js` 162 en brotli : 145 KB en tout, une fois ; puis un `304` chacun | de même |
| premier affichage de la connexion (21 exécutions) | 131 ms [111 ; 169] | 118 ms [89 ; 1 025 à froid] |
| de la connexion au tableau de bord qui montre ses comptes : Argon2id, la page chargée de nouveau, son écran ouvert (21) | 361 ms [278 ; 439] | 360 ms [328 ; 426] |
| premier affichage du tableau de bord, une fois connecté (21) | 104 ms [91 ; 153] | 98 ms [91 ; 115] |
| travail d'une frame pendant que la molette fait défiler une table de 100 005 lignes, p50 (la médiane) / p99 (3 et 2 exécutions de 120 crans) | 3,7 à 4,8 / 10,7 à 13 ms | 3 / 7 à 15 ms |
| les 100 005 lignes triées par un clic sur un titre | une frame, 11,3 ms | une frame, 10 à 14 ms |
| les 100 005 lignes lues (« Tout » : 2 001 pages de 50 par l'écran en direct) | 112 à 121 s | 104 à 121 s |

La table ne dessine que les lignes visibles : 100 005 lignes défilent donc comme 50. Les lire toutes est lent à cause du
serveur : `GET /admin/data/:kind` prend 35 à 46 ms par page sur un kind (une sorte de chose dans la base de données,
comme les factures ou les clients) de 100 000 choses, là où il prend 1,2 ms sur un kind de 30. Cepheus parcourt les
faits du kind pour trouver la page après un curseur ; une plage sur l'id d'une chose, qui irait droit au bon endroit,
est refusée : `Above` est pour les nombres, les dates et l'argent. La page attend la frame suivante entre deux pages,
environ 16 ms.

À côté, l'admin de Django 6.1.3 sur les mêmes 100 005 clients (SQLite, `runserver`, 21 exécutions ; les mesures de
Firefox faites pendant qu'un autre travail lançait un benchmark) :

| | Django, Chrome | Django, Firefox | les pages d'administration |
|---|---|---|---|
| la page de connexion | 56 121 B en 8 fichiers (11 297 en brotli), chargée en 114 ms [103 ; 458] | 49 ms [42 ; 92] | 145 KB une fois, premier affichage en 131 / 118 ms |
| de la connexion à la première page (PBKDF2 de 1 500 000 tours) | 1 043 ms [946 ; 2 215] | 1 013 ms [944 ; 1 285] | 361 / 360 ms |
| la liste des clients, 100 par page | 771 289 B en 21 fichiers (151 170 en brotli : jQuery, XRegExp), chargée en 195 ms [187 ; 1 567] | 187 ms [155 ; 240] | une page de 50 par l'écran en 35 à 46 ms ; aucun fichier rechargé |
| tous les clients | refusé au-delà de 200 (`list_max_show_all`) | | 100 005 dans une seule table, 4 ms par frame |

Django gagne là où une page est du simple HTML : sa page de connexion fait 11 KB et s'affiche sans compiler de module,
et elle marche sans JavaScript. Les pages d'administration gagnent une fois chargées : 145 KB pour toutes les pages
(une page de la liste de Django coûte plus, rien qu'en HTML et en fichiers statiques, que toutes les pages réunies),
chaque page après la première sans aucun fichier, un tableau de bord poussé chaque seconde sans polling (sans
redemander sans cesse au serveur), une table de 100 000 lignes qui défile et se trie en une frame.

## Les pages d'administration en français

Le français ne doit rien coûter à une requête de l'app, et peu à une page. Mesuré comme avant : `bench/micro.ce` dans le
programme, 21 exécutions en alternance entre le main de Centauri (92151da) et cette version, toutes deux sur le même
build de Cesia (main), sur les cœurs 0, 1, 4 et 5 (2026-11-26, charge de 3,2 à 15,7 : d'autres travaux tournaient ; une
première série, à une charge de 4 à 40, a été jetée). Médianes en µs, avec leur [min ; max] :

| requête | main | maintenant |
|---|---:|---:|
| Centauri, public, un JSON d'un champ | 25,75 [22,18 ; 146,99] | 26,17 [23,38 ; 147,41] |
| Centauri, connecté, une chose par son id (`app.Own`) | 45,02 [41,44 ; 232,83] | 43,68 [40,38 ; 240,30] |
| Centauri, connecté, une page de 20 choses | 163,89 [143,24 ; 929,87] | 171,25 [144,05 ; 541,78] |
| std/http seul, un JSON d'un champ (le même code des deux côtés) | 3,73 [3,25 ; 20,71] | 4,26 [3,35 ; 23,44] |

La porte (ce que Centauri vérifie à l'entrée de chaque requête) d'une app qui ne parle qu'anglais est le même code
qu'avant : les écarts sont ceux de std/http seul, dont le code est le même, c'est-à-dire le bruit. Dans une app en
anglais et en français, les mêmes 21 exécutions (`bench/l3.ce`, la moyenne de 2 000 appels par exécution) :

| morceau | main | maintenant |
|---|---:|---:|
| une erreur d'un champ (422), en anglais | 107,11 [95,71 ; 254,02] | 104,92 [93,05 ; 257,16] |
| une erreur d'un champ, en français (ses Problem Details relus et traduits) | 136,89 [116,67 ; 277,67] | 134,78 [118,04 ; 312,07] |
| `i18n.Say` d'un message de std/check | 7,70 [7,08 ; 18,87] | 7,96 [7,04 ; 19,31] |

Un texte dit par les pages (`bench/words.ce`, la moyenne de 20 000 appels par exécution, 21 exécutions) : en français
0,77 µs [0,69 ; 2,56] ; un texte qui compte, `{N} rows`, 7,95 µs [7,21 ; 20,96] en français et 7,97 [6,97 ; 20,72] en
anglais ; un message du serveur ou de l'écran relu d'après les modèles français, 29,3 µs [24,5 ; 67,4], sur une erreur
seulement. Un texte anglais sans valeurs est montré tel quel, sans lire le catalogue. Une page dit de 60 à 250 textes
quand elle se construit : moins de 0,3 ms en français.

Dans chrome-headless-shell 1243 (SwiftShader, 1280 sur 900), les factures remplies d'un mois, un profil neuf à chaque
exécution, 21 exécutions en alternance (charge de 2,5 à 6,1), médianes en ms [min ; max]. Le travail d'un changement de
page est la somme du travail propre de ses frames (les images que la page dessine), que compte `Stats()` de `ceres.js` :

| | maintenant, un navigateur en anglais | maintenant, en français | main, en anglais |
|---|---:|---:|---:|
| premier affichage de la connexion | 127,6 [121,4 ; 243,1] | 130,5 [121,5 ; 271,8] | 121,3 [112,0 ; 212,4] |
| de la connexion au tableau de bord avec ses compteurs | 320 [235 ; 788] | 321 [264 ; 600] | 284 [236 ; 760] |
| premier affichage du tableau de bord, une fois connecté | 94,8 [85,9 ; 349,1] | 94,4 [87,5 ; 214,1] | 89,3 [81,0 ; 243,7] |
| vers Utilisateurs : le travail de ses frames | 8,2 [4,5 ; 17,9] | 8,0 [4,6 ; 17,4] | 10,4 [5,4 ; 20,1] |
| vers Flags : le travail de ses frames | 4,8 [3,0 ; 11,7] | 6,0 [3,0 ; 14,0] | 9,6 [3,1 ; 15,4] |

Le français ne coûte rien de mesurable à une page à côté de l'anglais : les médianes sont à moins d'une milliseconde
l'une de l'autre, et les plages les mêmes. À côté de main, un premier affichage prend 6 à 7 ms de plus, pour un module
qui a grandi du français : `page.wasm` fait 579 669 octets sur main, 653 014 maintenant (146 957 et 163 489 en
brotli, 16,5 Ko de plus, une fois, puis depuis le cache) ; les changements de page coûtent ce qu'ils coûtaient. De la
connexion aux compteurs, la médiane est 36 ms plus haute, mais dans ses plages : Argon2id et le rechargement de la page
sont dedans.

## Ce que cela dit

- Le démarrage reste instantané : 7 ms de plus que std/http et Cepheus, contre 3,4 s pour Spring Boot 4 sur cette
  machine (la mesure faite pour le design de Centauri).
- Une requête coûte à Centauri 18 µs (publique) à 34 µs (connectée) de plus que std/http, la moitié de ce qu'elle
  coûtait ; le budget propre de Centauri est de 5 µs : il n'est pas tenu. Ce qui perd, et pourquoi : l'état est une
  fiber, et un aller-retour vers elle fait deux changements de fiber, l'essentiel de ses 6 µs ; chaque morceau de la
  porte de Centauri est interprété, car Cesia ne fait du code machine que pour les fonctions dont le résultat est un
  nombre ; une métrique à labels refait sa clé à chaque appel.
- Sous charge, Centauri sert la moitié de ce que sert std/http, un sixième de Go et un cinquième de Spring Boot ; par
  cœur, il est proche de Spring Boot, qui prend onze fois sa mémoire. Go et std/http gagnent parce que rien ne se
  trouve entre la route et sa réponse. Spring Boot gagne par son JIT (le compilateur qui traduit le code en code
  machine pendant qu'il tourne), qui compile chaque couche, et parce qu'il utilise trois cœurs là où Cesia en utilise
  un (`cesia run --workers 4` sert un port avec quatre processus, non mesuré ici).
- L3 (clés de programme, seconds facteurs, passkeys, fournisseurs, langues, flags) coûte à une requête de L1 de 1,9 à
  2,7 % (0,6 à 2,8 µs), dans le bruit des intervalles ; une clé de programme coûte ce que coûte un cookie, une passkey
  connecte soixante fois plus vite qu'un mot de passe.
- Les pages d'administration en français ne coûtent rien à une requête (la porte d'une app en anglais est le code
  qu'elle était) et moins de 0,3 ms de textes dits à une page ; leur module a grandi de 16,5 Ko en brotli.
- Ce qui irait plus loin demande Cesia : une table du processus partagée sans fiber, pour les limites et les sessions
  (l'aller-retour, 6 µs des 18), et `encode.Base64` en native (une fonction intégrée à l'interpréteur, pas écrite en
  Cesia ; les 24 µs d'un curseur). Les deux vont dans son cœur, qui est à son plafond de lignes.
