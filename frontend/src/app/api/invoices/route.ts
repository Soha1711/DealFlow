import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBillingApiUser, toErrorResponse } from "@/app/api/billing/route-helpers";
import { listBillingQuerySchema } from "@/lib/modules/billing/billing-validation";
import { listInvoices } from "@/lib/modules/billing/invoice-service";

/**
 * GET /api/invoices?page=1&pageSize=20&status=&type=&q=
 * Server-side paginated invoice list. Sales reps only ever see invoices for
 * their own quotations; finance/admin/manager see the full tenant list.
 */
export async function GET(request: NextRequest) {
  try {
    const api = await getBillingApiUser();
    if ("error" in api) return api.error;

    const searchParams = request.nextUrl.searchParams;
    const parsed = listBillingQuerySchema.safeParse(
      Object.fromEntries(searchParams)
    );
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const result = await listInvoices(api.user, {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      q: parsed.data.q,
      status: parsed.data.status,
      type: parsed.data.type,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
} 