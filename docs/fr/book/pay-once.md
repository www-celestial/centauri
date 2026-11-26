# Payer une facture une seule fois

La tâche : un comptable crée une facture avec ses lignes, numérotée à la suite de la dernière de son cabinet, sans trou
(comme le demande la loi de nombreux pays), et la paie. Un second paiement, même au même moment depuis une autre page,
est refusé. Et plus tard, n'importe qui peut retrouver qui l'a payée, et depuis quelle requête. Le code est dans
`examples/invoices/src/invoices/invoices.ce`.

Ce qu'il utilise : un groupe d'écritures, tout ou rien (`cepheus.Write`) ; `Expect`, une écriture qui n'a lieu que si
rien n'a changé depuis la lecture ; `app.Next`, des numéros sans trou ; `app.Retry` ; `by` et `why` sur chaque
écriture, et les événements de Centauri.

## 1. Une facture et ses lignes, en un seul groupe

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

- `cepheus.New(1)` est la facture que le groupe crée, ses lignes `New(2)`, `New(3)`... ;
  `app.Facts(kind, thing, fields)` rend le `Add` de chaque champ. Le groupe est tout ou rien : pas de facture sans ses
  lignes, pas de ligne sans sa facture.
- `app.Next("invoice", [inv, Invoice.Number], r)` rend le `Incr` du compteur du cabinet : une chose (*thing* dans le
  code) du kind `centauri_counter` de Centauri, créée à sa première utilisation (un kind est une sorte de chose dans la
  base de données, comme les factures ou les clients). Cet `Incr` écrit le numéro suivant dans la facture **dans le
  même groupe**. Les numéros se suivent donc sans trou, et 20 factures créées en même temps reçoivent les numéros 1 à
  20, chacun une fois, sans s'attendre l'une l'autre ni recommencer (`isNumberedInOrderAtOnce`).
- Le client est lu par `app.Own` : une facture pour le client d'un autre cabinet est un 404 (le code HTTP
  « introuvable »).
- La règle `NoInvoiceOfDeleted` des kinds (un `cepheus.Never` : un cas que la base refuse à chaque écriture) refuse une
  facture pour un client supprimé entre-temps, quel que soit l'ordre des deux requêtes. Le handler (la fonction qui
  répond à une requête) change son `invalid` en 409 (le code « conflit »).

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

## 2. Payée une seule fois

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

Aucune transaction (une suite de lectures et d'écritures que la base tient ouverte et traite comme une seule) n'est
ouverte entre la lecture et l'écriture : le handler lit, décide, et écrit avec `Expect`, « seulement si le statut est
encore celui que j'ai lu ». Deux paiements en même temps : les deux lisent `unpaid`, et Cepheus applique les groupes
l'un après l'autre (ils sont strictement sérialisables : tout se passe comme s'ils passaient un par un, dans un ordre
qui respecte le temps réel). L'`Expect` du second échoue, et son groupe est refusé avec `conflict`. `app.Retry` relance
le handler sur un conflit (3 fois au plus) ; cette fois, il lit `paid` et répond un 409. Huit paiements en même temps
donnent un paiement et sept 409 (`isPaidOnceAtTheSameMoment`).

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

## 3. Qui l'a payée

Chaque écriture d'un handler porte `by = r.User.Id` et `why = r.Why`, `"POST /invoices/:id/pay #4f2a1c-1794528000"` :
la route (un endpoint, une adresse de l'API avec sa méthode HTTP, et la fonction qui y répond) et le numéro de la
requête, que sa ligne du log (le journal où le serveur écrit chaque requête) a aussi. Cepheus garde chaque groupe pour
toujours avec eux. « Qui a changé cette facture, et quand » est donc une question à la base, sans table d'historique à
ajouter (Spring ajoute Hibernate Envers et une table par entité). Centauri écrit ses propres événements à côté : les
connexions et leurs échecs, les blocages (les attentes imposées à un login après des échecs), les refus des limites (le
nombre de requêtes permis dans un temps donné) et des autres sites, les invitations, les changements de rôles, les
utilisateurs désactivés. Le super-admin (l'administrateur de toute la plateforme, au-dessus des tenants,
les clients de la plateforme comme les cabinets) les lit à `GET /admin/events` ([L'administration](administration.md)).

## 4. Ses tests

```cesia norun
defn isPaidOnce()
  s = office()?
  paid = s.Ada.Call(e.Pay, {id: s.One.Id})?
  again = s.Ada.Call(e.Pay, {id: s.One.Id})
  paid.Status == "paid" and paid.PaidAt == "2026-11-13T00:00:00Z" and again.Error.Status == 409
end
```

Avec `isPaidOnceAtTheSameMoment`, `isNumberedInOrderAtOnce`, `isEditedWhileNotPaid`, `isDeleteChecked`,
`isLateAndOverdue` dans `examples/invoices/tests/invoices.test.ce`.
