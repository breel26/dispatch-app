# Project: Construction Dispatching Software

A web app for construction job dispatching: create jobs, assign personnel/
materials/equipment, request vendor quotes by email, compare pricing,
generate purchase orders, and order materials/equipment to the job site.
Built with a "data as code" philosophy — schemas and business rules live
in versioned code, not ad-hoc spreadsheets or manual DB edits.

## Stack
- Language: TypeScript
- Framework: Next.js
- Database: PostgreSQL
- ORM: Prisma (schema-as-code — every data model change is a migration
  committed to git). Chosen over Drizzle for lower bug risk: declarative
  schema syntax, auto-generated types guaranteed to match the DB, and a
  more foolproof migration workflow (`prisma migrate dev`).
- Email: Resend (transactional vendor emails)
- Auth: Clerk. Chosen over Auth.js for lower bug risk: Clerk handles
  password hashing, session management, and MFA internally behind a
  well-documented SDK, rather than requiring hand-wired session/callback
  logic. Free tier (50,000 monthly retained users) comfortably covers an
  internal multi-user tool. Also provides built-in roles/organizations for
  dispatcher vs. admin permissions.
- Validation: Zod
- Import/export: ExcelJS (`exceljs`) for Excel, routed through validated
  JSON. Note: ExcelJS's bundled types pull in an old `@types/node` whose
  `Buffer` predates the generic `Buffer<T>`, so passing a real Buffer to
  `workbook.xlsx.load()` needs a narrow cast — see the comment in
  `src/modules/import-export/excel/importMaterials.ts`.

