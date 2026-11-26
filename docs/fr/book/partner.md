# Prévenir un partenaire, et prendre ses réponses

La tâche : quand une facture est payée, le partenaire du cabinet (sa banque, sa comptabilité) est prévenu par un
message signé, même si son serveur est en panne pendant une heure. Ses réponses reviennent signées, et chacune n'est
traitée qu'une fois, aussi souvent qu'elle arrive. L'app (l'application, le serveur et ses pages) n'appelle jamais une
adresse de sa propre machine ou de son réseau, qui que ce soit qui la lui ait donnée. Et un client qui renvoie un
paiement après une connexion coupée ne paie qu'une fois. Le code est dans `src/hooks/hooks.ce`, `src/app/call.ce` et
`src/app/idem.ce`, leurs tests dans `tests/calls.test.ce`. Le partenaire de l'exemple des factures est dans
`examples/invoices/src/invoices/month.ce` et dans `paying`, vérifié par `isPartnerToldAndHisAnswerTaken`.

Ce qu'il utilise : des webhooks (un appel HTTP que l'app envoie à un partenaire quand quelque chose arrive) tels que
les écrit *Standard Webhooks*. Ils sont envoyés par des jobs (un travail fait en arrière-plan, hors de la requête)
écrits dans le groupe du paiement (un groupe : des écritures faites toutes ensemble, ou pas du tout), et reçus avec
leur signature, leur heure et leur id vérifiés. Il utilise aussi `app.Call`, avec son délai maximal, ses nouvelles
tentatives et ses vérifications d'adresses ; et le header `Idempotency-Key` (un header est une ligne d'information en
tête d'une requête HTTP).

## 1. Un endpoint du partenaire

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/api
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/hooks
use deps/www-celestial/cepheus/cesia/cepheus
use std/check
use std/dict
use std/list
use std/value
use std/json
Invoice = json.Parse("{}")!
invoiceOf = json.Parse("{}")!
```

```cesia norun
AddPartner = api.Post("/partners", body = check.Record({Url: check.Url(https = true)}), out = check.Record({Id: check.Id(), Secret: check.Text()}), role = "admin")
addPartner(r, x) = hooks.Add(x.Url, ["invoice.paid"], r)
```

`hooks.Add` garde l'adresse et les types de messages qu'elle accepte, et fabrique son secret (`whsec_` suivi de 24
octets aléatoires en base64), rendu cette fois seulement. La base de données le garde scellé sous la clé de l'app
(`APP_SECRET`), jamais en clair.

## 2. Le message, dans le groupe du paiement

```cesia norun
defn paying(r)
  inv = app.Own(Invoice, r.Params.id, r)?
  (* ... *)
  told = hooks.Later("invoice.paid", {Invoice: inv.Id, Number: inv.Number, Total: inv.Total, PaidAt: r.Now}, r)?
  cepheus.Write(list.Concat([cepheus.Expect(inv.Id, Invoice.Status, inv.Status), cepheus.Add(inv.Id, Invoice.Status, "paid"), (* ... *)], told), r.Db, (* ... *))?
  invoiceOf(inv.Id, r)
