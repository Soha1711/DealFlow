import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  conflict,
  forbidden,
  notFound,
} from "./approval-errors";
import { assertCanActOnApproval, canViewApprovals, type ApprovalActor } from "./approval-guards";
import { calculateDiscountRisk } from "./discount-risk";
import { resolveApprovalTransition } from "./approval-transitions";
import type { ListApprovalsQuery } from "./approval-validation";

/**
 * Approval workflow service.
 *
 * Every action follows the same server-side sequence: authenticate the caller
 * (done by the API layer), authorize the role/level and self-approval rules,
 * fetch the current state, verify the approval is still PENDING, then update
 * the approval and the quotation atomically. Concurrent actions on the same
 * approval serialize on the row lock taken by a conditional `updateMany`;
 * the loser observes zero claimed rows and receives a 409 conflict.
 *
 * Note: this module intentionally does not import `server-only` so the
 * workflow can be exercised by integration tests. It is only imported from
 * server code paths.
 */

type QuotationStatus = import("@prisma/client").QuotationStatus;

const approvalWithQuotation = {
  quotation: {
    include: {
      customer: true,
      salesRep: { select: { id: true, name: true, email: true } },
      lines: {
        orderBy: { createdAt: "asc" as const },
        include: { product: true },
      },
    },
  },
} as const;

const approvalInclude = {
  approver: { select: { id: true, name: true, email: true } },
} as const;

/**
 * Runs the deterministic discount check for a freshly submitted quotation and
 * routes it: DRAFT → DISCOUNT_CHECK → (APPROVED | PENDING_MANAGER), creating
 * the manager approval record when one is required. Called from inside the
 * quotation submit transaction so numbering, pricing and routing are atomic.
 */
export async function routeSubmittedQuotation(
  tx: Prisma.TransactionClient,
  quotationId: string
): Promise<{ quotationId: string; risk: ReturnType<typeof calculateDiscountRisk> }> {
  const quotation = await tx.quotation.findUnique({
    where: { id: quotationId },
    include: { lines: { include: { product: true } } },
  });
  if (!quotation) {
    throw notFound("Quotation not found.");
  }

  const risk = calculateDiscountRisk(
    quotation.lines.map((line) => ({
      discountPercent: line.discountPercent,
      maxDiscountPercent: line.product.maxDiscountPercent,
      lineTotal: line.lineTotal,
      margin: line.margin,
    }))
  );

  // DRAFT → DISCOUNT_CHECK — the evaluation stage. Transient within this
  // transaction; the final status below is what observers ever see.
  await tx.quotation.update({
    where: { id: quotationId },
    data: {
      status: "DISCOUNT_CHECK",
      riskScore: risk.score,
      riskLevel: risk.level,
      requiredApprovalLevel: risk.requiredApprovalLevel,
    },
  });

  if (risk.level === "LOW") {
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "APPROVED" },
    });
    return { quotationId, risk };
  }

  await tx.quotation.update({
    where: { id: quotationId },
    data: { status: "PENDING_MANAGER" },
  });
  await tx.approval.create({
    data: { quotationId, level: "MANAGER", status: "PENDING" },
  });

  return { quotationId, risk };
}

export type ApprovalQueueParams = Pick<
  ListApprovalsQuery,
  "page" | "pageSize" | "status" | "level"
>;

export async function listApprovalQueue(
  actor: ApprovalActor,
  params: ApprovalQueueParams
) {
  if (!canViewApprovals(actor.role)) {
    throw forbidden("You do not have access to approvals.", "FORBIDDEN");
  }

  const where: Prisma.ApprovalWhereInput = {
    // The queue shows pending work by default; explicit filters override.
    ...(params.status ? { status: params.status } : { status: "PENDING" }),
    // Role-scoped visibility: managers see manager stages, finance sees
    // finance stages, admins see everything.
    ...(params.level
      ? { level: params.level }
      : actor.role === "SALES_MANAGER"
        ? { level: "MANAGER" }
        : actor.role === "FINANCE"
          ? { level: "FINANCE" }
          : {}),
  };

  const total = await db.approval.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const page = Math.min(params.page, totalPages);

  const data = await db.approval.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * params.pageSize,
    take: params.pageSize,
    include: {
      approver: { select: { id: true, name: true } },
      quotation: {
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          total: true,
          margin: true,
          riskScore: true,
          riskLevel: true,
          requiredApprovalLevel: true,
          customer: { select: { id: true, name: true } },
          salesRep: { select: { id: true, name: true } },
        },
      },
    },
  });

  return {
    data,
    pagination: { page, pageSize: params.pageSize, total, totalPages },
  };
}

