# Le rapport de chaque nuit

La tâche : chaque jour à 06:00, heure de Paris, les propriétaires de chaque cabinet qui a des factures impayées
reçoivent un mail avec leur nombre et leur somme. Une seule exécution par jour, que l'app (l'application, le serveur et
ses pages) tourne sur un processus ou sur trois serveurs. Un serveur de mail en panne pendant une heure ne fait perdre
aucun mail. Le code est dans `src/jobs/` et `src/mail/`, ses tests dans `tests/jobs.test.ce` et `tests/mail.test.ce`.
Le rapport de l'exemple des factures est `report` dans `examples/invoices/src/invoices/month.ce`, vérifié par
`isReportOfTheNightSentAndTriedAgain`.

Ce qu'il utilise : des jobs, `jobs.Kind` et `jobs.Later` (un job est un travail fait en arrière-plan, hors de la
requête), écrits dans le groupe de l'écriture qui les demande (un groupe : des écritures faites toutes ensemble, ou pas
du tout) ; des schedules de cron (un schedule est un horaire qui se répète, écrit comme pour cron, le planificateur
d'Unix) sur l'horloge d'un fuseau horaire (`jobs.Every`) ; de nouvelles tentatives après un backoff (une pause avant de
réessayer, plus longue à chaque échec), et la liste des jobs morts ; le mail par SMTP (le protocole d'envoi des mails)
sur TLS (le chiffrement des connexions réseau) ou par Postmark, un service d'envoi de mails (`mail.Send`,
`mail.Later`).

## 1. Un job, dans le groupe de son écriture

Un job est une chose de Cepheus (*thing* dans le code) : `centauri_job`, avec sa sorte, ses arguments, son état, le
moment où il peut tourner, ses tentatives et son bail (le temps pendant lequel un processus le tient pour lui seul).
`jobs.Later` donne ses faits, à écrire **dans le groupe de l'écriture qui le demande** :

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/app
use deps/www-celestial/centauri/src/auth
use deps/www-celestial/centauri/src/hooks
use deps/www-celestial/centauri/src/jobs
use deps/www-celestial/centauri/src/mail
use deps/www-celestial/cepheus/cesia/cepheus
use std/check
use std/list
use std/text
use std/json
Invoice = json.Parse("{}")!
Module = json.Parse("{}")!
User = json.Parse("{}")!
k = json.Parse("{}")!
o = json.Parse("{}")!
office = json.Parse("{}")!
r = json.Parse("{}")!
to = json.Parse("{}")!
x = json.Parse("{}")!
```

```cesia norun
Welcome = jobs.Kind("welcome", check.Record({User: check.Id(), Email: check.Email()}), (job, env) -> mail.Send(env, {To: job.Email, Subject: "Welcome", Text: "Hello."}))

