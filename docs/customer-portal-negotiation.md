# DealFlow360 — Customer Portal & Quotation Negotiation (Phase 7)

Phase 7 adds a secure **Customer Portal** and **Quotation Negotiation** domain to DealFlow360.
Customers can authenticate, inspect approved quotations prepared for their company, negotiate commercial terms, submit structured change requests, and accept finalized proposals.

All negotiations reuse the **authoritative Phase 2 pricing engine** and **Phase 3 discount-risk governance and approval workflows** — no shadow pricing or secondary approval paths exist.

---

## 1. Concepts & Architecture

1. **Customer Scoping & IDOR Prevention**:
   - Every customer user belongs to a `Customer` record via `User.customerId`.
   - All portal queries and actions strictly filter by `where: { id: quotationId, customerId: session.user.customerId }`.
   - Accessing another customer's quotation returns `404 Not Found`.

2. **Information Hiding**:
   - Internal commercial data is never exposed to customers.
   - `sanitizeQuotationForCustomer` strips `Product.cost`, `Quotation.margin`, `QuotationLine.margin`, `riskScore`, `riskLevel`, `requiredApprovalLevel`, and internal `Approval` chains.

3. **Customer Immutability**:
   - Customers cannot directly edit live quotation lines, unit prices, discounts, or totals.
   - Customers submit negotiation requests (`QuotationNegotiation`).
   - The assigned sales representative reviews, counters, or accepts the request and updates quotation lines.

4. **Pricing & Governance Reuse**:
   - When a sales rep accepts commercial adjustments:
     1. Lines are priced via `calculateLinePricing` from `pricing.ts`.
     2. Quotation totals are recalculated via `calculateQuotationTotals` from `pricing.ts`.
     3. Discount governance is re-evaluated via `routeSubmittedQuotation(tx, quote.id)` from `approval-service.ts`.
     4. If the new terms exceed product discount limits, a manager approval (`PENDING_MANAGER`) is automatically created.
     5. Only when approved does the quotation return to `APPROVED` for customer acceptance.

---

## 2. Negotiation State Machine

```
Quotation Negotiation Lifecycle:
  Customer submits request ───────────▶ PENDING
                                          │
       ┌────────── Sales counters ────────┼────────── Sales rejects ──────────┐
       │                                  │                                   │
       ▼                                  ▼                                   ▼
   COUNTERED ── Customer responds ──▶ (PENDING)                            REJECTED
       │                                                                      │
       └────────── Sales accepts ─────────┴───────────────────────────────────┘
                                          ▼
                                      ACCEPTED

Quotation Lifecycle:
  APPROVED ── Customer submits request ──▶ UNDER_NEGOTIATION
  UNDER_NEGOTIATION ── Sales rejects ──▶ APPROVED (reverts to previous terms)
  UNDER_NEGOTIATION ── Sales counters ──▶ UNDER_NEGOTIATION
  UNDER_NEGOTIATION ── Sales accepts changes ──▶ DISCOUNT_CHECK (re-priced)
                                                   ├── LOW Risk: APPROVED
                                                   └── High Risk: PENDING_MANAGER
  APPROVED ── Customer accepts quote ──▶ CONFIRMED (ready for fulfillment & billing)
```

---

## 3. Customer Portal Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/portal/quotations` | List customer-visible quotations (`APPROVED`, `UNDER_NEGOTIATION`, `CONFIRMED`, `FULFILLING`, `COMPLETED`). |
| `GET` | `/api/portal/quotations/:id` | View single quotation (sanitized, IDOR-protected). |
| `POST` | `/api/portal/quotations/:id/negotiate` | Submit a negotiation request (`APPROVED → UNDER_NEGOTIATION`). |
| `POST` | `/api/portal/quotations/:id/accept` | Customer accepts quotation (`APPROVED → CONFIRMED`). |
| `POST` | `/api/portal/negotiations/:id/respond` | Customer replies to sales counter-proposal (`COUNTERED → PENDING`). |

---

## 4. Sales-Side Negotiation Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/quotations/:id/negotiations` | List negotiation history for a quotation. |
| `POST` | `/api/quotations/:id/negotiations/:negotiationId/accept` | Accept request, apply line adjustments, re-price, and re-route approvals. |
| `POST` | `/api/quotations/:id/negotiations/:negotiationId/reject` | Decline request with rationale (`UNDER_NEGOTIATION → APPROVED`). |
| `POST` | `/api/quotations/:id/negotiations/:negotiationId/counter` | Counter-offer with alternative terms (`status: COUNTERED`). |

---

## 5. Demo Walkthrough

1. **Customer Views Quotations**:
   - Log in as **Jordan Lee** (`jordan.lee@dealflow360.io` / `DealFlow360!`).
   - Open `/portal` to see Northwind Traders quotations.
   - Open an approved quote and click **Request Changes / Negotiate**.
   - Propose volume or discount adjustments and submit. The quote moves to `UNDER_NEGOTIATION`.

2. **Sales Representative Reviews**:
   - Log in as **Maya Chen** (`maya.chen@dealflow360.io` / `DealFlow360!`).
   - Open `/quotations`, filter by `Under Negotiation`.
   - Open the quotation to inspect the customer's negotiation request in the **Customer Negotiation** card.
   - Click **Accept / Apply Changes** to adjust volume/discount and confirm.
   - If the discount exceeds product limits, notice the quotation routes to `PENDING_MANAGER`!

3. **Approval & Customer Confirmation**:
   - Log in as **Ravi Patel** (`ravi.patel@dealflow360.io` / `DealFlow360!`) and approve the discount in `/approvals`.
   - Quotation moves to `APPROVED`.
   - Log in again as **Jordan Lee** in `/portal`, view the quote, and click **Accept Quotation** (`APPROVED → CONFIRMED`).
   - The quotation is now ready for operations allocation (`/fulfillment`) and finance billing (`/billing`).