export async function getApprovalDetail(approvalId: string, actor: ApprovalActor) {
  if (!canViewApprovals(actor.role)) {
    throw forbidden("You do not have access to approvals.", "FORBIDDEN");
  }

  const approval = await db.approval.findUnique({
    where: { id: approvalId },
    include: {
      ...approvalInclude,
      ...approvalWithQuotation,
    },
  });
  if (!approval) {
    throw notFound("Approval not found.");
  }

  // Role-scoped visibility mirrors the queue: managers see manager stages,
  // finance sees finance stages, admins see everything.
  if (actor.role === "SALES_MANAGER" && approval.level !== "MANAGER") {
    throw forbidden(
      "Sales managers can only view manager-level approvals.",
      "FORBIDDEN"
    );
  }
  if (actor.role === "FINANCE" && approval.level !== "FINANCE") {
    throw forbidden(
      "Finance can only view finance-level approvals.",
      "FORBIDDEN"
    );
  }

  return approval;
}

/** All approvals for a quotation (approval chain display on the quote page). */
export async function listApprovalsForQuotation(quotationId: string) {
  return db.approval.findMany({
    where: { quotationId },
    orderBy: { createdAt: "asc" },
    include: {
      approver: { select: { id: true, name: true, email: true } },
    },
  });
}

async function loadApprovalForAction(approvalId: string) {
  const approval = await db.approval.findUnique({ where: { id: approvalId } });
  if (!approval) {
    throw notFound("Approval not found.");
  }
  const quotation = await db.quotation.findUnique({
    where: { id: approval.quotationId },
  });
  if (!quotation) {
    throw notFound("Quotation not found.");
  }
  return { approval, quotation };
}

type ApprovalOutcome = {
  approvalId: string;
  approvalStatus: import("@prisma/client").ApprovalStatus;
  nextQuotationStatus: QuotationStatus;
  financeApprovalId: string | null;
};

async function actOnApproval(
  approvalId: string,
  actor: ApprovalActor,
  action: "approve" | "reject",
  reason?: string
): Promise<ApprovalOutcome> {
  // 1–5: fetch current state, authorize role/level and self-approval rules.
  const { approval, quotation } = await loadApprovalForAction(approvalId);
  assertCanActOnApproval({
    actor,
    level: approval.level,
    salesRepId: quotation.salesRepId,
  });

  // 6–7: claim + transition atomically. The conditional updateMany is the
  // concurrency guard — a stale or duplicate request claims zero rows.
  return db.$transaction(async (tx) => {
    const current = await tx.approval.findUnique({ where: { id: approvalId } });
    if (!current) {
      throw notFound("Approval not found.");
    }
    const currentQuotation = await tx.quotation.findUnique({
      where: { id: current.quotationId },
    });
    if (!currentQuotation) {
      throw notFound("Quotation not found.");
    }

    const transition = resolveApprovalTransition(
      {
        approvalStatus: current.status,
        approvalLevel: current.level,
        quotationStatus: currentQuotation.status,
        requiredApprovalLevel: currentQuotation.requiredApprovalLevel,
      },
      action
    );
    if (!transition.ok) {
      throw conflict(transition.message, "APPROVAL_STATE_CONFLICT");
    }

    const claimed = await tx.approval.updateMany({
      where: { id: approvalId, status: "PENDING" },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        approverId: actor.userId,
        ...(reason !== undefined ? { reason } : {}),
        actedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw conflict(
        "This approval has already been acted on.",
        "APPROVAL_ALREADY_ACTED"
      );
    }

    // CRITICAL quotes: finance approval becomes active only after the manager
    // stage completes (approve only — a rejection never spawns one).
    let financeApprovalId: string | null = null;
    if (
      action === "approve" &&
      current.level === "MANAGER" &&
      transition.nextQuotationStatus === "PENDING_FINANCE"
    ) {
      const finance = await tx.approval.create({
        data: {
          quotationId: current.quotationId,
          level: "FINANCE",
          status: "PENDING",
        },
      });
      financeApprovalId = finance.id;
    }

    await tx.quotation.update({
      where: { id: current.quotationId },
      data: { status: transition.nextQuotationStatus },
    });

    return {
      approvalId: current.id,
      approvalStatus: action === "approve" ? "APPROVED" : "REJECTED",
      nextQuotationStatus: transition.nextQuotationStatus,
      financeApprovalId,
    };
  });
}

export async function approveApproval(approvalId: string, actor: ApprovalActor) {
  return actOnApproval(approvalId, actor, "approve");
}

export async function rejectApproval(
  approvalId: string,
  actor: ApprovalActor,
  reason: string
) {
  return actOnApproval(approvalId, actor, "reject", reason);
}