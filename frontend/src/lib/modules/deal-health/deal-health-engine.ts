import type {
  DealAnomaly,
  DealHealthEvaluationInput,
  DealHealthResult,
  DealRecommendation,
  HealthFactor,
} from "./deal-health-types";

/**
 * Pure, deterministic Deal Health Evaluation Engine.
 *
 * Evaluates real operational signals from quotations, margins, approval depth,
 * warehouse inventory allocations, backorders, billing receivables, customer
 * negotiations and quotation expiry timestamps.
 *
 * Properties:
 * - Deterministic: The exact same deal inputs always return the exact same score.
 * - Zero LLM dependency: All deductions and anomaly triggers are business rules.
 * - Score bounds: Strictly between 0 and 100.
 * - Level mapping:
 *     75–100: HEALTHY
 *     45–74:  AT_RISK
 *     0–44:   CRITICAL
 */
export function evaluateDealHealth(input: DealHealthEvaluationInput): DealHealthResult {
  const now = input.now ? new Date(input.now) : new Date();
  const { quotation, lines, approvals, fulfillments, invoices, negotiations } = input;

  const total = Number(quotation.total);
  const subtotal = Number(quotation.subtotal);
  const margin = Number(quotation.margin);
  const discountTotal = Number(quotation.discountTotal);
  const marginRate = total > 0 ? margin / total : 0;
  const discountPercentAggregate = subtotal > 0 ? (discountTotal / subtotal) * 100 : 0;
  const riskScore = quotation.riskScore ?? 0;

  const factors: HealthFactor[] = [];
  const anomalies: DealAnomaly[] = [];
  const recommendations: DealRecommendation[] = [];

  // Special-case finalized/completed deals:
  const isAllPaid = invoices.length > 0 && invoices.every((i) => i.status === "PAID");
  const isAllFulfilled = fulfillments.length > 0 && fulfillments.every((f) => f.status === "COMPLETED");

  if (quotation.status === "COMPLETED" && isAllPaid && isAllFulfilled) {
    factors.push({
      id: "factor-completed-settled",
      category: "VELOCITY",
      severity: "POSITIVE",
      impact: 0,
      title: "Deal Completed & Fully Settled",
      description: "Quotation fulfilled, invoiced, and paid in full.",
    });

    return {
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      score: 100,
      level: "HEALTHY",
      evaluatedAt: now.toISOString(),
      factors,
      anomalies: [],
      recommendations: [],
      metrics: {
        marginRate,
        total,
        margin,
        discountPercentAggregate,
        riskScore,
        pendingApprovalsCount: 0,
        activeBackorderUnits: 0,
        overdueInvoicesCount: 0,
        activeNegotiationRounds: 0,
      },
    };
  }

  // -------------------------------------------------------------------------
  // 1. DISCOUNT GOVERNANCE
  // -------------------------------------------------------------------------
  if (quotation.riskLevel === "CRITICAL" || riskScore >= 70) {
    factors.push({
      id: "factor-discount-critical",
      category: "DISCOUNT",
      severity: "CRITICAL",
      impact: -20,
      title: "Critical Discount Governance Risk",
      description: `Quotation risk score is ${riskScore}/100, requiring dual manager and finance review.`,
    });
    anomalies.push({
      id: "anomaly-discount-critical",
      code: "CRITICAL_DISCOUNT_OVERAGE",
      severity: "CRITICAL",
      title: "Severe Discount Variance",
      description: `Discount risk score (${riskScore}/100) significantly exceeds standard product limits.`,
      suggestedAction: "Obtain formal commercial justification from Finance and Executive Management.",
    });
    recommendations.push({
      id: "rec-discount-critical",
      priority: "HIGH",
      category: "DISCOUNT",
      action: "Review deep discount terms with Sales Manager and Finance.",
      reason: "Discount levels require dual-level governance clearance.",
    });
  } else if (quotation.riskLevel === "HIGH" || riskScore >= 40) {
    factors.push({
      id: "factor-discount-high",
      category: "DISCOUNT",
      severity: "WARNING",
      impact: -14,
      title: "High Discount Overage",
      description: `Quotation risk score is ${riskScore}/100, requiring manager clearance.`,
    });
    recommendations.push({
      id: "rec-discount-high",
      priority: "MEDIUM",
      category: "DISCOUNT",
      action: "Confirm discount margin rationale with Sales Management.",
      reason: "Discount exceeded standard product allowance.",
    });
  } else if (quotation.riskLevel === "MEDIUM" || riskScore >= 1) {
    factors.push({
      id: "factor-discount-medium",
      category: "DISCOUNT",
      severity: "INFO",
      impact: -7,
      title: "Moderate Discount Applied",
      description: `Quotation has a discount risk score of ${riskScore}/100.`,
    });
  } else {
    factors.push({
      id: "factor-discount-healthy",
      category: "DISCOUNT",
      severity: "POSITIVE",
      impact: 0,
      title: "Authorized Discount Range",
      description: "All quotation line discounts are within standard catalog limits.",
    });
  }

  // -------------------------------------------------------------------------
  // 2. MARGIN HEALTH
  // -------------------------------------------------------------------------
  if (margin < 0) {
    factors.push({
      id: "factor-margin-negative",
      category: "MARGIN",
      severity: "CRITICAL",
      impact: -30,
      title: "Negative Deal Margin",
      description: `Deal yields negative margin (-$${Math.abs(margin).toFixed(2)}). Total revenue does not cover costs.`,
    });
    anomalies.push({
      id: "anomaly-margin-negative",
      code: "NEGATIVE_MARGIN",
      severity: "CRITICAL",
      title: "Loss-Making Transaction",
      description: `Total deal margin is negative (-$${Math.abs(margin).toFixed(2)}).`,
      suggestedAction: "Immediately revise quotation lines to recover positive profitability.",
    });
    recommendations.push({
      id: "rec-margin-negative",
      priority: "HIGH",
      category: "MARGIN",
      action: "Restructure deal pricing to eliminate negative margin.",
      reason: "Current proposal loses money on every delivered unit.",
    });
  } else if (total > 0 && marginRate < 0.10) {
    factors.push({
      id: "factor-margin-razor-thin",
      category: "MARGIN",
      severity: "WARNING",
      impact: -15,
      title: "Razor-Thin Profit Margin (< 10%)",
      description: `Deal margin rate is ${(marginRate * 100).toFixed(1)}%, below the 10% target threshold.`,
    });
    anomalies.push({
      id: "anomaly-margin-razor-thin",
      code: "RAZOR_THIN_MARGIN",
      severity: "HIGH",
      title: "Compressed Commercial Margin",
      description: `Gross margin is ${(marginRate * 100).toFixed(1)}%, leaving insufficient operational buffer.`,
      suggestedAction: "Review potential price adjustments or bundle recurring software services.",
    });
  } else if (total > 0 && marginRate < 0.20) {
    factors.push({
      id: "factor-margin-low",
      category: "MARGIN",
      severity: "INFO",
      impact: -8,
      title: "Moderate Profit Margin (10%–20%)",
      description: `Deal margin rate is ${(marginRate * 100).toFixed(1)}%.`,
    });
  } else {
    factors.push({
      id: "factor-margin-healthy",
      category: "MARGIN",
      severity: "POSITIVE",
      impact: 0,
      title: "Healthy Profit Margin",
      description: `Deal margin rate is ${(marginRate * 100).toFixed(1)}% (strong commercial profitability).`,
    });
  }

  // Individual line margin check
  const lossMakingLines = lines.filter((l) => Number(l.margin) < 0);
  if (lossMakingLines.length > 0) {
    factors.push({
      id: "factor-loss-making-lines",
      category: "MARGIN",
      severity: "WARNING",
      impact: -10,
      title: `${lossMakingLines.length} Loss-Making Line(s) Detected`,
      description: "One or more individual line items sell below cost.",
    });
    anomalies.push({
      id: "anomaly-loss-making-line",
      code: "LOSS_MAKING_LINE",
      severity: "HIGH",
      title: "Unprofitable Line Item",
      description: `${lossMakingLines.length} product line(s) have negative margins.`,
      suggestedAction: "Adjust line discounts so unit price exceeds unit cost.",
    });
  }

  // -------------------------------------------------------------------------
  // 3. APPROVAL BOTTLENECKS
  // -------------------------------------------------------------------------
  const rejectedApprovals = approvals.filter((a) => a.status === "REJECTED");
  if (rejectedApprovals.length > 0) {
    factors.push({
      id: "factor-approval-rejected",
      category: "APPROVAL",
      severity: "CRITICAL",
      impact: -25,
      title: "Commercial Approval Rejected",
      description: `Approval rejected by ${rejectedApprovals[0].approver?.name ?? "reviewer"}${rejectedApprovals[0].reason ? `: "${rejectedApprovals[0].reason}"` : "."}`,
    });
    anomalies.push({
      id: "anomaly-approval-rejected",
      code: "REJECTED_APPROVAL",
      severity: "CRITICAL",
      title: "Executive Approval Rejection",
      description: "Quotation was formally rejected during internal review.",
      suggestedAction: "Review rejection feedback and reconstruct quotation terms.",
    });
    recommendations.push({
      id: "rec-approval-rejected",
      priority: "HIGH",
      category: "APPROVAL",
      action: "Revise quotation terms based on reviewer rejection feedback.",
      reason: "Quotation cannot proceed without resolving approval concerns.",
    });
  }

  const pendingApprovals = approvals.filter((a) => a.status === "PENDING");
  for (const pa of pendingApprovals) {
    const ageHours = (now.getTime() - new Date(pa.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours > 72) {
      factors.push({
        id: `factor-approval-stalled-${pa.id}`,
        category: "APPROVAL",
        severity: "WARNING",
        impact: -15,
        title: `Stalled ${pa.level} Approval (${Math.floor(ageHours / 24)}d)`,
        description: `Approval has been awaiting ${pa.level.toLowerCase()} review for more than 3 days.`,
      });
      anomalies.push({
        id: `anomaly-approval-stalled-${pa.id}`,
        code: "STALLED_APPROVAL",
        severity: "HIGH",
        title: `Stalled ${pa.level} Approval Review`,
        description: `Pending ${pa.level} review for ${Math.floor(ageHours / 24)} days.`,
        suggestedAction: `Follow up with ${pa.level === "MANAGER" ? "Sales Management" : "Finance"} to expedite approval.`,
      });
      recommendations.push({
        id: `rec-approval-stalled-${pa.id}`,
        priority: "HIGH",
        category: "APPROVAL",
        action: `Escalate pending ${pa.level.toLowerCase()} review to prevent pipeline stall.`,
        reason: `Pending approval age (${Math.floor(ageHours / 24)} days) exceeds SLA.`,
      });
    } else {
      factors.push({
        id: `factor-approval-pending-${pa.id}`,
        category: "APPROVAL",
        severity: "INFO",
        impact: -6,
        title: `Pending ${pa.level} Approval`,
        description: `Quotation is currently under ${pa.level.toLowerCase()} review.`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. FULFILLMENT & INVENTORY RISKS
  // -------------------------------------------------------------------------
  let activeBackorderUnits = 0;
  for (const f of fulfillments) {
    for (const fl of f.lines) {
      activeBackorderUnits += fl.backorderQuantity;
    }
  }

  if (activeBackorderUnits > 0) {
    factors.push({
      id: "factor-fulfillment-backorder",
      category: "FULFILLMENT",
      severity: "CRITICAL",
      impact: -20,
      title: `Active Backorder (${activeBackorderUnits} units)`,
      description: "One or more order lines cannot be fulfilled from current stock.",
    });
    anomalies.push({
      id: "anomaly-fulfillment-backorder",
      code: "ACTIVE_BACKORDER",
      severity: "CRITICAL",
      title: "Fulfillment Backorder Alert",
      description: `${activeBackorderUnits} item(s) are on backorder, risking delivery SLA.`,
      suggestedAction: "Coordinate with Operations on replenishment or regional warehouse transfer.",
    });
    recommendations.push({
      id: "rec-fulfillment-backorder",
      priority: "HIGH",
      category: "FULFILLMENT",
      action: "Review backorder replenishment schedule with Operations.",
      reason: `${activeBackorderUnits} unit(s) are currently backordered.`,
    });
  }

  const partiallyAllocated = fulfillments.some((f) => f.status === "PARTIALLY_ALLOCATED");
  if (partiallyAllocated && activeBackorderUnits === 0) {
    factors.push({
      id: "factor-fulfillment-partial-allocation",
      category: "FULFILLMENT",
      severity: "WARNING",
      impact: -6,
      title: "Partial Warehouse Allocation",
      description: "Order is only partially allocated across warehouses.",
    });
  }

  // Pre-fulfillment stock check for approved or confirmed quotations without fulfillment
  if (fulfillments.length === 0 && (quotation.status === "APPROVED" || quotation.status === "CONFIRMED")) {
    let stockShortageCount = 0;
    for (const line of lines) {
      if (line.product && !line.product.isRecurring && line.product.inventory) {
        const available = line.product.inventory.reduce(
          (sum, inv) => sum + Math.max(0, inv.quantity - inv.reservedQuantity),
          0
        );
        if (available < line.quantity) {
          stockShortageCount += 1;
        }
      }
    }

    if (stockShortageCount > 0) {
      factors.push({
        id: "factor-pre-fulfillment-shortage",
        category: "FULFILLMENT",
        severity: "WARNING",
        impact: -12,
        title: "Insufficient Available Stock for Order",
        description: `${stockShortageCount} physical line(s) exceed unreserved warehouse inventory.`,
      });
      anomalies.push({
        id: "anomaly-pre-fulfillment-shortage",
        code: "INSUFFICIENT_STOCK",
        severity: "MEDIUM",
        title: "Pre-Fulfillment Stock Shortage",
        description: "Available unreserved inventory is insufficient to fulfill this order immediately.",
        suggestedAction: "Alert Operations to reserve upcoming stock or schedule replenishment.",
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5. BILLING & PAYMENT RISKS
  // -------------------------------------------------------------------------
  const overdueInvoices = invoices.filter((inv) => {
    if (inv.status === "OVERDUE") return true;
    if (inv.status === "ISSUED" && inv.dueDate) {
      return new Date(inv.dueDate).getTime() < now.getTime();
    }
    return false;
  });

  if (overdueInvoices.length > 0) {
    factors.push({
      id: "factor-billing-overdue",
      category: "BILLING",
      severity: "CRITICAL",
      impact: -25,
      title: `Overdue Invoices (${overdueInvoices.length})`,
      description: "One or more invoices have passed their contractual payment due date.",
    });
    anomalies.push({
      id: "anomaly-billing-overdue",
      code: "OVERDUE_INVOICE",
      severity: "CRITICAL",
      title: "Delinquent Accounts Receivable",
      description: `${overdueInvoices.length} invoice(s) are past due date with unpaid balance.`,
      suggestedAction: "Follow up with customer accounts payable contact for payment status.",
    });
    recommendations.push({
      id: "rec-billing-overdue",
      priority: "HIGH",
      category: "BILLING",
      action: "Initiate payment follow-up with customer finance team.",
      reason: `${overdueInvoices.length} invoice(s) are overdue.`,
    });
  }

  const hasFailedPayment = invoices.some((inv) =>
    inv.payments?.some((p) => p.status === "FAILED")
  );
  if (hasFailedPayment) {
    factors.push({
      id: "factor-payment-failed",
      category: "BILLING",
      severity: "WARNING",
      impact: -20,
      title: "Failed Payment Transaction",
      description: "An electronic payment transaction attempt for this deal failed.",
    });
    anomalies.push({
      id: "anomaly-payment-failed",
      code: "FAILED_PAYMENT",
      severity: "HIGH",
      title: "Payment Transaction Failure",
      description: "A payment charge failed to process.",
      suggestedAction: "Request alternative payment method from customer.",
    });
  }

  const hasPartiallyPaid = invoices.some((inv) => inv.status === "PARTIALLY_PAID");
  if (hasPartiallyPaid && overdueInvoices.length === 0) {
    factors.push({
      id: "factor-billing-partially-paid",
      category: "BILLING",
      severity: "INFO",
      impact: -8,
      title: "Partially Paid Invoices",
      description: "Customer has paid a portion of the invoice balance.",
    });
  }

  // -------------------------------------------------------------------------
  // 6. NEGOTIATION RISKS
  // -------------------------------------------------------------------------
  if (quotation.status === "UNDER_NEGOTIATION") {
    const activeNegotiation = negotiations.find(
      (n) => n.status === "PENDING" || n.status === "COUNTERED"
    );

    if (activeNegotiation) {
      const negAgeHours =
        (now.getTime() - new Date(activeNegotiation.createdAt).getTime()) / (1000 * 60 * 60);

      if (negAgeHours > 120) {
        // > 5 days
        factors.push({
          id: "factor-negotiation-stalled",
          category: "NEGOTIATION",
          severity: "WARNING",
          impact: -15,
          title: `Stalled Customer Negotiation (${Math.floor(negAgeHours / 24)}d)`,
          description: "Active negotiation round has remained unanswered for more than 5 days.",
        });
        anomalies.push({
          id: "anomaly-negotiation-stalled",
          code: "STALLED_NEGOTIATION",
          severity: "MEDIUM",
          title: "Stalled Deal Negotiation",
          description: `Negotiation round open for ${Math.floor(negAgeHours / 24)} days.`,
          suggestedAction: "Contact customer to review requested terms and submit counter-offer.",
        });
        recommendations.push({
          id: "rec-negotiation-stalled",
          priority: "HIGH",
          category: "NEGOTIATION",
          action: "Respond to customer negotiation to keep deal moving.",
          reason: "Negotiation has been waiting for more than 5 days.",
        });
      } else {
        factors.push({
          id: "factor-negotiation-active",
          category: "NEGOTIATION",
          severity: "INFO",
          impact: -7,
          title: "Active Customer Negotiation",
          description: "Quotation is currently under commercial terms negotiation with the customer.",
        });
        recommendations.push({
          id: "rec-negotiation-active",
          priority: "MEDIUM",
          category: "NEGOTIATION",
          action: "Review customer negotiation request on quotation detail page.",
          reason: "Customer requested pricing or quantity modifications.",
        });
      }
    }
  }

  if (negotiations.length >= 3) {
    factors.push({
      id: "factor-negotiation-protracted",
      category: "NEGOTIATION",
      severity: "WARNING",
      impact: -10,
      title: `Protracted Negotiations (${negotiations.length} rounds)`,
      description: "Quotation has undergone 3 or more rounds of counter-proposals.",
    });
    anomalies.push({
      id: "anomaly-negotiation-protracted",
      code: "PROTRACTED_NEGOTIATION",
      severity: "MEDIUM",
      title: "Protracted Deal Negotiation",
      description: `${negotiations.length} negotiation rounds indicate deal terms friction.`,
      suggestedAction: "Schedule a direct alignment conversation with the customer stakeholder.",
    });
  }

  // -------------------------------------------------------------------------
  // 7. QUOTATION EXPIRY & VALIDITY
  // -------------------------------------------------------------------------
  const isUnfinalized =
    quotation.status === "DRAFT" ||
    quotation.status === "PENDING_APPROVAL" ||
    quotation.status === "PENDING_MANAGER" ||
    quotation.status === "PENDING_FINANCE" ||
    quotation.status === "APPROVED" ||
    quotation.status === "UNDER_NEGOTIATION";

  if (isUnfinalized && quotation.validUntil) {
    const hoursUntilExpiry =
      (new Date(quotation.validUntil).getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilExpiry < 0) {
      factors.push({
        id: "factor-expiry-expired",
        category: "EXPIRY",
        severity: "CRITICAL",
        impact: -25,
        title: "Quotation Has Expired",
        description: `Quotation validity expired on ${new Date(quotation.validUntil).toLocaleDateString()}.`,
      });
      anomalies.push({
        id: "anomaly-expiry-expired",
        code: "EXPIRED_QUOTATION",
        severity: "CRITICAL",
        title: "Expired Quotation",
        description: "Quotation validity period has elapsed.",
        suggestedAction: "Review pricing validity and reissue an extended quotation.",
      });
      recommendations.push({
        id: "rec-expiry-expired",
        priority: "HIGH",
        category: "EXPIRY",
        action: "Extend quotation validity date before proceeding.",
        reason: "Customer cannot accept an expired proposal.",
      });
    } else if (hoursUntilExpiry <= 72) {
      factors.push({
        id: "factor-expiry-72h",
        category: "EXPIRY",
        severity: "WARNING",
        impact: -15,
        title: "Quotation Expiring Within 72 Hours",
        description: `Quotation validity ends in ${Math.max(1, Math.floor(hoursUntilExpiry / 24))} day(s).`,
      });
      anomalies.push({
        id: "anomaly-expiry-soon",
        code: "EXPIRING_SOON",
        severity: "HIGH",
        title: "Imminent Expiry Warning",
        description: "Quotation will expire in less than 3 days.",
        suggestedAction: "Reach out to customer to confirm acceptance before expiration.",
      });
      recommendations.push({
        id: "rec-expiry-72h",
        priority: "HIGH",
        category: "EXPIRY",
        action: "Follow up with customer contact before quote expires.",
        reason: "Quotation terms expire within 72 hours.",
      });
    } else if (hoursUntilExpiry <= 168) {
      factors.push({
        id: "factor-expiry-7d",
        category: "EXPIRY",
        severity: "INFO",
        impact: -6,
        title: "Quotation Expiring Within 7 Days",
        description: `Validity ends on ${new Date(quotation.validUntil).toLocaleDateString()}.`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 8. STAGNATION & VELOCITY
  // -------------------------------------------------------------------------
  if (quotation.status === "DRAFT") {
    const draftAgeDays =
      (now.getTime() - new Date(quotation.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (draftAgeDays > 14) {
      factors.push({
        id: "factor-draft-stagnant",
        category: "VELOCITY",
        severity: "WARNING",
        impact: -10,
        title: `Stagnant Draft Proposal (${Math.floor(draftAgeDays)}d)`,
        description: "Draft has not been submitted for review for more than 14 days.",
      });
      anomalies.push({
        id: "anomaly-draft-stagnant",
        code: "STAGNANT_DRAFT",
        severity: "LOW",
        title: "Stale Draft Proposal",
        description: "Quotation draft is inactive.",
        suggestedAction: "Finalize deal pricing and submit for review or archive.",
      });
      recommendations.push({
        id: "rec-draft-stagnant",
        priority: "MEDIUM",
        category: "VELOCITY",
        action: "Submit draft for commercial review or clean up stale proposal.",
        reason: "Draft has remained untouched for more than 2 weeks.",
      });
    }
  }

  // -------------------------------------------------------------------------
  // FINAL SCORE & LEVEL CALCULATION
  // -------------------------------------------------------------------------
  const totalDeductions = factors.reduce((sum, f) => sum + Math.abs(f.impact), 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - totalDeductions)));

  let level: "HEALTHY" | "AT_RISK" | "CRITICAL";
  if (score >= 75) {
    level = "HEALTHY";
  } else if (score >= 45) {
    level = "AT_RISK";
  } else {
    level = "CRITICAL";
  }

  return {
    quotationId: quotation.id,
    quotationNumber: quotation.quotationNumber,
    score,
    level,
    evaluatedAt: now.toISOString(),
    factors,
    anomalies,
    recommendations,
    metrics: {
      marginRate,
      total,
      margin,
      discountPercentAggregate,
      riskScore,
      pendingApprovalsCount: pendingApprovals.length,
      activeBackorderUnits,
      overdueInvoicesCount: overdueInvoices.length,
      activeNegotiationRounds: negotiations.length,
    },
  };
}
