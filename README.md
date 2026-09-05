# DealFlow360

Intelligent sales-to-cash operations platform for the modern B2B team — dynamic quotation pricing, tiered discount risk governance, AI upsell/cross-sell recommendations, multi-warehouse fulfillment, hybrid subscription billing, customer negotiation portal, and real-time deal health intelligence.

DealFlow360 integrates the entire enterprise commercial lifecycle into an authoritative, deterministic, and role-governed web application.

## Repository layout

| Path           | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `frontend/`    | Next.js 16 + TypeScript web application (full stack UI, API routes, and domain modules) |
| `frontend/tests/` | Comprehensive test suite (31 suites, 393 tests covering all domains and E2E lifecycle) |
| `database/`    | PostgreSQL Prisma schema and versioned migrations (`database/prisma/`)   |
| `docs/`        | Architectural and domain specifications (`deal-health.md`, `billing.md`, etc.) |

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

## Phase 7 — Customer Portal & Quotation Negotiation

Phase 7 implements customer-facing access and real-time structured quotation negotiations:

- **Customer Portal (`/portal`)**:
  - Customers (e.g. `jordan.lee@dealflow360.io`) log in and see **only** their own quotations linked via `session.user.customerId`.
  - Strict server-side IDOR protection: accessing another account's quotation returns 404/403.
  - Commercial privacy: sensitive margin rates, product costs, discount risk scores, and internal approval logs are completely stripped for customer responses.
  - Customers can accept an `APPROVED` proposal directly (`APPROVED → CONFIRMED`) or request changes (`APPROVED → UNDER_NEGOTIATION`).
- **Negotiation Workflow**:
  - Customer submits a negotiation message with optional target total and proposed line quantities/discounts (`PENDING`).
  - Assigned Sales Rep reviews on the quotation detail page (`/quotations/[id]`) and can:
    - **Accept**: Applies changes to quotation lines. Re-evaluates pricing authoritatively with the Phase 2 pricing engine (`pricing.ts`) and routes through the Phase 3 discount-risk & approval workflow (`approval-service.ts`) if commercial thresholds/margins are exceeded.
    - **Counter**: Proposes alternative terms back to the customer (`COUNTERED`). The customer can respond (`PENDING`).
    - **Reject**: Declines requested terms with a reason (`REJECTED`) and cleanly restores quotation status back to `APPROVED`.
- Full architecture and API specifications are **documented in [`docs/customer-portal-negotiation.md`](docs/customer-portal-negotiation.md)**.

### Negotiation demo flow

1. Log in as **Jordan Lee** (`jordan.lee@dealflow360.io`, Customer for Northwind Traders Inc).
2. Browse to **Customer Portal** (`/portal`) and select quotation `QUOT-2026-0016` (currently `UNDER_NEGOTIATION`).
3. View the negotiation timeline with Maya Chen (Sales Rep).
4. Log in as **Maya Chen** (`maya.chen@dealflow360.io`, Sales Rep) and open `/quotations/[id]` for `QUOT-2026-0016`.
5. Under **Customer Negotiation**, review the request, counter or accept modifications.

## Phase 8 — Deal Health & Deal Risk Intelligence

Phase 8 introduces a deterministic, real-time operational deal risk evaluation engine:

- **Deterministic Scoring Engine (`0–100`)**:
  - Authoritative scores calculated dynamically from transactional signals (margin rate, discount overage, approval delays, warehouse backorders, delinquent invoices, negotiation stalling, and quote expiration).
  - Categorized health levels: **`HEALTHY`** (75–100), **`AT_RISK`** (45–74), and **`CRITICAL`** (0–44).
  - Explainable factors: every point deduction explains *why* the deal was penalized.
- **Automated Anomaly Detection**:
  - Flags operational anomalies such as `NEGATIVE_MARGIN`, `ACTIVE_BACKORDER`, `OVERDUE_INVOICE`, `STALLED_APPROVAL`, `EXPIRED_QUOTATION`, and `FAILED_PAYMENT` with severity ratings and concrete suggested actions.
- **Portfolio Intelligence (`/deal-health`)**:
  - Executive KPI dashboard displaying Average Health, Healthy count, At-Risk count, Critical Alerts, and Total Portfolio Value.
  - Searchable and level-filtered portfolio table with visual score gauges and primary risk indicators.
- **Quotation Detail Integration (`/quotations/[id]`)**:
  - Embedded `<DealHealthCard>` with real-time operational scorecard, factor breakdown, detected anomalies, and actionable next steps.
- **Role-Based Security**:
  - Strict customer exclusion (`403 Forbidden`).
  - Sales representative isolation: reps can only inspect health intelligence for their own deals.
- Full architecture and API specifications are **documented in [`docs/deal-health.md`](docs/deal-health.md)**.

### Deal Health demo flow

1. Log in as **Ravi Patel** (`ravi.patel@dealflow360.io`, Sales Manager) or **Avery Stone** (Admin).
2. Browse to **Insights → Deal Health** (`/deal-health`) in the sidebar.
3. Review portfolio KPIs and click on any deal or filter by `CRITICAL` / `AT_RISK`.
4. Click **Inspect** to open the quotation detail page and view the full `<DealHealthCard>` breakdown.

## Phase 9 — System Hardening, Cross-Module Integration & Polish

Phase 9 cements DealFlow360 into a unified, production-ready enterprise platform:

