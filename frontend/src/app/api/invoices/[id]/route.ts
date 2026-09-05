import { NextResponse } from "next/server";

import { getBillingApiUser, toErrorResponse } from "@/app/api/billing/route-helpers";
import { invoiceIdSchema } from "@/lib/modules/billing/billing-validation";
import { getInvoice } from "@/lib/modules/billing/invoice-service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/invoices/:id
 * Returns a single invoice with its lines, payments, quotation and
 * subscription context. Access is scoped by role (sales rep → own quotes).
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const api = await getBillingApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const parsed = invoiceIdSchema.safeParse(id);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const invoice = await getInvoice(parsed.data, api.user);
    return NextResponse.json({ data: invoice });
  } catch (error) {
    return toErrorResponse(error);
  }
} 