# What the admin pages (L2) need from Ceres

The L1 endpoints are in `src/api/platform.ce` (`AdminOfApp`, `AdminOfAccounts`); every one is a contract that a page
reads as it is, so the admin is pages of Ceres that call `api.Call(endpoint, input, p)`. What those pages need:

1. **A table bound to a page endpoint** (`out = api.Page(Row, 50)`): columns from the Row's shape (`check.Record`
   fields, their kind: text, number, time, bool, id), a "next" button that sends `After` (the cursor is opaque: the page
   never reads it), filters from the endpoint's query shape (a text input per `check.Text`, a select per
   `check.OneOf`, a checkbox per `check.Bool`), sorting left to the server. Used by users, tenants, events, data.
2. **A form from a body shape** (`form.New(api.AdminSuper.In)`): the same checks as the server while one types, the
   field errors of a 422 (`Problem.errors`, keyed by the field's path, as `Lines.2.Qty`) shown beside the fields.
3. **A detail view** of a record shape with nested lists (`AdminUser`: user, tenants with roles, sessions).
4. **Actions with a confirmation** (disable, sign out everywhere, roles): POSTs that answer 204, then reload the view.
5. **Times**: `check.Time` fields come as ISO 8601 UTC (`2026-11-13T00:00:00Z`); show them in the viewer's zone.
6. **Problem Details everywhere**: status, `detail` as the message, `instance` (the request's number, to quote to
   support), `retry` on a 429.
7. **Charts** of `/admin/metrics` rows (name, labels, value) and `/admin/stats` (counts), refreshed every few seconds,
   until L2's live link pushes them (a `Watch` of the events, `api.Live`).
8. **The 31-bit risk**: ids are Cepheus ids (from 65,536, 63 bits); a page in WebAssembly holds 2^30 - 1. `check.Id()`
   refuses past it in the page with a message; when Ceres widens its integers, the admin follows.
9. **No token in the page**: the session is the `__Host-sid` cookie; a page of another origin gets nothing.

What L2 adds on the server for them: the live link (`api.Live`) for events and metrics; the history of a thing from
Cepheus (who changed it, with `by` and `why`), once Cepheus's Cesia package reads its history; settings changed without
a restart (flags, L3).
