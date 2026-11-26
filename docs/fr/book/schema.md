# Changer le schéma sans rien arrêter

La tâche : les clients reçoivent un pays. Les clients créés avant qu'il existe reçoivent « FR », une seule fois,
qu'un seul processus démarre la nouvelle version ou dix au même moment, et pendant que l'ancienne version sert encore.
Et l'app (l'application, le serveur et ses pages) dit clairement ce qu'elle ne peut pas encore changer. Le code est
dans `src/app/migrate.ce`, ses tests dans `tests/migrate.test.ce` ; le changement de l'app des factures est
`Countries` dans `examples/invoices/src/invoices/module.ce`, vérifié par `isSchemaChangedWithoutAStop`.

Ce qu'il utilise : des champs ajoutés à un kind (une sorte de chose dans la base de données, comme les factures ou les
clients), sans migration (un programme qui change les données ou leur forme d'une version à l'autre) ;
`app.Migration`, `app.Fill` ; la manière *expand, then contract* (étendre, puis resserrer) ; et ce qui attend la
proposition A2 de Cepheus.

## 1. Ce qui ne demande pas de migration

Un champ ou un kind ajouté est déclaré par Cepheus au démarrage (`Connect` déclare ce qui manque) : rien à écrire.

```cesia norun hide=code
(* For the check of this page: the packages its code uses, and the names it takes from the invoices of
   examples/invoices, unknown here. *)
use deps/www-celestial/centauri/src/app
use deps/www-celestial/cepheus/cesia/cepheus
use std/check
```

```cesia norun
Client = app.Kind("client", {Tenant: cepheus.Link(), Name: cepheus.Text(), (* ... *) City: cepheus.Text(), Overdue: cepheus.Bool(), Country: cepheus.Text()})
ClientIn = check.Record({Name: check.Text(1, 120), Email: check.Email(), City: check.Text(0, 80, optional = true, default = ""),
  Country: check.Text(2, 2, optional = true, default = "FR")})
```

Le contrat prend le nouveau champ comme optionnel, avec une valeur par défaut. (Un contrat dit ce que prend chaque
endpoint, ce qu'il rend et le rôle qu'il demande ; il est lu par le serveur et par les pages. Un endpoint est une
adresse de l'API avec sa méthode HTTP, comme `POST /clients`.) Une page de l'ancienne version, qui ne l'envoie pas,
marche donc toujours (*never break user space* : ne jamais casser ce qui marche chez ceux qui s'en servent ;
`apptest.Surface` dit quand un changement casserait un client, un programme ou une page qui appelle l'API).

## 2. Une migration : les données qui bougent

```cesia norun
Countries = app.Migration("2026-11-26 clients get a country", app.Fill(Client, "Country", c -> "FR"))
Module = app.Module("invoices", (* ... *) migrations = [Countries])
```

- Une migration a un nom, unique et jamais réutilisé, et une exécution, `run(env)`, qui rend un `Ok` ou un `Err`.
- Les migrations tournent avant que l'app serve, dans l'ordre des modules et de leurs listes, **chacune une fois**. Le
  premier processus écrit son fait (`centauri_migration`, son nom unique ; un fait est une donnée de Cepheus, qui dit
  qu'une chose a un champ d'une valeur) et la lance ; les autres attendent son fait `done`. Un processus qui meurt en
  plein milieu la laisse au suivant, une fois son lease passé (un bail : le temps pendant lequel la migration reste à
  lui ; 60 s, renouvelé tant qu'elle tourne). Une migration qui échoue arrête le démarrage, avec son erreur, et tourne
  de nouveau au démarrage suivant (`isOnceAcrossProcesses`, `isTakenAgainAfterItsLease`, `isFailedThenRunAgain`).
- `app.Fill(kind, field, f)` donne le champ à chaque chose (*thing* dans le code) qui ne l'a pas, `f(thing)` étant sa
  valeur. Il écrit 500 choses par groupe (un groupe d'écritures, que Cepheus applique en entier ou pas du tout), chacune
  seulement si elle ne l'a toujours pas (`Expect`). Un client écrit entre-temps par la nouvelle version garde donc son
  propre pays (`isFilledWithoutOverwriting`). Relancé, il remplit ce qui reste : il supporte d'être lancé deux fois.
- `apptest.Start` les lance aussi : les tests d'une app tournent donc sur son schéma migré.

```java
// Spring Boot: Flyway, a file of SQL a version, its table flyway_schema_history, a lock of the database while it
// runs; the same expand and contract by hand, as every database without downtime asks
-- V7__clients_country.sql
ALTER TABLE client ADD COLUMN country varchar(2);
UPDATE client SET country = 'FR' WHERE country IS NULL;   -- one transaction over the whole table: batches by hand for a big one
```

## 3. Sans rien arrêter : étendre, puis resserrer

Une version qui change le schéma tourne un moment à côté de l'ancienne. Les workers de `cesia run --workers` (les
processus qui servent la même app) sont remplacés un par un après un `HUP` ; ou bien les serveurs, un par un, derrière
le load balancer (ce qui répartit les requêtes entre les serveurs). Un changement se fait donc par étapes,
chacune une version qui marche avec celle d'avant :

1. **Expand** (étendre) : ajouter le nouveau champ ; la nouvelle version l'écrit, le lit s'il est là, et prend une
   valeur par défaut quand il n'y est pas ; une migration remplit les anciennes choses.
2. Faire passer les lecteurs au nouveau champ : chaque version qui tourne désormais le lit.
3. **Contract** (resserrer) : ne plus écrire l'ancien champ. Ses faits restent dans l'historique de Cepheus.

## 4. Ce qui attend l'A2 de Cepheus

Renommer un champ, changer son type, le retirer : c'est la proposition A2 de Cepheus (`Rename`, `Migrate`, `Drop`),
qui n'est pas construite. Centauri le dit, et arrête le démarrage en donnant la manière qui marche sans elle :

```cesia norun
app.Rename(Client, "City", "Town")    (* a migration that stops the start: needs A2; add Town, fill it (app.Fill), read it, stop writing City *)
app.Retype(Client, "City", "int")
app.Drop(Client, "City")
```

Un kind déclaré avec un champ d'un autre type que celui de la base (`Text` devenu `Int`, ou un champ devenu `unique`)
est refusé par Cepheus au démarrage (`declared already as another kind of property`) ; Centauri ajoute ce que cela veut
dire et ce qu'il faut faire (`isWhatNeedsA2Refused`). Quand A2 viendra, ces trois appels feront le changement, et les
apps qui les ont écrits ne changeront pas une ligne.

Ensuite : [Se connecter avec Google](google.md).
