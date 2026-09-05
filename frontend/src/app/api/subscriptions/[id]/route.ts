import { NextResponse } from "next/server";

import { getBillingApiUser, toErrorResponse } from "@/app/api/billing/route-helpers";
import { subscriptionIdSchema } from "@/lib/modules/billing/billing-validation";
import { getSubscription } from "@/lib/modules/billing/subscription-service";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/subscriptions/:id — detail with schedules and billing history. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const api = await getBillingApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const parsed = subscriptionIdSchema.safeParse(id);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const subscription = await getSubscription(parsed.data, api.user);
    return NextResponse.json({ data: subscription });
  } catch (error) {
    return toErrorResponse(error);
  }
} 