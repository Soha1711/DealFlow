import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluateDealHealth } from "@/lib/modules/deal-health/deal-health-engine";
import type { DealHealthEvaluationInput } from "@/lib/modules/deal-health/deal-health-types";

function createBaseInput(overrides?: Partial<DealHealthEvaluationInput>): DealHealthEvaluationInput {
  const fixedNow = new Date("2026-09-01T12:00:00Z");
  return {
    quotation: {
      id: "quote-1",
      quotationNumber: "QUOT-2026-0001",
      status: "APPROVED",
      subtotal: 1000,
      discountTotal: 100,
      total: 900,
      margin: 300, // 300 / 900 = 33.3% margin
      validUntil: new Date("2026-09-30T12:00:00Z"),
      riskScore: 0,
      riskLevel: "LOW",
      requiredApprovalLevel: "NONE",
      createdAt: new Date("2026-08-25T12:00:00Z"),
      updatedAt: new Date("2026-08-25T12:00:00Z"),
    },
    lines: [
      {
        id: "line-1",
        productId: "prod-1",
        quantity: 1,
        unitPrice: 1000,
        discountPercent: 10,
        margin: 300,
        isRecurring: false,
        product: {
          id: "prod-1",
          name: "Standard Server",
          sku: "SRV-001",
          cost: 600,
          maxDiscountPercent: 20,
          isRecurring: false,
          inventory: [{ quantity: 10, reservedQuantity: 2 }],
        },
      },
    ],
    approvals: [],
    fulfillments: [],
    invoices: [],
    negotiations: [],
    now: fixedNow,
    ...overrides,
  };
}

