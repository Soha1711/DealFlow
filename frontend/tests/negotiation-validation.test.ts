import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  acceptNegotiationSchema,
  counterNegotiationSchema,
  customerAcceptCounterSchema,
  customerRejectCounterSchema,
  rejectNegotiationSchema,
  respondNegotiationSchema,
  submitNegotiationSchema,
} from "../src/lib/modules/negotiations/negotiation-validation.ts";

describe("submitNegotiationSchema", () => {
  it("accepts a valid customer negotiation message", () => {
    const parsed = submitNegotiationSchema.safeParse({
      message: "Can we get an additional 5% discount for ordering today?",
    });
    assert.equal(parsed.success, true);
  });

  it("accepts target total and proposed line changes", () => {
    const parsed = submitNegotiationSchema.safeParse({
      message: "Please adjust volume to 10 units and 15% discount.",
      targetTotal: 4500,
      proposedLines: [
        {
          productId: "prod-1",
          requestedQuantity: 10,
          requestedDiscountPercent: 15,
        },
      ],
    });
    assert.equal(parsed.success, true);
  });

  it("rejects messages shorter than 5 characters", () => {
    const parsed = submitNegotiationSchema.safeParse({
      message: "disc",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects non-positive quantities in proposed lines", () => {
    const parsed = submitNegotiationSchema.safeParse({
      message: "Need modifications",
      proposedLines: [
        {
          productId: "prod-1",
          requestedQuantity: -2,
        },
      ],
    });
    assert.equal(parsed.success, false);
  });

  it("rejects discounts greater than 100", () => {
    const parsed = submitNegotiationSchema.safeParse({
      message: "Need 150% discount",
      proposedLines: [
        {
          productId: "prod-1",
          requestedDiscountPercent: 150,
        },
      ],
    });
    assert.equal(parsed.success, false);
  });
});

describe("respondNegotiationSchema", () => {
  it("accepts a valid customer counter response", () => {
    const parsed = respondNegotiationSchema.safeParse({
      message: "Understood, 12% is acceptable if delivery is next week.",
    });
    assert.equal(parsed.success, true);
  });

  it("rejects empty response message", () => {
    const parsed = respondNegotiationSchema.safeParse({
      message: "",
    });
    assert.equal(parsed.success, false);
  });
});

describe("rejectNegotiationSchema", () => {
  it("accepts a valid rejection reason", () => {
    const parsed = rejectNegotiationSchema.safeParse({
      reason: "Our margins on this hardware line do not permit additional discounting.",
    });
    assert.equal(parsed.success, true);
  });

  it("rejects too short reason", () => {
    const parsed = rejectNegotiationSchema.safeParse({
      reason: "no",
    });
    assert.equal(parsed.success, false);
  });
});

describe("counterNegotiationSchema", () => {
  it("accepts a valid sales counter message", () => {
    const parsed = counterNegotiationSchema.safeParse({
      message: "We cannot do 20%, but we can offer 12% if payment is within 15 days.",
    });
    assert.equal(parsed.success, true);
  });
});

describe("acceptNegotiationSchema", () => {
  it("accepts with or without message and lines", () => {
    const parsed1 = acceptNegotiationSchema.safeParse({});
    assert.equal(parsed1.success, true);

    const parsed2 = acceptNegotiationSchema.safeParse({
      message: "Agreed to requested terms.",
      lines: [
        {
          productId: "prod-1",
          quantity: 4,
          unitPrice: 500,
          discountPercent: 15,
        },
      ],
    });
    assert.equal(parsed2.success, true);
  });
});

describe("customerAcceptCounterSchema", () => {
  it("accepts empty or valid message", () => {
    const parsedEmpty = customerAcceptCounterSchema.safeParse({});
    assert.equal(parsedEmpty.success, true);

    const parsedWithMsg = customerAcceptCounterSchema.safeParse({
      message: "We accept the updated discount.",
    });
    assert.equal(parsedWithMsg.success, true);
  });

  it("rejects message exceeding 500 characters", () => {
    const parsedTooLong = customerAcceptCounterSchema.safeParse({
      message: "A".repeat(501),
    });
    assert.equal(parsedTooLong.success, false);
  });
});

describe("customerRejectCounterSchema", () => {
  it("accepts empty or valid reason", () => {
    const parsedEmpty = customerRejectCounterSchema.safeParse({});
    assert.equal(parsedEmpty.success, true);

    const parsedWithReason = customerRejectCounterSchema.safeParse({
      reason: "Pricing does not meet our required threshold.",
    });
    assert.equal(parsedWithReason.success, true);
  });

  it("rejects reason exceeding 500 characters", () => {
    const parsedTooLong = customerRejectCounterSchema.safeParse({
      reason: "B".repeat(501),
    });
    assert.equal(parsedTooLong.success, false);
  });
});
