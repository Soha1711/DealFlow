import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatInvoiceNumber,
  invoiceNumberPrefixForYear,
  nextInvoiceSequenceFromLast,
} from "../src/lib/modules/billing/invoice-numbering.ts";

describe("invoice numbering", () => {
  it("formats INV-YYYY-#### numbers", () => {
    assert.equal(formatInvoiceNumber(2026, 1), "INV-2026-0001");
    assert.equal(formatInvoiceNumber(2026, 42), "INV-2026-0042");
    assert.equal(formatInvoiceNumber(2027, 9999), "INV-2027-9999");
  });

  it("builds the year prefix", () => {
    assert.equal(invoiceNumberPrefixForYear(2026), "INV-2026-");
  });

  it("starts the sequence at 1 when nothing exists", () => {
    assert.equal(nextInvoiceSequenceFromLast(undefined, 2026), 1);
    assert.equal(nextInvoiceSequenceFromLast("", 2026), 1);
  });

  it("increments the last number of the same year", () => {
    assert.equal(nextInvoiceSequenceFromLast("INV-2026-0007", 2026), 8);
    assert.equal(nextInvoiceSequenceFromLast("INV-2026-9999", 2026), 10000);
  });

  it("ignores numbers from a different year", () => {
    assert.equal(nextInvoiceSequenceFromLast("INV-2025-0009", 2026), 1);
  });
});
