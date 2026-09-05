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

## Phase 1 feature summary

- Next.js 16 + TypeScript application, Tailwind CSS v4 and shadcn/ui.
- Auth.js (credentials) login with session-based protected routes.
- Six roles (`ADMIN`, `SALES_REP`, `SALES_MANAGER`, `FINANCE`, `OPERATIONS`,
  `CUSTOMER`) with server-side area authorization and role-aware navigation.
- Authenticated app shell: sidebar, header, user menu, dashboards for each role.
- Admin (read-only) views for products, customers, discount tiers, warehouses and
  subscription plans.
- Placeholder routes for Quotations, Approvals, Fulfillment, Billing and Deal
  Health — those modules are planned for later phases.
- PostgreSQL data model seeded with realistic demo data (users, customers,
  products, discount tiers, warehouses, inventory, subscription plans).