ops = list.Concat(app.Facts(User, cepheus.New(1), {(* ... *)}), jobs.Later(Welcome, {User: cepheus.New(1), Email: x.Email}))
cepheus.Write(ops, r.Db)?
```

Le job existe si et seulement si l'écriture a eu lieu : pas de mail pour un compte qui n'a pas été créé, et pas de
compte dont le mail se perd parce que le processus s'est arrêté entre les deux. C'est le *transactional outbox* (une
boîte d'envoi écrite dans la même transaction que les données), sans sa table ni sa boucle. Un champ peut nommer une
chose nouvelle du groupe, `cepheus.New(1)` : le job reçoit son id.

```java
// Spring Boot: @Async loses the job when the process stops; the outbox is a table, an entity, a @Scheduled poller
// and its lock (or Spring Modulith's event publication registry), written by hand
@Transactional public User signUp(SignUpIn in) {
  var u = users.save(new User(in.email()));
  outbox.save(new OutboxEvent("welcome", json(u)));   // same transaction
  return u;
}
@Scheduled(fixedDelay = 1000) @SchedulerLock(name = "outbox") void drain() { /* select ... for update skip locked, send, mark */ }
```

**Qui le fait tourner.** Chaque processus de l'app a `JobWorkers` fibers (4) ; une fiber est un fil d'exécution léger,
à l'intérieur du processus. Elles se réveillent quand les jobs prêts changent (un `cepheus.Watch`, une question à la
base qui se relance à chaque changement) et à l'heure du prochain job dû : rien n'interroge la base à intervalles
réguliers. Une fiber prend un job par un groupe qui exige qu'il soit `ready` et l'écrit `running`, avec un bail d'autant
de secondes que le dit sa sorte (60), renouvelé à chaque tiers de ce temps tant qu'il tourne. Si deux processus le prennent en
même temps, Cepheus en refuse un (`isTakenOnceByTwoAtOnce`). Un processus qui meurt laisse ses jobs aux autres une fois
leur bail passé (`isTakenBackFromADeadProcess`). Un job tourne donc **au moins une fois**, et doit supporter une
deuxième exécution : `env.Job.Id` sert de clé d'idempotence auprès d'un fournisseur (une clé qui lui permet de ne faire
qu'une fois une demande reçue deux fois).

**Quand il échoue.** Un `Err` le relance après une pause tirée au hasard entre 1 seconde et min(1 heure, 2^n) secondes
(*full jitter*, Brooker 2015 : mille jobs qui échouent ensemble ne reviennent pas ensemble). Après ses `tries` (8)
tentatives, il est `dead` : gardé, visible (`GET /admin/jobs`), et relancé à la main (`POST /admin/jobs/:id/retry`)
(`isTriedAgainAfterABackoff`, `isDeadAfterItsTriesAndRetried`). `jobs.Stop(message)` abandonne tout de suite, pour ce
qu'aucune nouvelle tentative ne peut réparer. Certains jobs sont morts ou arrêtés, et ne retiennent aucun autre job
(`isPoisonDeadOrStopped`) : un job d'une sorte que l'app n'a pas ; un job dont les arguments ne vont pas à sa forme,
parce qu'un autre a écrit la base (une forme dit ce qu'une valeur doit être : un texte de 1 à 120 octets, un nombre
entier...) ; un job qui fait une panic (un arrêt sur une erreur du programme) ; un job qui tourne plus de ses `most`
secondes.

## 2. Un schedule

```cesia norun
Report = jobs.Every("report", "0 6 * * *", report, zone = "Europe/Paris")
App = app.Of([auth.Module(), jobs.Module(every = [Report]), hooks.Module(), Module], (* ... *))
```

- Cinq champs de cron (minute, heure, jour, mois, jour de la semaine ; `*`, nombres, intervalles, listes, pas, noms),
  ou `@daily`, `@hourly`... Quand le jour du mois et le jour de la semaine sont donnés tous les deux, un jour convient
  s'il correspond à l'un ou à l'autre, comme dans Vixie cron.
- Le fuseau est lu dans les fuseaux du système (tzdata, `/usr/share/zoneinfo`, RFC 9636) : ses changements tels qu'ils
  ont été, et tels que sa règle dit qu'ils seront, jusqu'en 2100 ; `UTC` n'a besoin d'aucun fichier. Une app dans un
  container (un environnement isolé où tourne l'app, comme avec Docker) sans tzdata s'arrête à son démarrage, et le
  dit.
- **Une exécution par créneau.** Chaque processus calcule le prochain créneau et écrit son job sous la clé
  `report@2026-11-26T06:00+01:00`, unique : sur 4 processus ou 3 serveurs, un seul l'écrit, les autres sont refusés,
  sans leader à élire, c'est-à-dire sans processus choisi pour décider à la place des autres
  (`isOneRunASlotWhateverTheProcesses`).
- **L'heure d'été.** Un créneau que l'horloge saute (02:30 le dernier dimanche de mars à Paris) tourne à la première
  minute après lui (03:00). Un créneau que l'horloge montre deux fois (02:30 le dernier dimanche d'octobre) tourne une
  fois, à la première (`isSlotOfSummerTimeOnce`).
- Un créneau manqué pendant qu'aucun processus ne tournait tourne quand même au démarrage de l'un d'eux, s'il n'a pas
  plus de `late` secondes (3 600).

```java
// Spring Boot: @Scheduled(cron = "0 0 6 * * *", zone = "Europe/Paris") runs on every instance; one run a slot needs
// ShedLock (a table of locks, its provider, @SchedulerLock with lockAtMostFor), or Quartz in cluster mode (11 tables)
@Scheduled(cron = "0 0 6 * * *", zone = "Europe/Paris") @SchedulerLock(name = "report", lockAtMostFor = "PT30M")
void report() { offices.findWithUnpaid().forEach(o -> mails.send(o.owners(), unpaidOf(o))); }
```

Le rapport lui-même écrit **un job de mail par cabinet**, pour qu'un cabinet dont le mail échoue soit retenté seul :

```cesia norun
defn report(job, env)
  offices = cepheus.Find(3, (i, o, t) -> {Where: [[i, Invoice.Tenant, o], [i, Invoice.Total, t], cepheus.Not([i, Invoice.Status, "paid"])],
    Give: {Office: o, Total: cepheus.Sum(t), Count: cepheus.Count()}}, env.Db)?
  (* ... *)
      ops = list.Concat(ops, mail.Later({To: to, Subject: "Unpaid invoices: $(o.Count)", Text: "..."}, thing = 1000 + k))
  (* ... *)
  cepheus.Write(ops, env.Db, why = env.Why)?
