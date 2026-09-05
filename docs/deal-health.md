# DealFlow360 — Deal Health & Deal Risk Intelligence (Phase 8)

Phase 8 introduces the **Deal Health & Deal Risk Intelligence** module to DealFlow360.
The system provides sales managers, executives, finance, operations, and sales representatives with a **deterministic, explainable, real-time health evaluation** (0–100) and automated anomaly detection across their active deal pipeline.

All signals are computed dynamically and authoritatively from the live database — **no mock scores, no duplicate data models, and zero LLM dependency** for scoring decisions.

---

## 1. Architecture & Design Principles

```
  Live Operational Database (PostgreSQL / Prisma)
  [ Quotations | Approvals | Inventory | Fulfillments | Invoices | Negotiations ]
                                │
                                ▼
                   Deal Health Service Layer
             (lib/modules/deal-health/deal-health-service.ts)
                                │
                                ▼
                   Deterministic Scoring Engine
             (lib/modules/deal-health/deal-health-engine.ts)
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
  Portfolio Health Overview                    Deal Detail Intelligence
  (/deal-health dashboard)                     (/quotations/[id] card)
```

1. **Deterministic & Explainable**:
   - The same deal state always produces the exact same score, level, factors, and anomalies.
   - Every point deduction is tied to a human-readable factor explaining *why* the deal was penalized.
2. **Authoritative & Dynamic**:
   - Scores are computed from current transactional records (approval actions, stock allocations, backorders, invoice payment receipts).
   - Zero denormalized caches or stale alert tables: as soon as an invoice is paid or a backorder is resolved, the deal health score updates instantly.
3. **Internal Only & Least Privilege**:
   - `CUSTOMER` role is strictly forbidden (`403`) from accessing deal health information.
   - `SALES_REP` can inspect deal health for their own assigned quotations (`where: { salesRepId: session.user.id }`). Attempting to inspect another rep's deal health is blocked by server-side guards (`403` / `404`).
   - `ADMIN`, `SALES_MANAGER`, `FINANCE`, and `OPERATIONS` have portfolio-wide visibility.

---

## 2. Signal Evaluation Dimensions

The Deal Health engine inspects 8 distinct operational dimensions:

| Dimension | Signal Source | Conditions Evaluated | Point Impact |
| :--- | :--- | :--- | :--- |
| **1. Discount Governance** | `Quotation.riskScore`, `Quotation.riskLevel` | `CRITICAL` risk level (score ≥ 70)<br>`HIGH` risk level (score ≥ 40)<br>`MEDIUM` risk level (score ≥ 1) | −20 pts<br>−14 pts<br>−7 pts |
| **2. Margin Health** | `Quotation.margin`, `Quotation.total`, `QuotationLine.margin` | Negative overall deal margin (`margin < 0`)<br>Razor-thin margin (`marginRate < 10%`)<br>Low margin (`10% ≤ marginRate < 20%`)<br>Any individual line sold below cost (`line.margin < 0`) | −30 pts<br>−15 pts<br>−8 pts<br>−10 pts |
| **3. Approval Governance** | `Quotation.approvals`, `Approval.status`, `Approval.createdAt` | Formal approval rejection (`status === REJECTED`)<br>Stalled approval pending review > 3 days (72h)<br>Active pending approval (within 3d SLA) | −25 pts<br>−15 pts<br>−6 pts |
| **4. Fulfillment & Stock** | `Quotation.fulfillments`, `FulfillmentLine.backorderQuantity`, `Inventory` | Active backorder on physical product lines<br>Unreserved warehouse inventory insufficient for physical order<br>Partial warehouse allocation (`PARTIALLY_ALLOCATED`) | −20 pts<br>−12 pts<br>−6 pts |
| **5. Billing & Receivables** | `Quotation.invoices`, `Invoice.status`, `Invoice.dueDate`, `Payment` | Overdue unpaid invoice (`dueDate < now`)<br>Failed electronic payment transaction<br>Partially paid invoice past due terms | −25 pts<br>−20 pts<br>−10 pts |
| **6. Customer Negotiations** | `Quotation.status === UNDER_NEGOTIATION`, `QuotationNegotiation` | Stalled negotiation round (> 5 days without response)<br>Protracted negotiations (≥ 3 negotiation rounds)<br>Active negotiation in progress | −15 pts<br>−10 pts<br>−7 pts |
| **7. Quote Expiry & Validity** | `Quotation.validUntil`, `Quotation.status` | Proposal has expired (`now > validUntil`)<br>Imminent expiry within 72 hours<br>Expiry approaching within 7 days | −25 pts<br>−15 pts<br>−6 pts |
| **8. Stagnation & Velocity** | `Quotation.createdAt`, `Quotation.status` | Stagnant draft quotation inactive > 14 days | −10 pts |

