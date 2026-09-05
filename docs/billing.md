# DealFlow360 — Billing & Subscriptions (Phase 6)

Phase 6 adds a **hybrid billing** domain on top of the finalized quotation
lifecycle: a quotation may contain one-time lines, recurring (subscription)
lines, or both. Billing is a real backend domain — pricing snapshots,
idempotency, transaction safety and server-side authorization — not a UI demo.

## Concepts

- **One-time line** → a `ONE_TIME` invoice with historical line snapshots.
- **Recurring line** → one `Subscription` (created from the quotation line),
  a `BillingSchedule` for each billing period, and a `RECURRING` invoice per
  billed period.
- **Hybrid quotation** → both, created atomically in a single transaction.

## Billing eligibility

Billing is only possible for quotations that have cleared governance:

```
APPROVED / CONFIRMED / FULFILLING / COMPLETED  → billable
DRAFT / PENDING_APPROVAL / DISCOUNT_CHECK / PENDING_MANAGER /
PENDING_FINANCE / REJECTED / UNDER_NEGOTIATION → not billable (409)
```

The eligibility check lives in `billing-transitions.ts`
(`isBillableQuotationStatus`) and is enforced server-side inside
`createBillingFromQuotation` — a button is never the gate.

## Invoice lifecycle

```
DRAFT ──issue──▶ ISSUED ──payment──▶ PARTIALLY_PAID ──payment──▶ PAID
  │                │                      │
  │                └──── mark overdue ───▶ OVERDUE ──payment──▶ PAID
  └──void──▶ VOID            (issued/unpaid only)
```

- `DRAFT → ISSUED` via `issueInvoice` (stamps issue + due dates).
- Payments are recorded against **issued** invoices only.
- `PAID` and `VOID` are terminal. `VOID → PAID`, `PAID → ISSUED` are invalid
  and rejected by the pure transition resolver.
- Historical immutability: `InvoiceLine` stores the finalized unit price,
  discount and line total at billing time. Changing `Product.price` later
  never alters a recorded invoice (covered by an integration test).

## Subscription lifecycle

```
ACTIVE ──pause──▶ PAUSED ──resume──▶ ACTIVE
ACTIVE/PAUSED ──cancel──▶ CANCELLED   (terminal; stops future billing)
ACTIVE ──complete──▶ COMPLETED        (terminal)
```

- Created from a recurring quotation line; the **recurring amount is the
  finalized net line total** (`lineTotal`), snapshotted at billing time.
- The billing interval comes from the product's `SubscriptionPlan`
  (`MONTHLY` / `QUARTERLY` / `ANNUAL`), falling back to `MONTHLY`.
- `billSubscription` generates the next period's `BillingSchedule` + a
  `RECURRING` invoice in one transaction.

## Billing schedule

Each subscription period is a `BillingSchedule`:

```
SCHEDULED ──makeDue──▶ DUE ──payment/paid──▶ PAID
SCHEDULED/DUE ──cancel──▶ CANCELLED
DUE ──fail──▶ FAILED
```

The first period is generated when the subscription is created; issuing a
period's invoice moves the schedule `SCHEDULED → DUE`; paying it in full
moves it `DUE → PAID`.

## Hybrid billing flow

`createBillingFromQuotation(quotationId, actor)` (in `billing-service.ts`):

1. Authorizes the actor (FINANCE/ADMIN).
2. Takes a `pg_advisory_xact_lock` on the quotation — concurrent
   "Generate billing" clicks serialize.
3. Validates the quotation exists and is billable.
4. Idempotency guard: any existing one-time invoice or subscription for the
   quotation → `409 BILLING_ALREADY_CREATED`.
5. One-time lines → `ONE_TIME` invoice (`billingKey: ot:{quotationId}`).
6. Each recurring line → `Subscription` + first `BillingSchedule` + first
   period `RECURRING` invoice (`billingKey: schedule:{scheduleId}`).
7. Everything is one Prisma transaction: any failure rolls back **all** of it
   — no invoice-without-subscription, no subscription-without-invoice.

## Idempotency strategy

- **One-time invoices**: unique `billingKey` `ot:{quotationId}` → one per
  quotation, forever.
- **Subscription per line**: `Subscription.quotationLineId` is unique → a
  recurring line can never produce two subscriptions.
- **Billing periods**: `@@unique([subscriptionId, periodStart])` → the same
  period can never be billed twice.
- **Payments**: unique `idempotencyKey` (caller-supplied) and unique
  `externalEventId` (provider events) — a double-click or a webhook retry can
  never credit an invoice twice.
- DB unique constraints are the final backstop; the advisory lock handles the
  double-click race window.

## Payment model (webhook-ready)

Payments are recorded **internally** in Phase 6 (no external gateway). The
domain is designed so a provider can be added later:

- `Payment.externalEventId` is unique — a provider webhook event is processed
  exactly once, transactionally.
- `Payment.idempotencyKey` supports idempotent internal recording.
- Never trust client-side success: amounts are re-validated against the
  invoice balance server-side; overpayment is rejected (`400`).
- Payment provider integration is intentionally deferred; the payment domain
  is designed for idempotent webhook integration.

