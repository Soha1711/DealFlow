# DealFlow360

Intelligent sales operations platform for the modern B2B team — quotations, discount
governance, fulfillment, billing and deal health.

**Phase 1** ships the foundation: Next.js + TypeScript application shell, Auth.js
authentication, role-based access control (RBAC), and the PostgreSQL + Prisma data
layer (users, customers, products, discount tiers, warehouses, inventory and
subscription plans). Future module functionality (quotation engine, approval
workflow, warehouse allocation, billing, deal health, etc.) is intentionally not
implemented yet and is represented by placeholder routes.

## Repository layout

| Path           | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `frontend/`    | Next.js 16 + TypeScript web application (all app code)         |
| `backend/`     | Reserved for the future API service (not implemented)          |
| `ai/`          | Reserved for future AI/recommendation services (not implemented) |
| `database/`    | Prisma schema and migrations (`database/prisma/`)              |
| `tests/`       | Reserved for future automated tests (not implemented)          |
| `docs/`        | Reserved for project documentation                             |

## Prerequisites

- Node.js 20+ and npm
- Docker (for the local PostgreSQL database)

## Local setup

### 1. Start PostgreSQL

The repository includes a `docker-compose.yml` that runs PostgreSQL 16:

```bash
docker compose up -d
```

This starts the `dealflow360-postgres` container exposing PostgreSQL on host port
`5433` (database `dealflow360`, user `postgres`, password `postgres`).

### 2. Install dependencies

```bash
cd frontend
npm install
```

### 3. Configure environment variables

Copy the template and fill in real values. No real secrets are committed.

```
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Required variables (see `frontend/.env.example`):

| Variable           | Example value                                                      |
| ------------------ | ------------------------------------------------------------------ |
| `DATABASE_URL`     | `postgresql://postgres:postgres@localhost:5433/dealflow360`        |
| `AUTH_SECRET`      | A strong random 64-character secret (keep it private)              |
| `AUTH_TRUST_HOST`  | `true` for local development                                       |
| `AUTH_URL`         | `http://localhost:3000`                                            |

Generate a random `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Windows PowerShell:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 4. Create the database schema

The Prisma schema points at `../database/prisma/schema.prisma`, so all Prisma
commands run from the `frontend` directory:

```bash
cd frontend
npm run db:migrate
```

This applies the migration at `database/prisma/migrations/`.

### 5. Seed demo data

```bash
cd frontend
npm run db:seed
```

### 6. Start the development server

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other useful commands

| Command                 | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `npm run db:push`       | Push schema changes without a migration        |
| `npm run db:generate`   | Regenerate the Prisma client                   |
| `npm run typecheck`     | TypeScript type check (`tsc --noEmit`)         |
| `npm run lint`          | ESLint                                         |
| `npm run build`         | Production build                               |
| `npm run start`         | Serve the production build                     |

## Demo accounts

All demo accounts share the same password: **`DealFlow360!`**

| Role              | Email                             |
| ----------------- | --------------------------------- |
| Administrator     | avery.stone@dealflow360.io        |
| Sales Manager     | ravi.patel@dealflow360.io         |
| Sales Rep         | maya.chen@dealflow360.io          |
| Finance           | priya.nair@dealflow360.io         |
| Operations        | diego.ramos@dealflow360.io        |
| Customer          | jordan.lee@dealflow360.io         |

## Phase 6 — Hybrid billing & subscription billing

Phase 6 turns billing into a real backend domain on top of the finalized
quotation lifecycle. A quotation may contain **one-time lines**, **recurring
(subscription) lines**, or **both** (hybrid):

- One-time lines are billed through a `ONE_TIME` invoice that snapshots the
  finalized amounts — later price/discount changes never alter a recorded
  invoice.
- Recurring lines create a `Subscription` (interval from its
  `SubscriptionPlan`: monthly/quarterly/annual), a `BillingSchedule` per
  billing period, and a `RECURRING` invoice per billed period.
- Hybrid billing is atomic: `createBillingFromQuotation` creates the one-time
  invoice, all subscriptions and their first-period schedules/invoices in one
  Prisma transaction, guarded by a `pg_advisory_xact_lock` and DB unique keys
  (`invoice.billingKey`, unique `Subscription.quotationLineId`, unique
  `(subscriptionId, periodStart)`, unique payment `idempotencyKey`).

**Billing is only possible for quotations that cleared governance**
(APPROVED/CONFIRMED/FULFILLING/COMPLETED) — never DRAFT, rejected or
still-pending ones. Only FINANCE and ADMIN may mutate billing; sales reps see
read-only billing for their own quotations, managers see read-only across the
business, OPERATIONS/CUSTOMER have no billing access. All authorization is
enforced server-side.

Full architecture (invoice/subscription/schedule state machines, idempotency
strategy, payment model, RBAC, service layout, known limitations) is
**documented in [`docs/billing.md`](docs/billing.md)**.

### Seed demo scenarios

`npm run db:seed` also creates Phase 6 demo data (only when the database has
no invoices yet, so re-seeding never duplicates):

- Approved **one-time**, **recurring** and **hybrid** quotations left unbilled
  (Finance sees them in the *Ready to bill* list on `/billing`),
- an **issued** one-time invoice,
- an **active subscription** whose first-period recurring invoice is **paid**,
  with the next period already generated (upcoming schedule),
- a hybrid quotation billed and **partially paid**, with its own active
  subscription.

All demo artifacts are produced through the real domain services (quotation
→ submit → billing → issue → payment), so state machines and Decimal pricing
are authoritative.

### Billing demo flow

1. Log in as **Priya Nair** (Finance) and open `/billing`.
2. Pick an approved quotation from the *Ready to bill* list and click
   **Generate Billing** — a one-time invoice and/or subscription appears.
3. Open the invoice and click **Issue** (`DRAFT → ISSUED`).
4. Click **Record payment** for part of the total → `PARTIALLY_PAID`, then
   record the remainder → `PAID`.
5. Open the subscription under `/billing/subscriptions` to see its billing
   history, then use **Bill next period** to generate the following cycle.

See the docs for the exact invoice/subscription state machines.

## Phase 1 feature summary

- Next.js 16 + TypeScript application, Tailwind CSS v4 and shadcn/ui.
- Auth.js (credentials) login with session-based protected routes.
- Six roles (`ADMIN`, `SALES_REP`, `SALES_MANAGER`, `FINANCE`, `OPERATIONS`,
  `CUSTOMER`) with server-side area authorization and role-aware navigation.
- Authenticated app shell: sidebar, header, user menu, dashboards for each role.
- Admin (read-only) views for products, customers, discount tiers, warehouses and
  subscription plans.
- Quotation engine (Phase 2), discount governance + approval workflow
  (Phase 3), AI-assisted recommendations (Phase 4), multi-warehouse fulfillment
  and backorders (Phase 5) and hybrid billing (Phase 6).
- Deal Health remains a placeholder for a later phase.
- PostgreSQL data model seeded with realistic demo data (users, customers,
  products, discount tiers, warehouses, inventory, subscription plans).