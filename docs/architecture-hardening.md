# Architecture hardening

A record of eight structural changes made in one pass, why each was made,
and what it costs. Written for whoever hits one of these decisions later
and wants to know whether it was considered or just happened.

Migrations: `20260830120000_architecture_hardening`,
`20260830130000_soft_cancel_assignments`.

All eight came out of an architecture review of the working app. They are
ordered here by how expensive each would have been to defer, which is the
same order they were tackled in.

---

## 1. Money is `Decimal`, not `Float`

**Was:** `Quote.price` and `PurchaseOrderLineItem.unitPrice` were
`Float` — IEEE 754 doubles. The purchase order total was computed in
JavaScript as `sum + quantity * unitPrice`.

**Problem:** binary floating point cannot represent most decimal
fractions. `0.1 + 0.2` is `0.30000000000000004`. On a forty-line purchase
order that drift becomes cents, and those cents are a real discrepancy
against an invoice the company pays. This was the only issue on the list
that produced visibly wrong numbers on a document sent to a vendor.

**Now:** every price column is `DECIMAL(14,4)` in Postgres and
`Prisma.Decimal` in TypeScript. All arithmetic goes through
`src/modules/shared/money.ts`.

**Decisions worth knowing:**

- **4 decimal places, not 2.** Unit prices are sometimes quoted below a
  cent (`$0.0325` per unit). Totals still present at 2dp.
- **Each line is rounded to cents, then lines are summed** — not summed at
  full precision and rounded once. This matches how an invoice is actually
  totalled; the other order can disagree with a vendor's own arithmetic by
  a cent.
- **Prices stay strings until Zod converts them.** `moneySchema` takes the
  string a form produced and yields a Decimal. Routing through `Number()`
  first would reintroduce exactly the imprecision being avoided, so it is
  never done — this is why `CreateQuoteInput` is `z.input<>` rather than
  `z.infer<>`.
- **`parseMoneyInput` returns `null`, not `0`, for empty input.**
  `Number("")` is `0`, which would silently record an unpriced item as
  free.

---

## 2. A quote prices every line, not one

**Was:** `QuoteRequest` had `items[]` (plural), but `Quote` had
`quoteRequestId @unique` plus a single `materialId`/`equipmentId`/`price`.
A five-item request could only ever record one price, and the UI worked
around it by asking the dispatcher which item the number was for.

**Problem:** that was a modelling error surfacing as a UI question. Real
vendor quotes price every line they were asked about.

**Now:** `Quote` is the envelope (vendor, expiry, default lead time) and
`QuoteLineItem` holds the prices — one per requested item, each with its
own optional lead time override.

**Comparison changed with it.** `compareQuotesForJob` used to rank every
quote on a job into one list and return "the best", which meant ranking a
concrete quote against a crane rental. Comparison is now **per item**:
for each requested item, the vendor lines that priced it, ranked
independently.

- Ranking is on **unit price**, not extended total — vendors quote
  different pack sizes, and unit price is the only apples-to-apples
  comparison.
- Different vendors can win different items. The old model could not
  express that.
- `bestCaseTotal` is `null` when any item lacks a usable quote. A total
  that quietly omits an unpriced item reads as complete and is not.

**Data migration:** every existing single-price quote was carried across
as a one-line quote, with quantity taken from the matching request line.
No recorded price was lost.

---

## 3. Every row carries `orgId`; privileged actions check a role

**Was:** no model had a tenant column, and `auth()` was called nowhere
outside `middleware.ts`. Any authenticated user could read and mutate
everything, including issuing and cancelling purchase orders. `CLAUDE.md`
justified choosing Clerk partly on its organizations and roles, which were
not used.

**Now:**

- Every tenant-owned table has `orgId`. Uniqueness that used to be global
  (`Job.jobNumber`, `Material.sku`) is per-org.
- **Every repository function takes `orgId` as its first argument.** This
  is verbose on purpose: a query that forgets to scope by tenant does not
  compile. Scoping is enforced by the type system rather than by a runtime
  interceptor, which would be easier to forget and harder to review.
- Writes filter on `{ id, orgId }`, so another tenant's row behaves
  exactly as if it did not exist (P2025 → "not found") rather than being
  updated across the boundary.
