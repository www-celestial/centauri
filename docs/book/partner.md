# Tell a partner, and take his answers

The task: when an invoice is paid, the office's partner (its bank, its accounting) is told by a signed message, even
if his server is down for an hour; his answers come back signed, and each is done once, however often it comes; the
app never calls an address of its own machine or network for whoever gave it one; and a client that sends a payment
again after a broken connection pays once. The code is `src/hooks/hooks.ce`, `src/app/call.ce` and `src/app/idem.ce`,
their tests `tests/calls.test.ce`; the invoices' partner is in `examples/invoices/src/invoices/month.ce` and in
`paying`, checked by `isPartnerToldAndHisAnswerTaken`.

What it uses: webhooks as *Standard Webhooks* writes them, sent by background jobs written in the group of the payment,
received with their signature, their time and their id checked; `app.Call` with its deadline, its retries and its
checks of addresses; the `Idempotency-Key` header.

## 1. An endpoint of the partner

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

`hooks.Add` keeps the address and the types of messages it takes, and makes its secret (`whsec_` and 24 random bytes in
base64), given back this once; the database keeps it sealed under the app's key (`APP_SECRET`), never in clear.

## 2. The message, in the group of the payment

```cesia norun
defn paying(r)
  inv = app.Own(Invoice, r.Params.id, r)?
  (* ... *)
  told = hooks.Later("invoice.paid", {Invoice: inv.Id, Number: inv.Number, Total: inv.Total, PaidAt: r.Now}, r)?
  cepheus.Write(list.Concat([cepheus.Expect(inv.Id, Invoice.Status, inv.Status), cepheus.Add(inv.Id, Invoice.Status, "paid"), (* ... *)], told), r.Db, (* ... *))?
  invoiceOf(inv.Id, r)
end
```

`hooks.Later` gives a job for each active endpoint of the office that takes the type: written with the payment, both
or neither. The job sends:

```text
POST https://partner.example/in
webhook-id: msg_6b5d...                     (the same at every try: the partner does it once)
webhook-timestamp: 1794528000
webhook-signature: v1,<base64 of HMAC-SHA256(key, id.timestamp.body)>
{"type":"invoice.paid","timestamp":"2026-11-13T00:00:00Z","data":{"Invoice":65540,"Number":1,"Total":1280.5,"PaidAt":1794528000}}
```

The signature is the specification's: the same as its reference libraries on their test vector
(`isSignedAsStandardWebhooks`). A `2xx` is done; another answer, or a server that can't be reached, runs again after
the jobs' backoff, up to 8 tries, then dead and visible (`isSentSignedAndTriedAgain`); a `410 Gone` turns the endpoint
off (`isGoneTurnedOff`); an address of a private network is dead at once, its server never reached
(`isPrivateEndpointDeadAtOnce`).

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

## 3. Calls that never reach the wrong place

`app.Call(url, env, method, body, headers, timeout, tries, most, follow)` is how the app asks another service (the
webhooks use it). An address given by someone else is a way into the network the server sits in (*server-side request
forgery*, SSRF, the A10 of OWASP's 2021 list: `http://169.254.169.254/` gives the keys of a cloud machine), so:

- the address **checked is the one connected**, as `net.Peer` gives it, before any byte goes (TLS's included): a name
  that a server of names answers with `127.0.0.1` at the second lookup (*DNS rebinding*) can't pass, since there is no
  second lookup;
- refused: this machine, private, link-local, shared, multicast and reserved blocks of IPv4 and IPv6, and an address of
  IPv4 inside one of IPv6 (mapped, NAT64, 6to4) read as itself, in every spelling (`2130706433`, `0x7f000001`, `127.1`,
  `0177.0.0.1`, `[::ffff:127.0.0.1]`, `localhost`, a name in `/etc/hosts`) (`isPrivateInEverySpelling`,
  `isCallToThisMachineRefusedBeforeAByte`);
- a redirect is an answer, not followed, unless `follow` asks, and then each address is checked as the first
  (`isAllowedHostAndItsRedirects`); an address with a user and a password, or not of http, is refused; plain http too,
  unless `APP_CALL_PLAIN=allow` (`isCallShapeChecked`);
- `APP_CALL_ALLOW` names the hosts of the network a call may reach (a partner on the company's network); `APP_CALL_CA`
  the authorities of their certificates;
- each try has its deadline, the connection included (`APP_CALL_TIMEOUT`, 10 s) (`isSilentServiceCut`); a service that
  can't be reached or answers `429`, `502`, `503`, `504` is tried again after a pause drawn at random, or its
  `Retry-After` (10 s at most), but only for a method that a second try doesn't repeat (GET, PUT, DELETE) or a request
  with an `Idempotency-Key` (`isRetriedWhenItMayBe`). No circuit breaker: an app of management calls a few services.

## 4. His answers

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

`hooks.Verify` checks the three headers, the time (5 minutes either way: `APP_HOOK_TOLERANCE`), and the signature (any
of those it carries, compared in a time that tells nothing). `m.Seen` keeps the message's id unique in Cepheus, written
**in the group of what the handler does**: a message sent again (the partner didn't get our 200) or replayed by
someone who caught it finds its id taken, `m.Again`, and does nothing; two at the same moment, the second group is
refused (`unique`). A message forged, changed, signed by another secret, too old or of the future is a `401`; one
without its headers a `400` (`isReceivedOnceAndForgeriesRefused`).

## 5. Sent twice, done once

A page that pays and loses its connection doesn't know whether the payment went. It sends it again with the same
`Idempotency-Key` header (the IETF's draft), and gets the answer of the first, which ran once, with
`Idempotent-Replayed: true`:

| the same key | answer |
|---|---|
| with the same request, once answered | the first answer again, its status and body |
| while the first runs | `409`: send it again in a moment |
| with another request | `422` |
| of another caller | his own key: keys are a caller's (his session, or his address without one) and an endpoint's |

The key is kept unique in Cepheus with the hash of its request, so two servers never both run it; an answer that a
retry must not get again (a `5xx`, a `401`, a `409`, a `429`) lets the key go. Keys are kept `APP_IDEMPOTENCY_TIME`
(a day); `APP_IDEMPOTENCY_KEY` is `honored` (the default), `required` (a request that changes something without one is
a `400`) or `ignored` (`isIdempotencyKeyRunOnce`, `isIdempotencyKeyRequiredAndChecked`).

```java
// Spring Boot: no Idempotency-Key; a filter, a table keyed by the key with its hash and its answer, and its
// cleaning, by hand (Stripe's design, written again in each app)
```

## 6. What it costs

Measured in the program, 21 runs (`bench/month.ce`, 2026-11-26, load 2.5 to 2.8): a webhook signed 15.7 µs [15.4,
23.3]; an address checked 21.9 µs [21.4, 24.3]; a `POST` 94.8 µs [92.7, 128.9], with a new key 198 µs [194, 306] (a
question and two writes more, on a fork), with a key seen 52.6 µs [51.3, 84.1] (the first answer, given again, costs
less than running it).

Next: [Change the schema without a stop](schema.md).
