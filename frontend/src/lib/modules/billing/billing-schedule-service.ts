import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { assertCanViewBillingArea, type BillingActor } from "./billing-guards";
import type { ListBillingQuery } from "./billing-validation";

/**
 * Billing schedule read service. Schedules describe the periods a
 * subscription bills over (periodStart → periodEnd, dueDate, amount) and the
 * invoice that was generated for each period once it has been billed.
 */

export type ListBillingSchedulesParams = Pick<ListBillingQuery, "page" | "pageSize" | "q" | "status">;

export async function listBillingSchedules(
  actor: BillingActor,
  params: ListBillingSchedulesParams
) {
  assertCanViewBillingArea(actor.role);

  const where: Prisma.BillingScheduleWhereInput = {
    ...(params.status ? { status: params.status as never } : {}),
    ...(actor.role === "SALES_REP"
      ? { subscription: { quotation: { salesRepId: actor.userId } } }
      : {}),
    ...(params.q
      ? {
          OR: [
            { subscription: { customer: { name: { contains: params.q, mode: "insensitive" } } } },
            { subscription: { product: { name: { contains: params.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const total = await db.billingSchedule.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const page = Math.min(params.page, totalPages);

  const data = await db.billingSchedule.findMany({
    where,
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * params.pageSize,
    take: params.pageSize,
    include: {
      subscription: {
        select: {
          id: true,
          billingInterval: true,
          customer: { select: { name: true } },
          product: { select: { name: true } },
        },
      },
      invoice: { select: { id: true, invoiceNumber: true, status: true } },
    },
  });

  return {
    data,
    pagination: { page, pageSize: params.pageSize, total, totalPages },
  };
} 