- `requireAuthContext()` (`shared/currentUser.ts`) is the single place
  that talks to Clerk. The logic worth testing — org resolution, role
  mapping, what each role may do — lives in `shared/authContext.ts` and is
  pure. Same split as `vendors/resend.ts`.
- Admin-only actions: issuing a PO, cancelling a job, adjusting stock by
  hand. Everything a dispatcher does all day is ungated.

**The honest caveat.** Clerk Organizations is not enabled on this
instance, so `resolveOrgId` falls back to `org_default` (the value the
migration backfilled) and `resolveRole` returns `admin` for everyone. Role
enforcement is therefore inert *today*. That is deliberate: the
alternative is that a fresh install has nobody able to issue a purchase
order. The point of writing it now is that turning Organizations on
becomes a configuration change plus a backfill, not a ten-table migration.

`DEFAULT_ORG_ID` in `authContext.ts` **must** stay in sync with the value
in the migration. Changing one without the other makes existing data
invisible to the app.

---

## 4. One write path: Server Actions

**Was:** 18 REST route handlers under `src/app/api/` *and* Server Actions,
both calling the same repositories.

**Problem:** double the surface for auth, validation and revalidation,
with only one path exercised by the UI and zero tests over the REST layer.
`GET /api/purchase-orders` had grown two unrelated meanings behind query
params (`?poNumber=` returned a PO, `?jobId=` returned a best quote).

**Now:** the CRUD routes are deleted. `/api/health` remains — it is the
unauthenticated uptime probe the middleware explicitly allows.
`shared/apiError.ts` went with them; `classifyError` in
`shared/errorClassification.ts` is shared by every Server Action and is
now tested directly.

**If an external consumer ever needs an API**, generate it from the same
Zod schemas rather than hand-writing a second path. The old routes are in
git history.

---

## 5. PO numbers come from a Postgres sequence

**Was:** a `PurchaseOrderSequence` table with one counter row, incremented
inside a transaction.

**Problem:** the row had to be seeded before the first PO could ever be
created — a missing seed threw `P2025`, which needed its own script, its
own npm command, and a paragraph in `CLAUDE.md` warning about it. It also
serialized every concurrent PO insert behind a single row lock.

**Now:** `CREATE SEQUENCE purchase_order_number_seq`, read with
`nextval()`. No seeding, no lock, no setup step. `prisma/seed.ts` and
`npm run prisma:seed` are gone.

**The tradeoff, accepted deliberately:** `nextval()` is not rolled back by
a failed transaction, so a PO whose insert fails burns its number. Gaps
were already expected and are harmless — a dispatcher needs PO numbers to
be unique and stable, never contiguous. The old version could roll a
number back; that was the one thing it did better, and it is not worth the
seed row.

The sequence starts one past the highest number ever issued, so no
existing PO number can be reused.

---

## 6. A stock ledger, not a bare counter

**Was:** `Material.quantityOnHand` mutated in place with
`increment`/`decrement`. Nothing recorded why. `adjustMaterialQuantity`
already took a `reason` "for an audit trail" — it was validated and then
thrown away.

**Problem:** "we are forty bags short and nobody knows where they went" is
exactly the question a procurement system should answer, and an in-place
counter cannot.

**Now:** `StockMovement` is an append-only ledger — opening balances,
assignments, cancellations, adjustments, receipts — with the reason, an
optional link to the causing assignment, and the Clerk user who triggered
it. `quantityOnHand` remains as a cached rollup so listing materials does
not need an aggregate per row.

**The invariant:** `applyStockDelta` is the only way `quantityOnHand`
changes, and it writes the movement and the rollup in one transaction. If
you find `quantityOnHand: { increment }` anywhere else, that is the bug.
`updateMaterialSchema` no longer accepts the field at all.

`recomputeQuantityOnHand` and `findLedgerDiscrepancies` are the repair and
audit tools. If the sweep ever returns rows, something bypassed
`applyStockDelta`.

**Consequence: assignments are now soft-cancelled.** Deleting an
assignment severed `StockMovement.assignmentId` (`ON DELETE SET NULL`), so
cancelling destroyed the link between returned stock and the assignment it
came from. `cancelAssignment` sets `cancelledAt` instead and writes a
compensating `ASSIGNMENT_CANCELLED` movement; the original `ASSIGNMENT`
row is left untouched, because the ledger records what happened rather
than a tidied-up version. Cancelling is idempotent — a double-submitted
cancel must not return the stock twice.

