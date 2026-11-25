# The report of each night

The task: at 06:00 in Paris, every day, the owners of each office with invoices not paid get a mail with their count
and their sum; one run a day whether the app runs on one process or on three servers; a server of mail down for an
hour loses no mail. The code is `src/jobs/` and `src/mail/`, their tests `tests/jobs.test.ce` and
`tests/mail.test.ce`; the invoices' report is `report` in `examples/invoices/src/invoices/month.ce`, checked by
`isReportOfTheNightSentAndTriedAgain`.

What it uses: background jobs (`jobs.Kind`, `jobs.Later`), written in the group of the write that asks for them;
schedules of cron on the clock of a zone (`jobs.Every`); retries after a backoff and the dead list; mail by SMTP over
TLS or by Postmark (`mail.Send`, `mail.Later`).

## 1. A job, in the group of its write

A job is a thing of Cepheus (`centauri_job`: its kind, its arguments, its state, when it may run, its tries, its
lease). `jobs.Later` gives its facts, to write **in the group of the write that asks for it**:

```
Welcome = jobs.Kind("welcome", check.Record({User: check.Id(), Email: check.Email()}), (job, env) -> mail.Send(env, {To: job.Email, Subject: "Welcome", Text: "Hello."}))

ops = list.Concat(app.Facts(User, cepheus.New(1), {...}), jobs.Later(Welcome, {User: cepheus.New(1), Email: x.Email}))
cepheus.Write(ops, r.Db)?
```

The job exists if and only if the write took place: no mail for an account that was not made, and no account whose
mail is lost because the process stopped between the two (the *transactional outbox*, without its table or its loop).
A field may name a thing new in the group, `cepheus.New(1)`: the job gets its id.

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

**Who runs it.** Each process of the app has `JobWorkers` fibers (4). They wake when the ready jobs change (a
`cepheus.Watch`) and at the next one due: nothing polls. A fiber takes a job by a group that expects it `ready` and
writes it `running` with a lease of the kind's seconds (60), renewed every third of it while it runs: two processes
that take it at once, Cepheus refuses one (`isTakenOnceByTwoAtOnce`). A process that dies leaves its jobs to the
others once their lease passes (`isTakenBackFromADeadProcess`). So a job runs **at least once**, and must bear a second
run: `env.Job.Id` is a key of idempotency for a provider.

