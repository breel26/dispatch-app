# Dispatch

Construction job dispatching: create jobs, assign personnel, materials and
equipment, request vendor quotes by email, compare pricing, generate
purchase orders, and order to the job site.

Built on a "data as code" philosophy — schemas and business rules live in
versioned code, not spreadsheets or manual database edits.

## Stack

Next.js (App Router, Server Components + Server Actions) · TypeScript ·
PostgreSQL · Prisma 7 · Clerk (auth) · Resend (vendor email) · Zod ·
ExcelJS · Vitest

## Getting started

```bash
npm install
```

Copy `.env.example` to `.env` and fill in the database, Clerk and Resend
values.

```bash
npx prisma migrate deploy && npx prisma generate
```

No seed step is required — PO numbers come from a Postgres sequence, so a
freshly migrated database is immediately usable.

```bash
npm run dev
```

Then open http://localhost:3000.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests — no database needed |
| `npm run test:integration` | Tests against a real Postgres (DB constraints, PO-number concurrency) |
| `npm run lint` | Lint |
| `npm run typecheck` | TypeScript check |
| `npx prisma migrate dev` | Create and apply a new migration |
| `npx prisma studio` | Browse the database |

Run tests, lint and typecheck before calling a change done. CI
(`.github/workflows/ci.yml`) runs all of it on every push, including the
integration suite against a Postgres service container and a check that
`schema.prisma` still matches the migrations.

## How it is organised

Code is grouped by domain rather than by technical layer, so a new feature
lands in one module instead of touching every folder:

```
src/modules/
  jobs/         job CRUD, status lifecycle
  dispatch/     assignment logic, scheduling conflicts
  vendors/      vendor directory, email
  procurement/  quote comparison, PO generation
  inventory/    materials, equipment, stock ledger
  import-export/ DB <-> JSON <-> Excel
  shared/       Prisma client, money, auth context, error classification
src/app/        routes, pages, Server Actions
prisma/         schema and migrations
```

Each module owns its own types, business logic and tests.

## Conventions worth knowing before you write code

- **Money is `Decimal`, never `number`.** All price arithmetic goes
  through `modules/shared/money.ts`. Prices stay strings from the form
  until Zod converts them.
- **Every tenant-owned row carries `orgId`**, and every repository
  function takes it as its first argument — so a query that forgets to
  scope by tenant does not compile.
- **`prisma/schema.prisma` is not the whole schema.** CHECK and EXCLUDE
  constraints that Prisma cannot express live in the migration SQL, and
  they are what actually prevent double-booking and malformed line items.
- **Stock changes go through the ledger.** `applyStockDelta` is the only
  thing that may change `Material.quantityOnHand`.
- **The UI talks to Server Actions.** There is no REST CRUD layer.

`docs/architecture-hardening.md` explains why each of these is the way it
is, including the tradeoffs that were accepted. `CLAUDE.md` carries the
working conventions for the repo.