- **End-to-End Enterprise Integration**:
  - Seamless state progression across all 8 modules: Quotation (`DRAFT`) → Submission & Discount Risk → Tiered Approvals (`MANAGER` / `FINANCE`) → Customer Negotiation Portal → Rep Counter/Accept with Automatic Re-evaluation → Multi-Warehouse Fulfillment & Stock Reservation → Hybrid Invoicing & Payments → 0–100 Real-Time Deal Health Intelligence.
  - Integration alignment: operations may initiate fulfillment on both `APPROVED` and customer-`CONFIRMED` quotations; customer-confirmed quotations automatically appear in the operations fulfillment queue.
- **Turnkey Multi-Persona Demo Environment**:
  - `npm run db:seed` provisions realistic scenarios for every role:
    - **Maya Chen (Sales Rep)**: Active DRAFT quotation ready to demo AI upsell/cross-sell recommendations.
    - **Ravi Patel (Sales Manager)**: Pending discount approval in `/approvals`.
    - **Priya Nair (Finance)**: Escalated multi-tier discount approval in `/approvals` and ready-to-bill quotations in `/billing`.
    - **Diego Ramos (Operations)**: In-flight fulfillment with multi-warehouse split and backorders in `/fulfillment`.
    - **Jordan Lee (Customer)**: Quotation under active structured negotiation in `/portal`.
    - **Avery Stone (Admin)**: Full portfolio overview and deal health spectrum (`HEALTHY`, `AT_RISK`, `CRITICAL`) on `/deal-health`.
- **Automated Verification**:
  - **393 passing tests** across 99 suites, including `tests/end-to-end-integration.test.ts` asserting the full continuous lifecycle.
  - Zero TypeScript errors (`tsc --noEmit`), zero ESLint errors, and clean Turbopack production builds.

---

## 5-Minute Hackathon Demo Walkthrough

All accounts use the password: **`DealFlow360!`**

### Step 1: Maya Chen (Sales Rep) — AI Recommendations & Proposal Submission
1. Log in as `maya.chen@dealflow360.io`.
2. Navigate to **Quotations** (`/quotations`) and open the seeded `DRAFT` quote.
3. Observe the **Recommendations Panel**: view upsell & cross-sell candidates scored by stock availability and margin. Click **Add to Quote** to dynamically update lines.
4. Click **Submit for Approval**: the deterministic discount-risk engine evaluates product-level thresholds and flags managerial review.

### Step 2: Ravi Patel (Sales Manager) — Discount Governance
1. Log in as `ravi.patel@dealflow360.io`.
2. Navigate to **Approvals** (`/approvals`): view pending approval with risk level, score, and line overage details.
3. Click **Approve**: proposal is authorized and transitions to `APPROVED`.

### Step 3: Jordan Lee (Customer) — Customer Portal & Negotiation
1. Log in as `jordan.lee@dealflow360.io`.
2. Browse to **Customer Portal** (`/portal`): see only Northwind Traders' quotations (strict IDOR protection; zero internal cost/margin exposure).
3. Open the quotation under negotiation or submit a new volume request with target pricing.

### Step 4: Diego Ramos (Operations) — Multi-Warehouse Fulfillment & Backorders
1. Log in as `diego.ramos@dealflow360.io`.
2. Navigate to **Fulfillment** (`/fulfillment`): view approved & customer-confirmed quotations awaiting fulfillment.
3. Open an order and view warehouse inventory allocation across Cincinnati and Reno. Notice automated backorder handling when requested quantity exceeds available stock.

### Step 5: Priya Nair (Finance) — Hybrid Invoicing & Cash Collection
1. Log in as `priya.nair@dealflow360.io`.
2. Navigate to **Billing** (`/billing`): select an approved/confirmed deal and click **Generate Billing**.
3. Open the generated invoice, click **Issue**, and record payment (`PARTIALLY_PAID` → `PAID`).
4. For recurring contracts, view the active subscription and billing schedule under **Subscriptions**.

### Step 6: Avery Stone (Admin) — Deal Health & Executive Intelligence
1. Log in as `avery.stone@dealflow360.io`.
2. Navigate to **Deal Health** (`/deal-health`): view portfolio KPIs, health distribution (`HEALTHY`, `AT_RISK`, `CRITICAL`), and real operational anomalies.
3. Inspect any deal to view the `<DealHealthCard>` with granular scoring factors and suggested next steps.

---

## Complete Feature Matrix (Phases 1–9)

- **Application Shell & RBAC**: Next.js 16 + TypeScript, Tailwind CSS v4, shadcn/ui, Auth.js credentials, and role-based route protection for 6 distinct personas.
- **Quotation Engine**: Strict Decimal arithmetic, multi-line pricing, year-sequenced quotation numbering (`QUOT-YYYY-XXXX`), and full draft editing.
- **Discount Governance**: Product-level threshold validation, deterministic discount-risk scoring (0–100), and multi-stage managerial/finance escalation state machines.
- **AI Upsell/Cross-sell Intelligence**: Inventory-aware, margin-aware, and purchase-history-aware recommendation ranking with graceful fallback.
- **Multi-Warehouse Fulfillment**: Deterministic greedy allocation across warehouses, row-level transactional reservation ledgers (`pg_advisory_xact_lock`), and automated backordering.
- **Hybrid Billing**: Unified generation of one-time invoices and recurring subscriptions, period billing schedules, and idempotent payment recording.
- **Customer Portal & Structured Negotiations**: Scoped customer portal, information hiding (zero cost/margin leakage), and bi-directional counter-negotiation workflows.
- **Deal Health Intelligence**: Pure deterministic deal health scoring (0–100), health tier classification, and automated operational anomaly detection.
- **Hardened & Tested**: 393 tests passing across 99 suites, zero typecheck/lint warnings, clean production builds, and turnkey seed data.