---

## 3. Scoring Formula & Health Levels

$$\text{Health Score} = \max\left(0, \min\left(100, 100 - \sum \text{Deductions}\right)\right)$$

* **`HEALTHY` (75–100)**: Commercial terms within policy, inventory available, payments and approvals on track.
* **`AT_RISK` (45–74)**: Significant operational friction (e.g. stalled approvals, stock shortages, low margin, active negotiations).
* **`CRITICAL` (0–44)**: Critical commercial, fulfillment, or collections blockers (e.g. loss-making margin, active backorders, overdue invoices, expired proposal, or rejected approval).

---

## 4. Anomaly Detection & Actionable Recommendations

When anomalous states occur, the engine triggers typed anomalies with recommended actions:

| Code | Severity | Anomaly Description | Actionable Recommendation |
| :--- | :--- | :--- | :--- |
| `NEGATIVE_MARGIN` | `CRITICAL` | Total revenue is less than product cost. | Restructure quotation line pricing to eliminate negative margin. |
| `RAZOR_THIN_MARGIN` | `HIGH` | Margin rate is under 10%. | Review discounts or bundle higher-margin software services. |
| `LOSS_MAKING_LINE` | `HIGH` | Specific product line sells below unit cost. | Adjust line discount so unit price exceeds unit cost. |
| `CRITICAL_DISCOUNT_OVERAGE` | `CRITICAL` | Discount variance requires executive review. | Obtain formal commercial justification from Finance and Sales Management. |
| `REJECTED_APPROVAL` | `CRITICAL` | Reviewer formally rejected the quotation. | Revise quotation terms based on reviewer feedback. |
| `STALLED_APPROVAL` | `HIGH` | Approval pending for more than 3 days. | Escalate pending review to prevent pipeline stall. |
| `ACTIVE_BACKORDER` | `CRITICAL` | Physical order volume exceeds warehouse stock. | Review backorder replenishment schedule with Operations. |
| `INSUFFICIENT_STOCK` | `MEDIUM` | Unreserved inventory insufficient for order. | Alert Operations to reserve incoming stock or prepare backorder. |
| `OVERDUE_INVOICE` | `CRITICAL` | Unpaid invoice past contractual due date. | Initiate payment follow-up with customer finance team. |
| `FAILED_PAYMENT` | `HIGH` | Payment charge failed to process. | Request updated payment method from customer. |
| `STALLED_NEGOTIATION` | `MEDIUM` | Customer request unanswered for > 5 days. | Respond to customer negotiation to keep deal moving. |
| `PROTRACTED_NEGOTIATION` | `MEDIUM` | 3 or more rounds of counter-proposals. | Schedule a direct alignment conversation with customer stakeholders. |
| `EXPIRED_QUOTATION` | `CRITICAL` | Quote validity period elapsed. | Extend quotation validity date before proceeding. |
| `EXPIRING_SOON` | `HIGH` | Quote expires within 72 hours. | Follow up with customer contact before quote expires. |
| `STAGNANT_DRAFT` | `LOW` | Draft inactive for more than two weeks. | Submit draft for commercial review or archive stale proposal. |

---

## 5. API Reference

### `GET /api/deal-health`
Returns a paginated list of deals with computed health scores and portfolio KPI summary.

