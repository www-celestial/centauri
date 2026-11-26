# Les factures impayées, en direct

La tâche : chaque page qui montre les factures impayées d'un cabinet change dès qu'elles changent, quand un comptable
en paie une depuis une autre page, un autre navigateur ou un autre serveur de l'app (l'application, le serveur et ses
pages). Une page qui paie depuis l'écran lui-même passe par la même porte (ce que Centauri vérifie à l'entrée de chaque
requête) que par HTTP. Et une page d'un autre cabinet, d'un autre site, ou d'un utilisateur qui s'est déconnecté, ne
voit rien. Le code est dans `src/app/live.ce` (au-dessus de `std/live` de Cesia), ses tests dans `tests/live.test.ce`.
La liste de l'exemple des factures est `unpaid` dans `examples/invoices/src/invoices/month.ce`, vérifiée par
`isUnpaidLiveOnEveryPage` sur deux serveurs.

Ce qu'il utilise : `api.Live`, `app.Live` ; un `cepheus.Watch` (une question à la base qui se relance à chaque
changement) écrit par le serveur ; `std/live` monté sur `/live` avec la session (le temps où un utilisateur reste
connecté) et les droits ; les endpoints comme actions (un endpoint est une adresse de l'API avec sa méthode HTTP, comme
`POST /clients`).

## 1. Le contrat et la question

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/api
use deps/www-celestial/centauri/src/app
use deps/www-celestial/cepheus/cesia/cepheus
use std/json
Invoice = json.Parse("{}")!
InvoiceRow = json.Parse("{}")!
e = json.Parse("{}")!
```

```cesia norun
Unpaid = api.Live("invoices.unpaid", out = InvoiceRow, role = "accountant")

unpaid(s, args) = cepheus.Watch(7, (i, no, b, d, u, st, t) -> {Where: [[i, Invoice.Tenant, s.User.Tenant], [i, Invoice.Number, no],
  [i, Invoice.BillTo, b], [i, Invoice.Date, d], [i, Invoice.Due, u], [i, Invoice.Status, st], cepheus.Not([i, Invoice.Status, "paid"]), [i, Invoice.Total, t]],
  Give: {Id: i, Number: no, BillTo: b, Date: d, Due: u, Status: st, Total: t}}, s.Db, until = s.Ended)

