# Pay an invoice once

The task: an accountant makes an invoice with its lines, numbered after the last of his office without a gap (as the
law of many countries asks), and pays it; a second payment, even at the same moment from another page, is refused; and
later anyone can find who paid it, and from which request. The code is `examples/invoices/src/invoices/invoices.ce`.

What it uses: a group of writes, all or nothing (`cepheus.Write`); `Expect`, a write only if nothing changed since the
read; `app.Next`, numbers without a gap; `app.Retry`; `by` and `why` on every write, and the events of Centauri.

## 1. An invoice and its lines, in one group

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/app
use deps/www-celestial/cepheus/cesia/cepheus
use std/list
use std/result
use std/text
use std/json
Client = json.Parse("{}")!
Invoice = json.Parse("{}")!
e = json.Parse("{}")!
invoiceOf = json.Parse("{}")!
lineOps = json.Parse("{}")!
office = json.Parse("{}")!
totalOf = json.Parse("{}")!
```

```cesia norun
defn addInvoice(r, x)
  c = app.Own(Client, x.Client, r)?
  total = totalOf(x)?
  inv = cepheus.New(1)
  ops = list.Concat([app.Next("invoice", [inv, Invoice.Number], r)?], app.Facts(Invoice, inv, {Tenant: r.User.Tenant, Client: c.Id,
    BillTo: c.Name, Search: text.Fold(c.Name), Date: x.Date, Due: x.Due, Status: "unpaid", Total: total}))
  made = cepheus.Write(list.Concat(ops, lineOps(inv, x.Lines, 2, r.User.Tenant)), r.Db, by = r.User.Id, why = r.Why)
  if result.IsErr(made) and made.Error.Code == "invalid"
    return app.Fail(409, "This client was deleted meanwhile.")
  end
  invoiceOf(made?.Things[1], r)
end
```

- `cepheus.New(1)` is the invoice the group makes, its lines `New(2)`, `New(3)`...; `app.Facts(kind, thing, fields)`
  gives the `Add` of each field. The group is all or nothing: no invoice without its lines, no line without its invoice.
- `app.Next("invoice", [inv, Invoice.Number], r)` gives the `Incr` of the office's counter (a thing of Centauri's kind
  `centauri_counter`, made at its first use), which writes the next number into the invoice **in the same group**:
  numbers follow each other without a gap, and 20 invoices made at once get 1 to 20, each once, without waiting for each
  other or retrying (`isNumberedInOrderAtOnce`).
- The client is read through `app.Own`: an invoice for another office's client is a 404.
- The rule `NoInvoiceOfDeleted` of the kinds (a `cepheus.Never`) refuses an invoice for a client deleted meanwhile,
  whatever the order of the two requests: the handler turns its `invalid` into a 409.

```java
@PostMapping @Transactional @PreAuthorize("hasRole('accountant')") @ResponseStatus(HttpStatus.CREATED)
InvoiceOut add(@Valid @RequestBody InvoiceIn in, @AuthenticationPrincipal Principal u) {
  var client = clients.findByIdAndOfficeId(in.client(), u.officeId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
  var office = offices.lockById(u.officeId());       // SELECT ... FOR UPDATE: invoices of one office wait for each other
  var inv = new Invoice(); inv.office = office; inv.client = client; inv.number = ++office.lastInvoice; ...
  for (var l : in.lines()) { var line = new Line(); line.invoice = inv; ...; inv.lines.add(line); }
  return InvoiceOut.of(invoices.save(inv));
}
```

## 2. Paid once

```cesia norun
defn paying(r)
  inv = app.Own(Invoice, r.Params.id, r)?
  if inv.Status == "paid"
    return app.Fail(409, "Invoice $(inv.Number) is paid already.")
  end
  cepheus.Write([cepheus.Expect(inv.Id, Invoice.Status, inv.Status), cepheus.Add(inv.Id, Invoice.Status, "paid"),
    cepheus.Add(inv.Id, Invoice.PaidAt, r.Now)], r.Db, by = r.User.Id, why = r.Why)?
  invoiceOf(inv.Id, r)
end

pay(r) = app.Retry(() -> paying(r))
```

There is no transaction open between the read and the write: the handler reads, decides, and writes with `Expect`,
"only if the status is still the one I read". Two payments at once: both read `unpaid`, Cepheus applies the groups one
after the other (they are strictly serializable), the second's `Expect` fails, its group is refused with `conflict`.
`app.Retry` runs the handler again on a conflict (3 times at most); this time it reads `paid` and answers 409. Eight
payments at once give one payment and seven 409 (`isPaidOnceAtTheSameMoment`).

```java
@PostMapping("/{id}/pay") @PreAuthorize("hasRole('accountant')")
InvoiceOut pay(@PathVariable Long id, @AuthenticationPrincipal Principal u) {
  try {
    return tx.run(() -> {
      var inv = own(id, u);
      if (inv.status.equals("paid")) throw new ResponseStatusException(HttpStatus.CONFLICT);
      inv.status = "paid"; inv.paidAt = Instant.now();
      return InvoiceOut.of(invoices.saveAndFlush(inv));   // @Version on the entity: optimistic locking
    });
  } catch (ObjectOptimisticLockingFailureException e) { throw new ResponseStatusException(HttpStatus.CONFLICT); }
}
```

## 3. Who paid it

Every write of a handler carries `by = r.User.Id` and `why = r.Why`, `"POST /invoices/:id/pay #4f2a1c-1794528000"`: the
route and the number of the request, which its line of the log has too. Cepheus keeps every group for good with them,
so "who changed this invoice, and when" is a question to the database, with no table of history to add (Spring adds
Hibernate Envers and a table per entity). Centauri writes its own events beside: sign-ins and their failures,
lockouts, refusals of limits and of other sites, invitations, changes of roles, users disabled; the super-admin reads
them at `GET /admin/events` ([The administration](administration.md)).

## 4. Its tests

```cesia norun
defn isPaidOnce()
  s = office()?
  paid = s.Ada.Call(e.Pay, {id: s.One.Id})?
  again = s.Ada.Call(e.Pay, {id: s.One.Id})
  paid.Status == "paid" and paid.PaidAt == "2026-11-13T00:00:00Z" and again.Error.Status == 409
end
```

With `isPaidOnceAtTheSameMoment`, `isNumberedInOrderAtOnce`, `isEditedWhileNotPaid`, `isDeleteChecked`,
`isLateAndOverdue` in `examples/invoices/tests/invoices.test.ce`.