**Query Parameters**:
- `page` (optional, default: `1`)
- `pageSize` (optional, default: `20`, max: `100`)
- `q` (optional): Search query matching quotation number, customer name, or sales rep.
- `level` (optional): Filter by `"HEALTHY"`, `"AT_RISK"`, `"CRITICAL"`, or `"ALL"`.
- `salesRepId` (optional): Filter by specific sales representative (ignored for sales reps, who are locked to their own ID).

**Response**:
```json
{
  "items": [
    {
      "id": "cm1...",
      "quotationNumber": "QUOT-2026-0004",
      "status": "APPROVED",
      "total": 3400.0,
      "margin": 1150.0,
      "marginRate": 0.338,
      "customer": { "id": "c1...", "name": "Northwind Traders Inc" },
      "salesRep": { "id": "u1...", "name": "Maya Chen", "email": "maya.chen@dealflow360.io" },
      "health": {
        "score": 55,
        "level": "AT_RISK",
        "primaryRisk": "Delinquent Accounts Receivable",
        "anomaliesCount": 2
      },
      "validUntil": "2026-12-31T23:59:59.000Z",
      "createdAt": "2026-08-20T10:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 },
  "summary": {
    "averageScore": 76,
    "healthyCount": 12,
    "atRiskCount": 4,
    "criticalCount": 1,
    "criticalAlertsCount": 2,
    "totalDeals": 17,
    "totalPortfolioValue": 142500.0
  }
}
```

### `GET /api/deal-health/[id]`
Returns the comprehensive deal health intelligence evaluation for a specific quotation.

**Response**:
```json
{
  "quotationId": "cm1...",
  "quotationNumber": "QUOT-2026-0004",
  "score": 55,
  "level": "AT_RISK",
  "evaluatedAt": "2026-09-05T22:30:00.000Z",
  "factors": [
    {
      "id": "factor-billing-overdue",
      "category": "BILLING",
      "severity": "CRITICAL",
      "impact": -25,
      "title": "Overdue Invoices (1)",
      "description": "One or more invoices have passed their contractual payment due date."
    },
    {
      "id": "factor-fulfillment-backorder",
      "category": "FULFILLMENT",
      "severity": "CRITICAL",
      "impact": -20,
      "title": "Active Backorder (4 units)",
      "description": "One or more order lines cannot be fulfilled from current stock."
    }
  ],
  "anomalies": [
    {
      "id": "anomaly-billing-overdue",
      "code": "OVERDUE_INVOICE",
      "severity": "CRITICAL",
      "title": "Delinquent Accounts Receivable",
      "description": "1 invoice(s) are past due date with unpaid balance.",
      "suggestedAction": "Follow up with customer accounts payable contact for payment status."
    }
  ],
  "recommendations": [
    {
      "id": "rec-billing-overdue",
      "priority": "HIGH",
      "category": "BILLING",
      "action": "Initiate payment follow-up with customer finance team.",
      "reason": "1 invoice(s) are overdue."
    }
  ],
  "metrics": {
    "marginRate": 0.338,
    "total": 3400.0,
    "margin": 1150.0,
    "discountPercentAggregate": 10.5,
    "riskScore": 0,
    "pendingApprovalsCount": 0,
    "activeBackorderUnits": 4,
    "overdueInvoicesCount": 1,
    "activeNegotiationRounds": 0
  },
  "customer": { "id": "c1...", "name": "Northwind Traders Inc" },
  "salesRep": { "id": "u1...", "name": "Maya Chen" }
}
```

---

## 6. User Interface

1. **Portfolio Overview (`/deal-health`)**:
   - Executive KPI cards: Average Health, Healthy count, At-Risk count, Critical Deals (with badge count of active critical anomalies), and Total Pipeline Value.
   - Interactive search & level filter bar (`ALL`, `CRITICAL`, `AT_RISK`, `HEALTHY`).
   - Paginated portfolio table with score progress gauges, primary risk indicators, and direct links to deal inspection.

2. **Quotation Detail Page (`/quotations/[id]`)**:
   - Embedded `<DealHealthCard>` featuring score badge, margin rate, discount risk, backorder units, overdue invoices, detected operational anomalies, actionable recommendations, and a complete breakdown of scoring factors.