**When it fails.** An `Err` runs it again after a pause drawn at random between 1 second and min(1 hour, 2^n) seconds
(*full jitter*, Brooker 2015: a thousand jobs that fail together don't come back together); after its `tries` (8) it
is `dead`, kept, visible (`GET /admin/jobs`), and run again by hand (`POST /admin/jobs/:id/retry`)
(`isTriedAgainAfterABackoff`, `isDeadAfterItsTriesAndRetried`). `jobs.Stop(message)` gives up at once, for what no
retry can mend. A job whose kind the app doesn't have, whose arguments don't fit its shape (the database written by
another), that panics or runs past its `most` seconds is dead or stopped, and holds no other back
(`isPoisonDeadOrStopped`).

## 2. A schedule

```
Report = jobs.Every("report", "0 6 * * *", report, zone = "Europe/Paris")
App = app.Of([auth.Module(), jobs.Module(every = [Report]), hooks.Module(), Module], ...)
```

- Five fields of cron (minute, hour, day, month, weekday; `*`, numbers, ranges, lists, steps, names), or `@daily`,
  `@hourly`... When both the day of the month and the day of the week are given, a day matches either, as Vixie cron.
- The zone is read from the system's zones (tzdata, `/usr/share/zoneinfo`, RFC 9636), its changes as they were and as
  its rule says they will be, up to 2100; `UTC` needs no file. An app in a container without tzdata stops at its start
  and says so.
- **One run a slot.** Each process computes the next slot and writes its job under the key `report@2026-11-26T06:00+01:00`,
  unique: on 4 processes or 3 servers one writes it, the others are refused, with no leader to elect
  (`isOneRunASlotWhateverTheProcesses`).
- **Summer time.** A slot that the clock skips (02:30 on the last Sunday of March in Paris) runs at the first minute
  after it (03:00); a slot the clock shows twice (02:30 on the last Sunday of October) runs once, at the first
  (`isSlotOfSummerTimeOnce`).
- A slot missed while no process ran still runs when one starts, if it is no older than `late` seconds (3600).

```java
// Spring Boot: @Scheduled(cron = "0 0 6 * * *", zone = "Europe/Paris") runs on every instance; one run a slot needs
// ShedLock (a table of locks, its provider, @SchedulerLock with lockAtMostFor), or Quartz in cluster mode (11 tables)
@Scheduled(cron = "0 0 6 * * *", zone = "Europe/Paris") @SchedulerLock(name = "report", lockAtMostFor = "PT30M")
void report() { offices.findWithUnpaid().forEach(o -> mails.send(o.owners(), unpaidOf(o))); }
```

The report itself writes **one mail job an office**, so that an office whose mail fails is tried again alone:

```
defn report(job, env)
  offices = cepheus.Find(3, (i, o, t) -> {Where: [[i, Invoice.Tenant, o], [i, Invoice.Total, t], cepheus.Not([i, Invoice.Status, "paid"])],
    Give: {Office: o, Total: cepheus.Sum(t), Count: cepheus.Count()}}, env.Db)?
  ...
      ops = list.Concat(ops, mail.Later({To: to, Subject: "Unpaid invoices: $(o.Count)", Text: "..."}, thing = 1000 + k))
  ...
  cepheus.Write(ops, env.Db, why = env.Why)?
end
```

## 3. The mail

`mail.Send(env, {To, Subject, Text, Html, ReplyTo})` sends now; `mail.Later(m)` gives the facts of a job that sends it,
tried again while the server of mail asks for later. The setting `MailUrl` says how, and nothing else changes:

| `APP_MAIL_URL` | how |
|---|---|
| `smtps://user:password@host:465` | SMTP (RFC 5321) in TLS from the start, as RFC 8314 recommends |
| `smtp://user:password@host:587` | SMTP with STARTTLS, required: a server that doesn't offer it gets nothing, a mail never goes in clear |
| `postmark://TOKEN` | the HTTP API of Postmark, over https |
| `file:///folder` | each mail a file `.eml`, for dev |
| `log:` | each mail a line of the log (dev's default) |
| `test:` | kept in the box of the process, `t.Mails()` (test's default) |

`APP_MAIL_CA` trusts the authorities of a company's own server of mail; `APP_MAIL_TIMEOUT` (30 s) bounds a mail. A
`5xx` of SMTP, or a Postmark refusal (an inactive address), is refused for good: its job is dead at once; a `4xx`, a
`429` or a server that can't be reached is for later (`isRefusedForGoodOrForLater`). Every header is checked: a line end
in an address, a subject or a name would add a header (`Bcc:`) or a command of SMTP (`RCPT TO:`), and is refused; the
text goes in base64, so that no line of it is read as the end of the message (`isHeaderInjectionRefused`). DKIM is the
provider's.

```java
// Spring Boot: spring-boot-starter-mail, spring.mail.* properties, a JavaMailSender; Postmark by its own client
@Autowired JavaMailSender sender;
void send(String to, String subject, String text) { var m = new SimpleMailMessage(); m.setTo(to); m.setSubject(subject); m.setText(text); sender.send(m); }
```

## 4. Its test

```
defn isReportOfTheNightSentAndTriedAgain()
  s = office()?
  t = s.T
  t.Advance(5 * 3600 + 60)                           (* 05:01 UTC, 06:01 in Paris *)
  t.RunJobs()?
  m = [x for x in t.Mails() if text.StartsWith("Unpaid invoices", x.Subject)]
  ...
end
```

`t.Advance` moves the test's clock; `t.RunJobs()` writes the slots due and runs the jobs due, one after the other.

Next: [The scan of an invoice](scans.md).
