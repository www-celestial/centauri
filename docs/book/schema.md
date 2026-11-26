# Change the schema without a stop

The task: the clients get a country; the clients made before it existed get "FR", once, whether one process starts
the new version or ten at the same moment, and while the old version still serves; and the app says clearly what it
can't change yet. The code is `src/app/migrate.ce`, its tests `tests/migrate.test.ce`; the invoices' change is
`Countries` in `examples/invoices/src/invoices/module.ce`, checked by `isSchemaChangedWithoutAStop`.

What it uses: fields added to a kind (no migration), `app.Migration`, `app.Fill`, the way of *expand, then contract*,
and what waits for Cepheus's proposal A2.

## 1. What needs no migration

A field or a kind added is declared by Cepheus at the start (`Connect` declares what is missing): nothing to write.

```
Client = app.Kind("client", {Tenant: cepheus.Link(), Name: cepheus.Text(), ..., City: cepheus.Text(), Overdue: cepheus.Bool(), Country: cepheus.Text()})
ClientIn = check.Record({Name: check.Text(1, 120), Email: check.Email(), City: check.Text(0, 80, optional = true, default = ""),
  Country: check.Text(2, 2, optional = true, default = "FR")})
```

The contract takes the new field as optional, with a default: a page of the old version, which doesn't send it, still
works (*never break user space*; `apptest.Surface` says when a change would break a client).

## 2. A migration: the data that moves

```
Countries = app.Migration("2026-11-26 clients get a country", app.Fill(Client, "Country", c -> "FR"))
Module = app.Module("invoices", ..., migrations = [Countries])
```

- A migration has a name, unique and never reused, and a run, `run(env)`, an `Ok` or an `Err`.
- They run before the app serves, in the order of the modules and of their lists, **each once**: the first process
  writes its fact (`centauri_migration`, its name unique) and runs it, the others wait for its fact `done`; a process
  that dies in its middle leaves it to the next once its lease passes (60 s, renewed while it runs); one that fails
  stops the start, with its error, and runs again at the next start (`isOnceAcrossProcesses`,
  `isTakenAgainAfterItsLease`, `isFailedThenRunAgain`).
- `app.Fill(kind, field, f)` gives the field to each thing that lacks it, `f(thing)` its value, 500 things a group, each
  only if it still lacks it (`Expect`): a client written meanwhile by the new version keeps its own country
  (`isFilledWithoutOverwriting`). Run again, it fills what is left: it bears being run twice.
- `apptest.Start` runs them too, so the tests of an app run on its migrated schema.

```java
// Spring Boot: Flyway, a file of SQL a version, its table flyway_schema_history, a lock of the database while it
// runs; the same expand and contract by hand, as every database without downtime asks
-- V7__clients_country.sql
ALTER TABLE client ADD COLUMN country varchar(2);
UPDATE client SET country = 'FR' WHERE country IS NULL;   -- one transaction over the whole table: batches by hand for a big one
```

## 3. Without a stop: expand, then contract

A version that changes the schema runs beside the old one for a moment (the workers of `cesia run --workers` are
replaced one by one after a `HUP`, or the servers one by one behind the load balancer). So a change goes in steps, each
a version that works with the one before:

1. **Expand**: add the new field; the new version writes it, reads it if it is there, and takes a default when it is
   not; a migration fills the old things.
2. Move the readers to the new field: every version that runs now reads it.
3. **Contract**: stop writing the old field. Its facts stay in the history of Cepheus.

## 4. What waits for Cepheus's A2

Renaming a field, changing its type, taking it away: that is Cepheus's proposal A2 (`Rename`, `Migrate`, `Drop`),
which is not built. Centauri says so, and stops the start with the way that works without it:

```
app.Rename(Client, "City", "Town")    (* a migration that stops the start: needs A2; add Town, fill it (app.Fill), read it, stop writing City *)
app.Retype(Client, "City", "int")
app.Drop(Client, "City")
```

A kind declared with a field of another type than the database's (`Text` become `Int`, or a field become `unique`) is
refused by Cepheus at the start (`declared already as another kind of property`); Centauri adds what it means and what
to do (`isWhatNeedsA2Refused`). When A2 comes, these three will run the change, and the apps that wrote them will not
change a line.

Next: [Sign in with Google](google.md).