---

## 7. Polymorphic FK invariants live in the database

**Was:** `Assignment`, `QuoteRequestItem`, `Quote` and
`PurchaseOrderLineItem` each carried nullable `materialId`/`equipmentId`
(plus `personnelId`) where exactly one must be set. The rule lived only in
Zod, with a comment saying it was "enforced in application code".

**Problem:** any path that skipped validation could write a row with none
or both. `cancelAssignment` carried a defensive throw for precisely the
state a constraint would prevent.

**Now:** hand-written `CHECK` constraints in the migration. Prisma cannot
express them, so they are listed in comments on each model in
`schema.prisma` — **that file is not the whole schema; read the
migrations.**

Also constrained: assignment quantity must match resource type (personnel
carry none, materials and equipment carry a positive one), assignment
windows must be ordered, and quantities and prices on every line-item
table must be positive/non-negative.

**Verified:** `prisma migrate diff` reports zero drift after these were
added, so Prisma does not try to drop constraints it does not model.

---

## 8. Double-booking is prevented by an exclusion constraint

**Was:** a Serializable transaction wrapping a `findMany` of **every**
assignment a resource had ever had, an overlap check in JavaScript, and a
bounded retry loop on `P2034` serialization failures.

**Problem:** correct, but it read the resource's entire history on every
booking and grew slower and more contended as history accumulated. The
retry loop existed only to paper over the isolation level it had chosen.

**Now:** GiST `EXCLUDE` constraints (via `btree_gist`) on `Assignment` for
personnel and equipment, over
`tsrange(startAt, COALESCE(endAt, 'infinity'), '[)')`. Postgres refuses
overlapping bookings in an index. No Serializable, no retry loop, no
full-history scan.

The application keeps a **bounded** overlap query — only assignments near
the candidate window — purely so the common case produces a message naming
the job the resource is already on. That check is explicitly not the
guarantee; when it loses a race, the constraint fires and the violation is
translated back into a `SchedulingConflictError`.

**Details:**

- `'[)'` is half-open, so a booking may start exactly when the previous
  one ends — a crew finishing at noon on one site can start at noon on
  another.
- An open-ended assignment extends to `'infinity'`, matching how
  `availability.ts` treats a null `endAt`.
- The constraint predicate skips cancelled rows, so cancelling frees the
  slot (see #6).

---

## How Prisma surfaces a constraint violation

Worth recording, because it was determined by probing the live database
rather than from documentation. Prisma 7 with `@prisma/adapter-pg` reports
a raw Postgres constraint failure as:

```
code: "P2039"
meta.driverAdapterError.cause.code    // SQLSTATE, e.g. "23P01" / "23514"
meta.driverAdapterError.cause.message // includes: constraint "<name>"
```

`shared/errorClassification.ts` reads that shape defensively and maps
known constraint names to messages a dispatcher can act on. An unknown
constraint still classifies as a business error ("that change was
rejected because it would break a data rule") rather than a 500. If a
future Prisma version reshapes `meta`, the reader degrades to "internal
error" instead of throwing inside the error handler.

---

## Smaller changes made in the same pass

- **Module barrel files deleted.** All six `index.ts` files were dead —
  every one of ~100 imports used a deep path. They documented a public
  surface nothing used.
- **`sendQuoteRequest` reads through the repository.** It was the only
  place in the codebase that reached past its own module's data-access
  layer to touch Prisma directly.
- **Job numbers stay dispatcher-supplied** — unlike PO numbers, they
  usually arrive from the client or accounting system and must match
  paperwork this app does not own. A `DuplicateJobNumberError` pre-check
  now names the conflicting job instead of surfacing a bare unique
  violation. The index is still the guarantee.
- **Stale "NOT VERIFIED / network-blocked sandbox" headers removed** from
  the repository files. They were written when Prisma Client could not be
  generated; it can now, and the code is covered by tests against a real
  database. Stale warnings train people to ignore real ones.
- **Stock history is shown on the material detail page.** A ledger nobody
  can read does not answer anyone's question.

## Testing

`npm test` — 229 unit tests, no database required.

`npm run test:integration` — 11 tests against a real Postgres. These
cover what the unit tests structurally cannot: that the EXCLUDE
constraints are real and that `nextval()` is atomic under concurrency,
including a three-way simultaneous booking race where exactly one insert
must survive.