Module = app.Module("invoices", (* ... *) serve = [(* ... *) app.Live(e.Unpaid, unpaid), (* ... *)])
```

Le handler (la fonction qui répond à une requête) reçoit l'écran `s` (`{User, Db, Ended, Settings, Env, Now}`) et les
arguments que la page a demandés, lus à travers la forme de l'endpoint (une forme dit ce qu'une valeur doit être : un
texte de 1 à 120 octets, un nombre entier...). Il écrit lui-même la question, avec le cabinet de `s.User` dedans : la
page n'envoie jamais de question, seulement le nom d'un show (une liste en direct qu'une page demande par son nom).
`until = s.Ended` termine le watch avec l'écran.

Une page ouvre son écran avec son cookie (un petit texte que le navigateur garde et renvoie à chaque requête), depuis
l'origine de l'app (son schéma, son domaine et son port), et nomme ses shows (le côté de la page, c'est `live.js` de
`std/live`, à `/live/live.js`) :

```text
ws://app.example/live?shows=[{"Show":"invoices.unpaid","Args":{}}]
```

Le premier message d'un show est sa réponse, `{Show, Group, Rows}` ; chacun des suivants est un changement,
`{Show, Group, Added, Removed}`. Quand la page du front (la partie de l'app qui tourne dans le navigateur) enverra ses
shows dans son hello, son premier message (le protocole 2 de `std/live`, à venir), la même vérification les lira là.

```java
// Spring Boot: spring-boot-starter-websocket with STOMP, a @MessageMapping, a SimpMessagingTemplate that each write
// must call, and a broker (RabbitMQ or Redis) between the instances, or each server tells only its own pages
@Transactional public InvoiceOut pay(long id, Principal u) {
  var inv = ...; inv.status = "paid";
  messaging.convertAndSend("/topic/offices/" + u.officeId() + "/unpaid", new Removed(inv.id));   // and if the commit fails?
  return InvoiceOut.of(inv);
}
@Bean MessageBrokerRegistry broker(MessageBrokerRegistry r) { r.enableStompBrokerRelay("/topic").setRelayHost("rabbitmq"); return r; }
```

## 2. Pas de broker : les écritures sont les événements

Un show est un `cepheus.Watch` : Cepheus calcule ses changements à partir des écritures, quel que soit le processus et
quel que soit le serveur qui les a faites, et seulement une fois leur groupe sur le disque (un groupe : des écritures
faites toutes ensemble, ou pas du tout). Il n'y a donc rien à envoyer après une écriture (une écriture qui échoue
n'envoie rien), pas de broker entre les serveurs (un serveur de messages placé entre eux, comme RabbitMQ), pas de
message perdu ou doublé quand une connexion casse (le watch reprend depuis son dernier groupe). Le test paie une
facture par un second serveur de la même base, et la page du premier serveur voit la ligne partir
(`isShownAsWritesComeAcrossServers`, `isUnpaidLiveOnEveryPage`).

Les pages d'administration sont faites ainsi elles aussi : leur page Événements, avec Direct pressé, est le show
`admin.events` sur l'écran de la page : les événements de la dernière heure, chaque nouveau en haut dès qu'il est écrit,
par n'importe quel serveur.

![La page Événements de l'administration avec Direct pressé : « direct : la dernière heure, au fil de l'eau », et le tableau des événements, le plus récent d'abord, chacun avec son heure, son type, son utilisateur, son tenant, son adresse, sa route et ce qui s'est passé.](images/admin-events-live.png)

## 3. Les actions : les endpoints, par la même porte

L'action d'une page est un endpoint de l'app, désigné par son nom :
`{"Act": "POST /invoices/:id/pay", "Id": 7, "Args": {"id": 65540}}`. Centauri la fait passer par la même porte qu'une
requête HTTP de la même page (sa session, ses limites, son rôle, ses formes, sa sortie), et la page reçoit `{Ack, Ok}`
ou `{Ack, Err}`, où `Err` est le même `{Kind: "api", Status, Message, Fields}` que par HTTP. Une définition, un
handler, deux transports. Les paramètres du chemin arrivent par leurs noms ; le reste est le corps (ou la query d'un
GET, les paramètres à la fin de l'adresse).

## 4. Les droits, et la fin d'un écran

- La session de l'écran est lue dans son cookie à l'ouverture ; une page sans session reçoit `Sign in first.` et se
  ferme.
- `http.SameOrigin` refuse une ouverture venue d'un autre site (un `403`), comme la porte de Centauri le fait pour
  toute requête d'un autre site qui change quelque chose.
- Le rôle de chaque show est vérifié, ses arguments lus à travers sa forme (un `422` avec les champs). Un show qui
  n'existe pas, plus de 64 shows, ou plus de 16 écrans par session sont refusés (`isRefusedWithoutRights`).
- Une déconnexion, un utilisateur désactivé, un rôle retiré ferment tout de suite les écrans de la session, quel que
  soit le serveur qui l'a fait (le module des comptes donne un watch des faits de la session, `auth.Ends`). Une session
  qui prend fin par son temps les ferme à ce moment-là (`isEndedBySignOut`).
- Les lignes d'un autre cabinet n'arrivent jamais : le cabinet de l'utilisateur est dans la question qu'écrit le
  serveur.

## 5. Ce que ça coûte

Une écriture vue par une page sur cette machine, à travers le watch, `std/live` et un WebSocket (une connexion qui
reste ouverte entre la page et le serveur) : 0,12 ms [0,11 ; 0,12] (médiane de 20 écritures, 21 exécutions, un fork
dans le programme, c'est-à-dire une base dans sa mémoire ; `bench/month.ce`). Par un serveur Cepheus, ajoutez son
`fsync` (l'appel système qui attend que les octets soient vraiment sur le disque) et la livraison de son watch (19 µs,
mesurés par Cepheus).

Suite : [Prévenir un partenaire, et prendre ses réponses](partner.md).
