import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatQuotationNumber,
  nextSequenceFromLast,
  quotationNumberPrefixForYear,
} from "../src/lib/modules/quotations/numbering.ts";

describe("quotationNumberPrefixForYear", () => {
  it("builds the QUOT-YYYY- prefix", () => {
    assert.equal(quotationNumberPrefixForYear(2026), "QUOT-2026-");
  });
});

describe("formatQuotationNumber", () => {
  it("zero-pads the sequence to 4 digits", () => {
    assert.equal(formatQuotationNumber(2026, 1), "QUOT-2026-0001");
    assert.equal(formatQuotationNumber(2026, 42), "QUOT-2026-0042");
    assert.equal(formatQuotationNumber(2026, 1000), "QUOT-2026-1000");
  });
});

describe("nextSequenceFromLast", () => {
  it("starts at 1 when no number exists yet for the year", () => {
    assert.equal(nextSequenceFromLast(undefined, 2026), 1);
  });

  it("increments the highest number of the same year", () => {
    assert.equal(nextSequenceFromLast("QUOT-2026-0001", 2026), 2);
    assert.equal(nextSequenceFromLast("QUOT-2026-0042", 2026), 43);
    assert.equal(nextSequenceFromLast("QUOT-2026-0999", 2026), 1000);
  });

  it("restarts at 1 after a year rollover", () => {
    assert.equal(nextSequenceFromLast("QUOT-2025-0042", 2026), 1);
  });

  it("ignores numbers from other years even if lexically larger", () => {
    assert.equal(nextSequenceFromLast("QUOT-2027-0007", 2026), 1);
  });

  it("falls back to 1 for malformed values", () => {
    assert.equal(nextSequenceFromLast("NOT-A-NUMBER", 2026), 1);
    assert.equal(nextSequenceFromLast("QUOT-2026-", 2026), 1);
  });

  it("round-trips with formatQuotationNumber", () => {
    const last = formatQuotationNumber(2026, nextSequenceFromLast("QUOT-2026-0004", 2026));
    assert.equal(last, "QUOT-2026-0005");
  });
});