describe("Deal Health Engine — Pure Scoring & Evaluation", () => {
  it("scores a pristine approved deal as 100 and HEALTHY", () => {
    const input = createBaseInput();
    const result = evaluateDealHealth(input);

    assert.equal(result.score, 100);
    assert.equal(result.level, "HEALTHY");
    assert.equal(result.anomalies.length, 0);
    assert.ok(result.factors.every((f) => f.impact === 0));
  });

  it("is fully deterministic: identical inputs yield identical outputs", () => {
    const input = createBaseInput();
    const res1 = evaluateDealHealth(input);
    const res2 = evaluateDealHealth(input);

    assert.deepEqual(res1, res2);
  });

  it("penalizes critical discount risk and detects CRITICAL_DISCOUNT_OVERAGE anomaly", () => {
    const input = createBaseInput({
      quotation: {
        ...createBaseInput().quotation,
        riskScore: 85,
        riskLevel: "CRITICAL",
      },
    });

    const result = evaluateDealHealth(input);
    assert.equal(result.score, 80); // 100 - 20
    assert.equal(result.level, "HEALTHY"); // 80 is still >= 75
    const anomaly = result.anomalies.find((a) => a.code === "CRITICAL_DISCOUNT_OVERAGE");
    assert.ok(anomaly, "Expected CRITICAL_DISCOUNT_OVERAGE anomaly");
    assert.equal(anomaly.severity, "CRITICAL");
  });

  it("penalizes negative margin and flags NEGATIVE_MARGIN anomaly", () => {
    const input = createBaseInput({
      quotation: {
        ...createBaseInput().quotation,
        margin: -150,
      },
    });

    const result = evaluateDealHealth(input);
    assert.equal(result.score, 70); // 100 - 30
    assert.equal(result.level, "AT_RISK");
    const anomaly = result.anomalies.find((a) => a.code === "NEGATIVE_MARGIN");
    assert.ok(anomaly, "Expected NEGATIVE_MARGIN anomaly");
    assert.equal(anomaly.severity, "CRITICAL");
  });

  it("penalizes razor-thin margin (< 10%) and flags RAZOR_THIN_MARGIN anomaly", () => {
    const input = createBaseInput({
      quotation: {
        ...createBaseInput().quotation,
        total: 1000,
        margin: 50, // 5% margin
      },
    });

    const result = evaluateDealHealth(input);
    assert.equal(result.score, 85); // 100 - 15
    const anomaly = result.anomalies.find((a) => a.code === "RAZOR_THIN_MARGIN");
    assert.ok(anomaly, "Expected RAZOR_THIN_MARGIN anomaly");
    assert.equal(anomaly.severity, "HIGH");
  });

  it("penalizes individual loss-making lines even if total deal is positive", () => {
    const base = createBaseInput();
    const input = createBaseInput({
      lines: [
        ...base.lines,
        {
          id: "line-loss",
          productId: "prod-2",
          quantity: 2,
          unitPrice: 100,
          discountPercent: 50,
          margin: -50,
          isRecurring: false,
        },
      ],
    });

    const result = evaluateDealHealth(input);
    assert.equal(result.score, 90); // 100 - 10
    const anomaly = result.anomalies.find((a) => a.code === "LOSS_MAKING_LINE");
    assert.ok(anomaly, "Expected LOSS_MAKING_LINE anomaly");
  });

  it("penalizes rejected approvals and marks REJECTED_APPROVAL anomaly", () => {
    const input = createBaseInput({
      approvals: [
        {
          id: "app-1",
          level: "MANAGER",
          status: "REJECTED",
          reason: "Margin too low for hardware",
          createdAt: new Date("2026-08-30T12:00:00Z"),
        },
      ],
    });

    const result = evaluateDealHealth(input);
    assert.equal(result.score, 75); // 100 - 25
    const anomaly = result.anomalies.find((a) => a.code === "REJECTED_APPROVAL");
    assert.ok(anomaly, "Expected REJECTED_APPROVAL anomaly");
    assert.equal(anomaly.severity, "CRITICAL");
  });

  it("penalizes stalled pending approvals (> 3 days)", () => {
    const input = createBaseInput({
      approvals: [
        {
          id: "app-stalled",
          level: "FINANCE",
          status: "PENDING",
          createdAt: new Date("2026-08-20T12:00:00Z"), // 12 days old (> 72h)
        },
      ],
    });

    const result = evaluateDealHealth(input);
    assert.equal(result.score, 85); // 100 - 15
    const anomaly = result.anomalies.find((a) => a.code === "STALLED_APPROVAL");
    assert.ok(anomaly, "Expected STALLED_APPROVAL anomaly");
  });

  it("penalizes active backorders with ACTIVE_BACKORDER anomaly", () => {
    const input = createBaseInput({
      fulfillments: [
        {
          id: "ful-1",
          status: "PARTIALLY_ALLOCATED",
          lines: [
            {
              id: "fline-1",
              requestedQuantity: 5,
              allocatedQuantity: 2,
              fulfilledQuantity: 0,
              backorderQuantity: 3,
            },
          ],
        },
      ],
    });

    const result = evaluateDealHealth(input);
    assert.equal(result.score, 80); // 100 - 20
    const anomaly = result.anomalies.find((a) => a.code === "ACTIVE_BACKORDER");
    assert.ok(anomaly, "Expected ACTIVE_BACKORDER anomaly");
    assert.equal(anomaly.severity, "CRITICAL");
  });

  it("penalizes overdue invoices with OVERDUE_INVOICE anomaly", () => {
    const input = createBaseInput({
      invoices: [
        {
          id: "inv-1",
          invoiceNumber: "INV-2026-0001",
          status: "OVERDUE",
          total: 900,
          paidAmount: 0,
          dueDate: new Date("2026-08-15T12:00:00Z"),
        },
      ],
    });

    const result = evaluateDealHealth(input);
    assert.equal(result.score, 75); // 100 - 25
    const anomaly = result.anomalies.find((a) => a.code === "OVERDUE_INVOICE");
    assert.ok(anomaly, "Expected OVERDUE_INVOICE anomaly");
    assert.equal(anomaly.severity, "CRITICAL");
  });

  it("penalizes failed payment transactions", () => {
    const input = createBaseInput({
      invoices: [
        {
          id: "inv-failed",
          invoiceNumber: "INV-2026-0002",
          status: "ISSUED",
          total: 900,
          paidAmount: 0,
          dueDate: new Date("2026-09-15T12:00:00Z"),
          payments: [{ status: "FAILED" }],
        },
      ],
    });

    const result = evaluateDealHealth(input);
    assert.equal(result.score, 80); // 100 - 20
    const anomaly = result.anomalies.find((a) => a.code === "FAILED_PAYMENT");
    assert.ok(anomaly);
  });

  it("penalizes stalled negotiations and protracted negotiation rounds", () => {
    const input = createBaseInput({
      quotation: {
        ...createBaseInput().quotation,
        status: "UNDER_NEGOTIATION",
      },
      negotiations: [
        {
          id: "neg-1",
          status: "COUNTERED",
          message: "Round 1",
          createdAt: new Date("2026-08-20T12:00:00Z"),
        },
        {
          id: "neg-2",
          status: "COUNTERED",
          message: "Round 2",
          createdAt: new Date("2026-08-22T12:00:00Z"),
        },
        {
          id: "neg-3",
          status: "PENDING",
          message: "Round 3 stalled",
          createdAt: new Date("2026-08-25T12:00:00Z"), // 7 days old (> 5 days)
        },
      ],
    });

    const result = evaluateDealHealth(input);
    // Deductions: -15 (stalled > 5 days) + -10 (>= 3 rounds) = -25
    assert.equal(result.score, 75);
    assert.ok(result.anomalies.some((a) => a.code === "STALLED_NEGOTIATION"));
    assert.ok(result.anomalies.some((a) => a.code === "PROTRACTED_NEGOTIATION"));
  });

  it("penalizes expired quotation and imminent expiry (within 72h)", () => {
    // Expired
    const expiredInput = createBaseInput({
      quotation: {
        ...createBaseInput().quotation,
        validUntil: new Date("2026-08-30T12:00:00Z"), // 2 days in past relative to now
      },
    });
    const expiredRes = evaluateDealHealth(expiredInput);
    assert.equal(expiredRes.score, 75); // 100 - 25
    assert.ok(expiredRes.anomalies.some((a) => a.code === "EXPIRED_QUOTATION"));

    // Expiring within 72 hours
    const soonInput = createBaseInput({
      quotation: {
        ...createBaseInput().quotation,
        validUntil: new Date("2026-09-02T12:00:00Z"), // 24h away
      },
    });
    const soonRes = evaluateDealHealth(soonInput);
    assert.equal(soonRes.score, 85); // 100 - 15
    assert.ok(soonRes.anomalies.some((a) => a.code === "EXPIRING_SOON"));
  });

  it("combines multiple risks deterministically and drops to CRITICAL level without going below 0", () => {
    const input = createBaseInput({
      quotation: {
        ...createBaseInput().quotation,
        riskScore: 90,
        riskLevel: "CRITICAL", // -20
        margin: -500, // -30
        validUntil: new Date("2026-08-10T12:00:00Z"), // Expired: -25
      },
      approvals: [
        {
          id: "app-r",
          level: "MANAGER",
          status: "REJECTED", // -25
          createdAt: new Date("2026-08-15T12:00:00Z"),
        },
      ],
      fulfillments: [
        {
          id: "ful-b",
          status: "PARTIALLY_ALLOCATED",
          lines: [
            {
              id: "fl-1",
              requestedQuantity: 10,
              allocatedQuantity: 0,
              fulfilledQuantity: 0,
              backorderQuantity: 10, // -20
            },
          ],
        },
      ],
      invoices: [
        {
          id: "inv-o",
          invoiceNumber: "INV-999",
          status: "OVERDUE", // -25
          total: 1000,
          paidAmount: 0,
          dueDate: new Date("2026-08-01T12:00:00Z"),
        },
      ],
    });

    const result = evaluateDealHealth(input);
    // Total deductions = 20 + 30 + 25 + 25 + 20 + 25 = 145 -> clamped at 0
    assert.equal(result.score, 0);
    assert.equal(result.level, "CRITICAL");
    assert.ok(result.anomalies.length >= 5);
  });

  it("awards 100 to fully completed and paid quotation", () => {
    const input = createBaseInput({
      quotation: {
        ...createBaseInput().quotation,
        status: "COMPLETED",
      },
      invoices: [
        {
          id: "inv-p",
          invoiceNumber: "INV-P",
          status: "PAID",
          total: 900,
          paidAmount: 900,
        },
      ],
      fulfillments: [
        {
          id: "ful-c",
          status: "COMPLETED",
          lines: [],
        },
      ],
    });

    const result = evaluateDealHealth(input);
    assert.equal(result.score, 100);
    assert.equal(result.level, "HEALTHY");
    assert.equal(result.anomalies.length, 0);
  });
});
