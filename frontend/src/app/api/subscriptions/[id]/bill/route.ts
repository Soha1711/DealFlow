import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBillingApiUser, toErrorResponse } from "@/app/api/billing/route-helpers";
import { subscriptionIdSchema } from "@/lib/modules/billing/billing-validation";
import { billSubscription, getSubscription } from "@/lib/modules/billing/subscription-service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/subscriptions/:id/bill
 * Finance/admin only. Generates the invoice + billing schedule for the
 * subscription's next period inside one transaction. Idempotent per period
 * (DB unique (subscriptionId, periodStart)); returns the fresh invoice.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const api = await getBillingApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const parsed = subscriptionIdSchema.safeParse(id);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const result = await billSubscription(parsed.data, api.user);
    const subscription = await getSubscription(parsed.data, api.user);
    const invoice = subscription?.schedules.find(
      (schedule) => schedule.id === result.scheduleId
    )?.invoice;

    return NextResponse.json({
      data: { scheduleId: result.scheduleId, invoiceId: result.invoiceId, invoice },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
} 