end
```

## 3. Le courrier

`mail.Send(env, {To, Subject, Text, Html, ReplyTo})` envoie tout de suite ; `mail.Later(m)` donne les faits d'un job
qui l'envoie, retenté tant que le serveur de mail demande de revenir plus tard. Le réglage `MailUrl` dit comment, et
rien d'autre ne change :

| `APP_MAIL_URL` | comment |
|---|---|
| `smtps://user:password@host:465` | SMTP (RFC 5321) en TLS dès le début, comme le recommande la RFC 8314 |
| `smtp://user:password@host:587` | SMTP avec STARTTLS, exigé : un serveur qui ne le propose pas ne reçoit rien, un mail ne part jamais en clair |
| `postmark://TOKEN` | l'API HTTP de Postmark, en https |
| `file:///folder` | chaque mail dans un fichier `.eml`, pour le dev |
| `log:` | chaque mail sur une ligne du log, le journal de l'app (le défaut en dev) |
| `test:` | gardé dans la boîte du processus, `t.Mails()` (le défaut en test) |

`APP_MAIL_CA` fait confiance aux autorités de certification (celles qui signent les certificats des serveurs) du
serveur de mail propre à une entreprise ; `APP_MAIL_TIMEOUT` (30 s) borne la durée d'un mail. Un `5xx` de SMTP, ou un
refus de Postmark (une adresse inactive), est un refus définitif : son job est mort tout de suite. Un `4xx`, un `429`
ou un serveur injoignable, c'est pour plus tard (`isRefusedForGoodOrForLater`). Chaque header (une ligne d'information
en tête du mail) est vérifié : une fin de ligne dans une adresse, un sujet ou un nom ajouterait un header (`Bcc:`) ou
une commande SMTP (`RCPT TO:`), et elle est refusée. Le texte part en base64, pour qu'aucune de ses lignes ne soit lue
comme la fin du message (`isHeaderInjectionRefused`). DKIM (la signature qui prouve qu'un mail vient bien de son
domaine) est l'affaire du fournisseur.

```java
// Spring Boot: spring-boot-starter-mail, spring.mail.* properties, a JavaMailSender; Postmark by its own client
@Autowired JavaMailSender sender;
void send(String to, String subject, String text) { var m = new SimpleMailMessage(); m.setTo(to); m.setSubject(subject); m.setText(text); sender.send(m); }
```

## 4. Son test

```cesia norun
defn isReportOfTheNightSentAndTriedAgain()
  s = office()?
  t = s.T
  t.Advance(5 * 3600 + 60)                           (* 05:01 UTC, 06:01 in Paris *)
  t.RunJobs()?
  m = [x for x in t.Mails() if text.StartsWith("Unpaid invoices", x.Subject)]
  (* ... *)
end
```

`t.Advance` avance l'horloge du test ; `t.RunJobs()` écrit les créneaux dus et fait tourner les jobs dus, l'un après
l'autre.

Suite : [Le scan d'une facture](scans.md).
