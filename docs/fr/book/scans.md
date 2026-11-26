# Le scan d'une facture

La tâche : un comptable joint le scan d'une facture (un PDF, un JPEG ou un PNG, 10 MB au plus), gardé avec la base de
données et scellé pour son cabinet (chiffré avec la clé du cabinet). Toute personne du cabinet peut le relire, en
entier, ou seulement les pages qu'une visionneuse demande par plages d'octets. Et personne ne fait passer une page HTML
pour un PDF, n'envoie un fichier d'un gigaoctet, ni ne lit le scan d'un autre cabinet. Le code est dans
`src/app/files.ce` (et dans les corps en morceaux de `std/http`), ses tests dans `tests/files.test.ce`. Le scan de
l'exemple des factures, ce sont `scan` et `scanFile` dans `examples/invoices/src/invoices/month.ce`, vérifiés par
`isScanKeptAndReadByRanges`.

Ce qu'il utilise : `api.Upload`, le contrat d'un endpoint qui reçoit un fichier (un endpoint est une adresse de l'API
avec sa méthode HTTP, comme `POST /clients` ; son contrat dit ce qu'il prend, ce qu'il rend et le rôle qu'il demande,
lu par le serveur et par les pages) ; un corps de requête lu en morceaux à mesure qu'il arrive (jamais en entier), son
type vérifié par ses premiers octets ; `app.Store` dans le vault (le coffre de fichiers de Cepheus), par parties ;
`app.Download` avec `Range`.

## 1. Le contrat

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/api
use deps/www-celestial/centauri/src/app
use deps/www-celestial/cepheus/cesia/cepheus
use std/check
use std/dict
use std/value
use std/json
Invoice = json.Parse("{}")!
Scans = json.Parse("{}")!
```

```cesia norun
Scan = api.Upload("/invoices/:id/scan", ["application/pdf", "image/jpeg", "image/png"], most = 10485760,
  out = check.Record({File: check.Id(), Size: check.Int(0)}), role = "accountant")
ScanFile = api.Get("/invoices/:id/scan", out = api.File(), role = "accountant")
```

Une page envoie le fichier lui-même comme corps de la requête, avec son type et son nom :
`fetch("/invoices/7/scan?name=scan.pdf", {method: "POST", body: file, headers: {"content-type": file.type}})`. Le
handler (la fonction qui répond à une requête) reçoit `file`, `{Name, Type, Size, Read}` :

```cesia norun
defn scan(r, file)
  inv = app.Own(Invoice, r.Params.id, r)?
  f = app.Store(Scans, file, r)?
  cepheus.Write([cepheus.Expect(inv.Id, Invoice.Scan, dict.Get("Scan", inv)), cepheus.Add(inv.Id, Invoice.Scan, f)], r.Db, by = r.User.Id, why = r.Why)?
  {File: f, Size: file.Size}
end

defn scanFile(r)
  inv = app.Own(Invoice, r.Params.id, r)?
  if value.IsMissing(dict.Get("Scan", inv))
    return app.Missing("This invoice has no scan.")
  end
  app.Download(Scans, inv.Scan, r)
