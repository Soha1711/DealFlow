import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBillingApiUser, toErrorResponse } from "@/app/api/billing/route-helpers";
import { invoiceActionSchema, invoiceIdSchema } from "@/lib/modules/billing/billing-validation";
import { issueInvoice } from "@/lib/modules/billing/invoice-service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/invoices/:id/issue
 * Finance/admin only. Transitions the invoice DRAFT → ISSUED, stamps issue
 * and due dates, and moves any linked billing schedule to DUE.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const api = await getBillingApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const parsedId = invoiceIdSchema.safeParse(id);
    if (!parsedId.success) {
      return toErrorResponse(parsedId.error);
    }
    // No body accepted — issue is purely server-driven.
    const parsedBody = invoiceActionSchema.safeParse({});
    if (!parsedBody.success) {
      return toErrorResponse(parsedBody.error);
    }

    const invoice = await issueInvoice(parsedId.data, api.user);
    return NextResponse.json({ data: invoice });
  } catch (error) {
    return toErrorResponse(error);
  }
} 