end
```

`hooks.Later` donne un job pour chaque endpoint actif du cabinet qui accepte ce type (un endpoint est une adresse avec
sa méthode HTTP ; ici, celle du partenaire, qui reçoit les messages) : écrit avec le paiement, les deux ou aucun. Le
job envoie :

```text
POST https://partner.example/in
webhook-id: msg_6b5d...                     (the same at every try: the partner does it once)
webhook-timestamp: 1794528000
webhook-signature: v1,<base64 of HMAC-SHA256(key, id.timestamp.body)>
{"type":"invoice.paid","timestamp":"2026-11-13T00:00:00Z","data":{"Invoice":65540,"Number":1,"Total":1280.5,"PaidAt":1794528000}}
```

La signature est celle de la spécification : la même que celle de ses bibliothèques de référence sur leur vecteur de
test (`isSignedAsStandardWebhooks`). Un `2xx`, c'est fait. Une autre réponse, ou un serveur injoignable, relance le job
après le backoff des jobs (une pause tirée au hasard, plus longue à chaque échec), jusqu'à 8 tentatives ; puis il est
mort, et visible (`isSentSignedAndTriedAgain`). Un `410 Gone` éteint l'endpoint (`isGoneTurnedOff`). Une adresse d'un
réseau privé est morte tout de suite, son serveur jamais atteint (`isPrivateEndpointDeadAtOnce`).

```java
// Spring Boot: no webhooks; an entity of endpoints, an outbox (chapter 7), a RestClient, the HMAC by javax.crypto,
// Spring Retry's @Retryable, and the checks of addresses by hand (or Svix, a service)
@Retryable(maxAttempts = 8, backoff = @Backoff(delay = 1000, multiplier = 2, random = true))
void send(Endpoint e, Message m) {
  var ts = Instant.now().getEpochSecond(); var body = json(m);
  var sig = "v1," + base64(hmac(key(e.secret), m.id + "." + ts + "." + body));
  rest.post().uri(e.url).header("webhook-id", m.id).header("webhook-timestamp", "" + ts).header("webhook-signature", sig).body(body).retrieve().toBodilessEntity();
}
```

## 3. Des appels qui n'atteignent jamais le mauvais endroit

`app.Call(url, env, method, body, headers, timeout, tries, most, follow)` est la façon dont l'app interroge un autre
service (les webhooks s'en servent). Une adresse donnée par quelqu'un d'autre est un chemin vers le réseau où se trouve
le serveur : c'est la *server-side request forgery*, SSRF (faire appeler par le serveur une adresse qu'il ne devrait
pas appeler), le A10 de la liste 2021 de l'OWASP ; `http://169.254.169.254/` donne les clés d'une machine du cloud.
Donc :

- l'adresse **vérifiée est celle à laquelle on est connecté**, telle que la donne `net.Peer`, avant qu'aucun octet ne
  parte (ceux de TLS, le chiffrement de la connexion, compris) : un nom auquel un serveur de noms répond `127.0.0.1` à
  la deuxième recherche (*DNS rebinding*) ne peut pas passer, puisqu'il n'y a pas de deuxième recherche ;
- refusés : cette machine, les blocs privés, link-local (valables sur un seul lien réseau), partagés, multicast
  (adressés à un groupe de machines) et réservés d'IPv4 et d'IPv6, et une adresse IPv4 cachée dans une adresse IPv6
  (mapped, NAT64, 6to4), lue comme elle-même, sous toutes ses écritures (`2130706433`, `0x7f000001`, `127.1`,
  `0177.0.0.1`, `[::ffff:127.0.0.1]`, `localhost`, un nom dans `/etc/hosts`) (`isPrivateInEverySpelling`,
  `isCallToThisMachineRefusedBeforeAByte`) ;
- une redirection est une réponse, qui n'est pas suivie, sauf si `follow` le demande ; alors chaque adresse est
  vérifiée comme la première (`isAllowedHostAndItsRedirects`). Une adresse avec un utilisateur et un mot de passe, ou
  qui n'est pas en http, est refusée ; le http en clair aussi, sauf avec `APP_CALL_PLAIN=allow` (`isCallShapeChecked`) ;
