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
- Import/export: xlsx (SheetJS) for Excel, routed through validated JSON

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

## Core entities
- **Job** — site, status, timeline, requirements
- **Personnel** — workers, roles, certifications, availability
- **Material** — SKU, unit, quantity on hand, current sourcing
- **Equipment** — type, availability, current location/assignment
- **Vendor** — contact info, email, categories supplied, price history
- **QuoteRequest** — vendor, item(s), sent date, status
- **Quote** — vendor, item, price, lead time, expiration
- **PurchaseOrder** — PO number, vendor, line items, status, linked job
- **Assignment** — links personnel/material/equipment → job, with scheduling

PO numbers are generated from a DB sequence (atomic under concurrency) —
never app-side `count + 1` logic, which breaks when two dispatchers act
at the same time.

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
- `shared` — types, PO number generation, email templates

Each module owns its own types, business logic, and tests. Cross-module
calls go through clear exported functions — avoid modules reaching into
each other's internals.

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
[Expand as the project takes shape: folder structure, auth flow, email
template locations, deployment target.]
