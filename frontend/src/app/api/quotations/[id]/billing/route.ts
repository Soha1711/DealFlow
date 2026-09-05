import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBillingApiUser, toErrorResponse } from "@/app/api/billing/route-helpers";
import { createBillingSchema, quotationIdSchema } from "@/lib/modules/billing/billing-validation";
import { createBillingFromQuotation } from "@/lib/modules/billing/billing-service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/quotations/:id/billing
 * Finance/admin only. Creates hybrid billing for a finalized quotation:
 * one-time lines → ONE_TIME invoice; recurring lines → subscriptions with
 * first-period RECURRING invoices and billing schedules. Atomic and
 * idempotent (duplicate calls return 409).
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const api = await getBillingApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const parsedId = quotationIdSchema.safeParse(id);
    if (!parsedId.success) {
      return toErrorResponse(parsedId.error);
    }

    const parsedBody = createBillingSchema.safeParse({});
    if (!parsedBody.success) {
      return toErrorResponse(parsedBody.error);
    }

    const result = await createBillingFromQuotation(parsedId.data, api.user);
    return NextResponse.json({ data: result });
  } catch (error) {
    return toErrorResponse(error);
  }
} 