Recording a payment atomically: create the payment row → recompute the
invoice `paidAmount` → derive the invoice status (`PARTIALLY_PAID` / `PAID`)
→ settle the billing schedule when the invoice is fully paid.

## Money handling

All persisted monetary values use Prisma `Decimal` (`@db.Decimal(12, 2)`) and
decimal.js arithmetic — never raw JavaScript floats. `billing-calculation.ts`
centralizes `toMoney` / `roundMoney` (half-up, 2dp), `sumMoney`,
`prorateAmount` (`amount × days / period`) and calendar-aware
`addBillingInterval` (month-end clamping, leap-year aware).

## RBAC

| Role             | Billing access                                             |
| ---------------- | ---------------------------------------------------------- |
| `ADMIN`          | Full billing management (create/issue/pay/bill)            |
| `FINANCE`        | Full billing management                                    |
| `SALES_MANAGER`  | Read-only, all quotations                                  |
| `SALES_REP`      | Read-only, **own** quotations only                         |
| `OPERATIONS`     | No billing access                                          |
| `CUSTOMER`       | No internal billing access (Phase 6)                       |

Every mutation path calls `assertCanManageBilling` (FINANCE/ADMIN only) inside
the service layer; every read applies role + ownership scoping. Record-level
checks keep reps isolated from other reps' billing.

## API endpoints

| Endpoint                              | Purpose                                             |
| ------------------------------------- | --------------------------------------------------- |
| `POST /api/quotations/:id/billing`    | Create hybrid billing from a finalized quotation    |
| `GET  /api/invoices`                  | Paginated invoice list (status/type/customer search)|
| `GET  /api/invoices/:id`              | Invoice detail (lines, payments, quotation)         |
| `POST /api/invoices/:id/issue`        | `DRAFT → ISSUED`                                    |
| `POST /api/invoices/:id/payments`     | Record an internal payment (idempotency key)        |
| `GET  /api/subscriptions`             | Paginated subscription list                         |
| `GET  /api/subscriptions/:id`         | Subscription detail with billing history            |
| `POST /api/subscriptions/:id/bill`    | Generate the next subscription period + invoice     |
| `GET  /api/billing-schedules`         | Paginated billing schedule list                     |

All routes require authentication, apply area RBAC, validate with Zod,
return structured JSON errors and use `401/403/404/409/422` semantics.

## Error codes

| Code                        | Meaning                                        |
| --------------------------- | ---------------------------------------------- |
| `QUOTATION_NOT_BILLABLE`    | Quotation has not cleared governance (409)      |
| `BILLING_ALREADY_CREATED`   | Duplicate billing run for the same quotation (409) |
| `INVOICE_STATE_CONFLICT`    | Invalid invoice transition (409)                |
| `PAYMENT_OVERPAYMENT`       | Payment exceeds outstanding balance (400)       |
| `PAYMENT_IDEMPOTENCY_CONFLICT` | Idempotency key already used (409)           |
| `PAYMENT_EVENT_DUPLICATE`   | Provider event already processed (409)          |
| `BILLING_FORBIDDEN`         | Role/ownership not permitted (403)              |

## Service layout

```
frontend/src/lib/modules/billing/
  billing-service.ts            hybrid orchestrator (create from quotation)
  invoice-service.ts            invoice CRUD, issue/void, list
  payment-service.ts            idempotent internal payments
  subscription-service.ts       subscriptions + billSubscription
  billing-schedule-service.ts   schedule read/list
  billing-transitions.ts        pure invoice/schedule/subscription state machines
  billing-guards.ts             RBAC + ownership rules
  billing-validation.ts         Zod schemas
  billing-calculation.ts        Decimal-safe money + period arithmetic
  invoice-numbering.ts          INV-YYYY-#### generator (advisory-locked)
  billing-errors.ts             typed errors with HTTP statuses
```

## Example demo flow

1. Log in as **Maya Chen** (sales rep) and open an **approved** quotation.
2. Log in as **Priya Nair** (finance) and open `/billing` — approved quotes
   that have not been billed appear in the *Ready to bill* list.
3. Click **Generate Billing** on a hybrid quote → a `ONE_TIME` invoice and a
   subscription with its first-period invoice are created atomically.
4. Open the invoice → **Issue** it (`DRAFT → ISSUED`).
5. **Record payment** for part of the total → invoice becomes
   `PARTIALLY_PAID`.
6. Record the remaining payment → invoice becomes `PAID` (the linked billing
   schedule settles to `PAID` too).
7. Open the subscription under `/billing/subscriptions` — its billing history
   lists each period. Click **Bill next period** to generate the following
   month's schedule + invoice.

## Known limitations

- Payments are internal only; no real payment gateway is wired up (see the
  webhook-ready note above). Proration is a simple deterministic
  day-based calculation, not calendar-true mid-cycle invoicing.
- Recurring billing is manual (`billSubscription`) rather than driven by an
  external scheduler/cron.
- No dunning/reminder workflow: `OVERDUE` is a derived/manual status in this
  phase.
- Cancelling a subscription stops future billing but does not auto-refund
  previously paid periods.