## Commands
Fill in once the project is scaffolded — this file is read at the start of
every session, so stale commands waste turns.

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm test` — run the test suite
- `npm run test:watch` — run tests in watch mode
- `npm run lint` — lint check
- `npm run typecheck` — TypeScript type check
- `npx prisma migrate dev` — run a new DB migration
- `npx prisma studio` — open Prisma's local DB browser GUI
- `npm run test:integration` — tests that need a real Postgres (DB-level
  constraints, PO-number concurrency). Not part of `npm test`.

There is no seed step. PO numbers come from a Postgres sequence, which
needs no seeding — a fresh database is usable straight after
`prisma migrate deploy`.

Note on Prisma 7: the database URL lives in `prisma.config.ts` at the
project root, NOT in `prisma/schema.prisma`'s datasource block (that
was the pattern through Prisma 6; Prisma 7 removed it and throws P1012
if you try). `prisma.config.ts` requires the `dotenv` package as a
dependency. This tripped us up once already — don't reintroduce a `url =
env("DATABASE_URL")` line in schema.prisma.

Also on Prisma 7: `prisma.config.ts`'s `datasource.url` only covers the
CLI (`prisma generate`, `migrate dev`, etc.) — it does NOT make
`new PrismaClient()` work at runtime. Prisma 7 requires an explicit
driver adapter passed to the `PrismaClient` constructor
(`@prisma/adapter-pg` + `pg` for Postgres), or it throws
`PrismaClientInitializationError` the first time a query runs — which
only surfaces at build/runtime, not from `prisma generate`. See
`src/modules/shared/prisma.ts` for the pattern; any script that
constructs its own `PrismaClient` (e.g. integration tests) needs the
same adapter wiring.

**`prisma/schema.prisma` is not the whole schema.** Prisma cannot express
CHECK or EXCLUDE constraints, so several invariants live only in
hand-written migration SQL and are listed in comments on the models that
carry them. Read `prisma/migrations/` before assuming what the database
will accept. (Verified: `prisma migrate diff` reports zero drift with
those constraints in place — Prisma leaves constraints it does not model
alone.)

## Core entities
- **Job** — site, status, timeline, requirements
- **Personnel** — workers, employee id, craft (trade), classification
  (journeyman or apprentice), certifications, availability. Craft and
  classification are Postgres enums, both required; they replaced a
  free-text `role` field that had been carrying both facts at once
  ("JM Carpenter"). The values and their display labels live in
  `modules/inventory/craft.ts`, which is the single source for both the
  Zod enums and the dropdowns — add a trade there and nowhere else.
  `employeeId` is dispatcher-supplied and unique per org, stored
  zero-padded to at least six digits; `modules/inventory/employeeId.ts`
  normalizes input the way `poNumber.ts` does for POs, so "1" and "000001"
  can never become two different workers.
- **Material** — SKU, unit, quantity on hand, current sourcing
- **Equipment** — type, availability, current location/assignment
- **Vendor** — contact info, email, categories supplied, price history
- **QuoteRequest** — vendor, item(s), sent date, status
- **Quote** — a vendor's response to one request: the envelope (expiry,
  default lead time). The prices live in **QuoteLineItem**, one per
  requested item. A quote prices every line it was asked about; it is not
  a single number.
- **PurchaseOrder** — PO number, vendor, line items, status, linked job
- **Assignment** — links personnel/material/equipment → job, with
  scheduling. Cancelled by setting `cancelledAt`, never deleted.
- **StockMovement** — append-only ledger of why material stock changed.
  `Material.quantityOnHand` is a cached rollup of it.

PO numbers come from the `purchase_order_number_seq` Postgres sequence
(atomic under concurrency) — never app-side `count + 1` logic, which
breaks when two dispatchers act at the same time. Gaps are expected and
harmless: `nextval()` is not rolled back by a failed transaction.

## Module boundaries
Organized by domain, not technical layer, so new features slot in without
touching unrelated modules:

- `jobs` — job CRUD, status lifecycle
- `dispatch` — assignment logic, scheduling/conflict detection
- `vendors` — vendor directory, email communication
- `procurement` — quote comparison, PO generation, ordering
- `inventory` — materials/equipment tracking, availability
- `import-export` — shared DB ↔ JSON ↔ (Excel/CSV/etc.) conversion, used
  by any module that needs it
- `shared` — Prisma client, money, auth context, error classification

Each module owns its own types, business logic, and tests. Cross-module
calls go through clear exported functions — avoid modules reaching into
each other's internals. There are no barrel `index.ts` files; import the
specific file (`@/modules/jobs/repository`), which is what every call
site already did.

## Import/export pattern
Excel and other file formats are never touched directly by business logic.
The flow is always:

**Export:** DB row → typed JS object → format-specific serializer (xlsx, csv, etc.)
**Import:** uploaded file → parsed JS object → **Zod validation** → DB write (only if valid)

- Validation happens at the JSON/object stage, before anything reaches the
  database. Reject bad data with a clear error — never write partially
  valid or guessed-at data.
- No intermediate files written to disk — data passes through as in-memory
  objects, not literal JSON files, to avoid temp-file cleanup and leakage
  of sensitive data.
- New export formats (PDF report, CSV, another system's API) should reuse
  the same DB ↔ JS object layer — only the final serializer changes.

## Truthfulness & verification
- Never state that code works, a bug is fixed, or a test passes without
  actually running it and seeing the result.
- If unsure whether an API, library method, or syntax is correct, say so
  explicitly and check docs or run it — don't guess silently.
- If something can't be verified in this environment, say that plainly
  instead of assuming it's fine.
- Flag assumptions out loud, especially about under-specified requirements.

## Git workflow
- Work on a feature branch, not directly on `main`, beyond trivial fixes.
- Commit locally before starting any large or risky change (new feature,
  multi-file refactor, dependency/schema change) so there's a clean
  rollback point.
- Push to the remote at logical checkpoints: after a feature works and
  tests pass, not mid-change.
- Clear commit messages: what changed and why.
- Never force-push over shared branch history.
- Database migrations are committed like any other code — the migration
  history in git is the source of truth for schema evolution.

## Testing
- Every new function or component with non-trivial logic gets a test.
- Concurrency-sensitive logic (assignments, PO number generation, quote
  comparisons) needs tests that specifically check for race conditions,
  not just the happy path.
- Import/export logic gets tests with both valid and deliberately invalid
  fixtures (malformed spreadsheet, missing required field, wrong type).
- Run the test suite after every meaningful change, not just at the end
  of a session.
- Tests that need a real database live in `*.integration.test.ts` and run
  under `npm run test:integration`, separate from `npm test`. Put a test
  there when it proves something only Postgres can (a CHECK or EXCLUDE
  constraint firing, sequence atomicity) — and keep the fast unit test of
  the surrounding logic too; they prove different things.
- CI (`.github/workflows/ci.yml`) runs both suites on every push: unit
  tests, typecheck, lint and build in one job; migrations, a schema-drift
  check and the integration suite against a real Postgres service
  container in the other. A change that only passes locally is not done.
- Before saying a task is complete: run tests, linter, and typechecker.
  All three, every time.
- If a test fails, fix the root cause — don't loosen an assertion to make
  it pass unless the test itself was wrong (say so explicitly if so).

## Code style
- Comment non-obvious logic: the *why*, not a restatement of the code.
- Prefer clear, readable code over clever one-liners.
- Keep functions small and single-purpose.
- Match existing naming/formatting conventions rather than introducing a
  new style mid-project.

## Scope discipline
- Make the smallest change that correctly solves the stated problem.
- If a fix reveals a larger issue, flag it rather than silently expanding
  the change — ask before doing an unrequested refactor.

## Architecture notes

Four conventions run through the codebase. Breaking one is usually a bug,
so they are worth knowing before writing anything.

**Money is `Decimal`, never `number`.** Every price column is
`DECIMAL(14,4)`; all arithmetic goes through `modules/shared/money.ts`.
Prices stay strings from the form until Zod converts them — passing one
through `Number()` reintroduces the float error the Decimal columns exist
to prevent. Line totals round to cents individually, then sum, which is
how an invoice is totalled.

**Every tenant-owned row carries `orgId`, and every repository function
takes it as its first argument.** It is verbose deliberately: a query that
forgets to scope by tenant is a compile error, not a data leak. Writes
filter on `{ id, orgId }` so another org's row reads as "not found".
Server Actions get it from `requireAuthContext()`, which is the single
place that calls Clerk. Note the current install runs single-org
(`DEFAULT_ORG_ID`) with everyone an admin, because Clerk Organizations is
not enabled — see `docs/architecture-hardening.md` §3.

**Invariants the database can enforce live in the database.** CHECK
constraints for the "exactly one resource FK" rule, EXCLUDE constraints
that make double-booking impossible. Application-level checks that
duplicate them exist only to produce a friendlier error first — they are
not the guarantee, and are not written as though they were.

**Stock changes go through the ledger.** `applyStockDelta` is the only
thing that may touch `Material.quantityOnHand`, and it writes the movement
row and the rollup in one transaction.

**One write path.** The UI talks to Server Actions; there is no REST CRUD
layer (only `/api/health`). If an external consumer ever needs an API,
generate it from the same Zod schemas rather than hand-writing a second
path that has to be kept in sync.

Server Components read through repositories directly; mutations go through
Server Actions in `actions.ts` beside the routes that use them. Styling is
CSS Modules. `requireAuthContext()` goes *inside* an action's try/catch
(so a signed-out caller gets an inline message) and `redirect()` stays
*outside* it (Next signals navigation by throwing).

The full rationale for the current structure, including the tradeoffs
accepted and rejected, is in `docs/architecture-hardening.md`.