- `APP_CALL_ALLOW` nomme les machines du réseau qu'un appel a le droit d'atteindre (un partenaire sur le réseau de
  l'entreprise) ; `APP_CALL_CA`, les autorités de leurs certificats ;
- chaque tentative a son délai maximal, connexion comprise (`APP_CALL_TIMEOUT`, 10 s) (`isSilentServiceCut`). Un
  service injoignable, ou qui répond `429`, `502`, `503`, `504`, est retenté après une pause tirée au hasard, ou après
  son `Retry-After` (10 s au plus). Mais seulement pour une méthode qu'une deuxième tentative ne répète pas (GET, PUT,
  DELETE), ou pour une requête qui a un `Idempotency-Key` (`isRetriedWhenItMayBe`). Pas de circuit breaker (un
  disjoncteur qui cesse d'appeler un service qui échoue trop) : une app de gestion appelle peu de services.

## 4. Ses réponses

```cesia norun
PartnerAnswer = api.Post("/partner/answers", out = check.Record({Done: check.Bool()}), role = api.Public)

defn partnerAnswer(r)
  m = hooks.Verify(r, r.Settings.PartnerSecret)?
  if m.Again or m.Type != "invoice.acknowledged"
    return {Done: true}
  end
  inv = if value.IsDict(m.Data) app.IdOf(dict.Get("Invoice", m.Data)) else missing end
  (* ... *)
  done = cepheus.Write(list.Concat([cepheus.Expect(inv, Invoice.Acknowledged), cepheus.Add(inv, Invoice.Acknowledged, r.Now)], m.Seen), r.Db, why = r.Why)
  (* ... *)
end
```

`hooks.Verify` vérifie les trois headers, l'heure (5 minutes d'écart au plus, dans un sens ou dans l'autre :
`APP_HOOK_TOLERANCE`), et la signature (n'importe laquelle de celles que le message porte, comparée en un temps qui ne
trahit rien). `m.Seen` garde l'id du message unique dans Cepheus, écrit **dans le groupe de ce que fait le handler**
(la fonction qui répond à une requête). Un message renvoyé (le partenaire n'a pas reçu notre 200), ou rejoué par
quelqu'un qui l'a intercepté, trouve son id déjà pris, `m.Again`, et ne fait rien ; si deux arrivent au même moment,
le second groupe est refusé (`unique`). Un message forgé, modifié, signé par un autre secret, trop vieux ou venu du
futur reçoit un `401` ; un message sans ses headers, un `400` (`isReceivedOnceAndForgeriesRefused`).

## 5. Envoyé deux fois, fait une fois

Une page qui paie et perd sa connexion ne sait pas si le paiement est passé. Elle le renvoie avec le même header
`Idempotency-Key` (le draft de l'IETF, un projet de norme), et reçoit la réponse du premier, qui n'a tourné qu'une
fois, avec `Idempotent-Replayed: true` :

| la même clé | réponse |
|---|---|
| avec la même requête, une fois la réponse donnée | la première réponse à nouveau, son statut et son corps |
| pendant que la première tourne | `409` : la renvoyer dans un moment |
| avec une autre requête | `422` |
| d'un autre appelant | sa propre clé : une clé appartient à un appelant (sa session, le temps où il reste connecté, ou son adresse s'il n'en a pas) et à un endpoint |

La clé est gardée unique dans Cepheus avec le hash de sa requête (une empreinte : un nombre calculé à partir d'un
texte, d'où on ne peut pas revenir au texte) ; deux serveurs ne la font donc jamais tourner tous les deux. Une réponse
qu'une nouvelle tentative ne doit pas recevoir à nouveau (un `5xx`, un `401`, un `409`, un `429`) libère la clé. Les
clés sont gardées `APP_IDEMPOTENCY_TIME` (un jour). `APP_IDEMPOTENCY_KEY` vaut `honored` (le défaut), `required` (une
requête qui change quelque chose sans clé reçoit un `400`) ou `ignored` (`isIdempotencyKeyRunOnce`,
`isIdempotencyKeyRequiredAndChecked`).

```java
// Spring Boot: no Idempotency-Key; a filter, a table keyed by the key with its hash and its answer, and its
// cleaning, by hand (Stripe's design, written again in each app)
```

## 6. Ce que ça coûte

Mesuré dans le programme, 21 exécutions (`bench/month.ce`, 2026-11-26, charge de 2,5 à 2,8) : un webhook signé en
15,7 µs [15,4 ; 23,3] ; une adresse vérifiée en 21,9 µs [21,4 ; 24,3] ; un `POST` en 94,8 µs [92,7 ; 128,9]. Avec une
nouvelle clé, 198 µs [194 ; 306] (une question et deux écritures de plus, sur un fork : une base dans la mémoire du
programme). Avec une clé déjà vue, 52,6 µs [51,3 ; 84,1] : la première réponse, redonnée, coûte moins cher que de
refaire la requête.

Suite : [Changer le schéma sans rien arrêter](schema.md).