end
```

`Scans = app.Files("scan")` est son kind (une sorte de chose dans la base de données, comme les factures ou les
clients) : chaque chose (*thing* dans le code) est un fichier, avec son tenant (un client de la plateforme, comme un
cabinet ou une entreprise, avec ses données à lui), son nom, sa taille, son type, ses parties et son propriétaire.

```java
// Spring Boot: a MultipartFile (multipart/form-data, spring.servlet.multipart.max-file-size), Apache Tika to check
// the type, a store of your choice (S3, a folder, a BLOB column), and ResourceRegion for ranges
@PostMapping("/invoices/{id}/scan") ScanOut scan(@PathVariable long id, @RequestParam MultipartFile file, @AuthenticationPrincipal Principal u) throws IOException {
  var inv = own(id, u);
  var type = tika.detect(file.getInputStream());               // the first bytes
  if (!Set.of("application/pdf", "image/jpeg", "image/png").contains(type)) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
  var key = storage.put(u.officeId(), file.getInputStream(), file.getSize());   // S3 or a folder: a second store to back up
  inv.scan = key; return new ScanOut(key, file.getSize());
}
@GetMapping("/invoices/{id}/scan") ResponseEntity<Resource> file(@PathVariable long id, @AuthenticationPrincipal Principal u) {
  return ResponseEntity.ok().header(CONTENT_DISPOSITION, "attachment").body(storage.get(own(id, u).scan));   // Range by Spring's ResourceHttpRequestHandler
}
```

## 2. Un corps en morceaux

Centauri sert un `api.Upload` par une route (un endpoint et la fonction qui y répond) de `std/http` qui prend son corps
en morceaux (`http.Route(..., stream = most)`). Un corps plus grand qu'une lecture, ou que `APP_MAX_BODY`, arrive au
handler à mesure qu'il le lit, un morceau à la fois (64 KiB au plus) : le serveur ne le tient donc jamais en entier. Un
corps plus grand que `most` reçoit un `413` avant que rien ne tourne. Un client qui a envoyé `Expect: 100-continue`
(curl le fait, pour un gros corps) n'est invité à continuer que quand le handler lit ; une requête refusée d'abord (un
`401`, un type que l'endpoint ne prend pas) n'envoie donc jamais son corps. Chaque morceau a le timeout de la requête
(le temps qu'on lui accorde au plus), et le tout une seconde de plus par 64 KiB : un client qui envoie un octet par
minute est coupé, un client sur une ligne lente ne l'est pas.

## 3. Son type, par ses premiers octets

Le `Content-Type` qu'envoie un client ne prouve rien : Centauri ne le croit que quand les premiers octets du fichier le
disent aussi (`%PDF-` pour un PDF, la signature de PNG, `FF D8 FF` pour JPEG, `GIF8`, `RIFF....WEBP`, `PK` pour le zip
et les fichiers d'Office, de l'UTF-8 sans NUL pour le texte et le CSV). Une page HTML envoyée comme un PDF, un script
envoyé comme un PNG reçoivent un `415` (`isTypeTrustedByItsBytesOnly`). Et un fichier ne s'exécute jamais dans
l'origine de l'app (l'application, le serveur et ses pages ; l'origine est son schéma, son domaine et son port, d'où le
navigateur tire ses droits). Un téléchargement est une pièce jointe (`Content-Disposition: attachment`), dont le
navigateur ne devine jamais le type (`X-Content-Type-Options: nosniff`), sous `Content-Security-Policy: sandbox`, qui
interdit les scripts si on l'ouvre quand même.

## 4. Dans le vault, par parties

`app.Store(Scans, file, r)` range le fichier à mesure qu'il arrive, par parties de `APP_UPLOAD_PART` octets (1 MiB).
Chaque partie est un fichier du vault de Cepheus (`cepheus.Put` : compressé, scellé avec la clé de son propriétaire, le
cabinet, gardé une seule fois). Puis une chose de `Scans` les nomme dans l'ordre. Une partie au plus est en mémoire.
Cepheus n'a pas encore de `Put` d'un fichier en morceaux (c'est proposé) ; en attendant, un fichier est fait de ses
parties, ce qui garde aussi chaque requête vers Cepheus sous sa trame de 16 MiB (la taille maximale d'un message vers
le serveur). Un fichier coupé avant la fin, ou une partie que la base refuse, ne laisse aucun fichier : les parties
déjà écrites sont effacées. Effacer la clé du cabinet (`cepheus.Erase`) rend tous ses scans illisibles, sur chaque
disque et chaque copie. Dans un test, ou en dev sans serveur, la base est un fork (une base dans la mémoire du
programme, avec toutes les vérifications d'une vraie), qui ne garde pas de fichier : les parties sont alors des faits
du fork, et le code est le même.

`app.Download(Scans, id, r)` l'envoie partie par partie, en ne lisant que les parties sous la plage demandée :

| `Range` | réponse |
|---|---|
| aucun | `200`, le fichier entier |
| `bytes=0-99`, `bytes=900-`, `bytes=-100` | `206` et `Content-Range: bytes 900-999/1000` |
| qui commence après la fin | `416` et `Content-Range: bytes */1000` |
| plusieurs plages, une autre unité, une syntaxe qu'il ne lit pas | `200`, le fichier entier (comme la RFC 9110 le permet) |

## 5. Ce contre quoi il protège

| menace | défense | test |
|---|---|---|
| une page HTML ou un script rangé comme un PDF, puis ouvert dans l'origine de l'app (une stored XSS : un script glissé dans les données, qui s'exécute ensuite dans la page d'un autre) | le type cru d'après ses premiers octets seulement ; les téléchargements en pièces jointes, leur type jamais deviné, sous sandbox | `isTypeTrustedByItsBytesOnly`, `isStoredByPartsAndReadByRanges` |
| un fichier trop gros, ou beaucoup à la fois, pour remplir la mémoire ou le disque (upload bombs : des envois faits pour saturer le serveur) | au-delà de `most`, refusé avant qu'un octet soit lu ; le corps jamais en entier (une partie, un morceau) ; `APP_UPLOADS_AT_ONCE` (16) envois à la fois dans un processus, puis `503` ; Centauri ne décode jamais un fichier, donc un zip ou une image qui se décompresse en gigaoctets garde sa propre taille | `isTooLargeRefused`, `isUploadsAtOnceBounded`, `isStreamedOverTheNetwork` |
| un envoi lent qui tient une connexion (slowloris : garder des connexions ouvertes en envoyant très lentement) | chaque morceau dans le timeout, le tout dans le timeout plus une seconde par 64 KiB | `tests/net/http-pieces.ce` de Cesia |
| un nom qui remonte hors d'un dossier (`../../etc/passwd`), ou qui ajoute un header (une ligne d'information en tête d'une réponse HTTP) | un fichier ne nomme aucun chemin (ses octets sont dans la base) ; son nom gardé comme sa dernière partie, sans caractères de contrôle ni guillemets | `isNameKeptHarmless` |
| le scan d'un autre cabinet, par son id | `app.Own` (404) | `isOtherTenantsFileHidden`, `apptest.Isolated` |
| une plage dont les nombres repartent à zéro ou débordent | une plage lue comme faite de nombres de 15 chiffres au plus ; après la fin, un `416` | `isStoredByPartsAndReadByRanges` |

## 6. Ce que ça coûte

Mesuré sur cette machine, avec un vrai serveur Cepheus sur son SSD, 21 exécutions (2026-11-26, charge de 1,3 à 2,9) :
un scan de 10 MiB d'octets aléatoires (qu'aucune compression ne réduit) est rangé en 274 ms [210 ; 2 986] (38 MB/s :
dix parties, chacune forcée sur le disque), relu en entier en 51 ms [46 ; 56] (207 MB/s), et une plage de 64 KiB en
son milieu en 0,9 ms [0,9 ; 1,1]. Le premier nombre porte dix `fsync` du vault (l'appel système qui attend que les
octets soient vraiment sur le disque) ; Spring avec S3 porterait à la place les allers-retours vers S3 (non mesurés
ici).

Suite : [Les factures impayées, en direct](live.md).
