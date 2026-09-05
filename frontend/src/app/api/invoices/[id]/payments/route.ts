import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  errorResponse,
  getBillingApiUser,
  toErrorResponse,
} from "@/app/api/billing/route-helpers";
import { invoiceIdSchema, recordPaymentSchema } from "@/lib/modules/billing/billing-validation";
import { recordPayment } from "@/lib/modules/billing/payment-service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/invoices/:id/payments  { amount, method?, reference?, idempotencyKey? }
 * Finance/admin only. Records an internal payment against an issued invoice.
 * The invoice paid amount is recomputed server-side; overpayment is rejected
 * and idempotency keys/external event ids are unique at the DB level so a
 * duplicate request can never double-credit an invoice.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const api = await getBillingApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const parsedId = invoiceIdSchema.safeParse(id);
    if (!parsedId.success) {
      return toErrorResponse(parsedId.error);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse(422, "Request body is required.", "BAD_REQUEST");
    }
    const parsed = recordPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const result = await recordPayment(parsedId.data, api.user, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
} 