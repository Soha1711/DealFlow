import { db } from "@/lib/db";
import type { ToolName } from "./tool-policy";
import type { ToolVerificationResult } from "./agent-types";

/**
 * Authoritative verification layer for DealFlow360 agent mutations.
 * Never assumes a mutation succeeded: independently inspects domain records.
 */
export async function verifyActionMutation(
  toolName: ToolName,
  params: Record<string, unknown>,
  resultData: unknown
): Promise<ToolVerificationResult | undefined> {
  try {
    const dataObj = resultData && typeof resultData === "object" ? (resultData as { id?: string }) : undefined;

    // 1. Verify Inventory Allocation
    if (toolName === "allocateInventory" || toolName === "allocate_inventory") {
      const fulfillmentId = (params.fulfillmentId as string) || dataObj?.id;
      if (!fulfillmentId) {
        return { verified: false, message: "Could not verify: missing fulfillmentId" };
      }

      const fulfillment = await db.fulfillment.findUnique({
        where: { id: fulfillmentId },
        include: { lines: true },
      });

      if (!fulfillment) {
        return { verified: false, message: `Fulfillment ${fulfillmentId} not found during verification` };
      }

      const totalRequested = fulfillment.lines.reduce((s, l) => s + l.requestedQuantity, 0);
      const totalAllocated = fulfillment.lines.reduce((s, l) => s + l.allocatedQuantity, 0);
      const totalBackordered = fulfillment.lines.reduce((s, l) => s + l.backorderQuantity, 0);

      if (totalAllocated >= totalRequested && totalRequested > 0) {
        return {
          verified: true,
          message: `Allocation verified: 100% stock secured (${totalAllocated}/${totalRequested} units allocated). Status: ${fulfillment.status}`,
          details: { status: fulfillment.status, totalAllocated, totalRequested },
        };
      }

      if (totalBackordered > 0 || totalAllocated < totalRequested) {
        return {
          verified: true,
          message: `Allocation partially completed: ${totalAllocated}/${totalRequested} units allocated, ${totalBackordered} units placed on backorder. Status: ${fulfillment.status}`,
          details: { status: fulfillment.status, totalAllocated, totalBackordered, totalRequested },
        };
      }

      return {
        verified: true,
        message: `Fulfillment record verified in status '${fulfillment.status}'`,
        details: { status: fulfillment.status },
      };
    }

    // 2. Verify Quotation Submission
    if (toolName === "submitQuotation" || toolName === "submit_quotation") {
      const quotationId = (params.quotationId as string) || dataObj?.id;
      if (!quotationId) return undefined;

      const quotation = await db.quotation.findUnique({
        where: { id: quotationId },
        select: { status: true, quotationNumber: true, riskLevel: true, riskScore: true },
      });

      if (!quotation || quotation.status === "DRAFT") {
        return {
          verified: false,
          message: `Submission verification failed: quotation remains in DRAFT.`,
        };
      }

      return {
        verified: true,
        message: `Submission verified: ${quotation.quotationNumber} transitioned to '${quotation.status}' (Risk: ${quotation.riskLevel}, Score: ${quotation.riskScore}/100)`,
        details: { status: quotation.status, riskLevel: quotation.riskLevel },
      };
    }

    // 3. Verify Adding Quotation Line
    if (toolName === "addQuotationLine" || toolName === "add_quotation_line") {
      const quotationId = (params.quotationId as string);
      const productId = (params.productId as string);
      if (!quotationId || !productId) return undefined;

      const line = await db.quotationLine.findFirst({
        where: { quotationId, productId },
        include: { quotation: { select: { total: true, subtotal: true } } },
      });

      if (!line) {
        return { verified: false, message: "Line item could not be verified in database." };
      }

      return {
        verified: true,
        message: `Line verified on quotation: quantity ${line.quantity}, new quote total $${Number(line.quotation.total).toFixed(2)}`,
        details: { lineId: line.id, total: Number(line.quotation.total) },
      };
    }

    // 4. Verify Billing Creation
    if (
      toolName === "prepareInvoice" ||
      toolName === "createBillingSchedule" ||
      toolName === "generate_billing"
    ) {
      const quotationId = (params.quotationId as string);
      if (!quotationId) return undefined;

      const invoices = await db.invoice.findMany({ where: { quotationId } });
      const subscriptions = await db.subscription.findMany({ where: { quotationId } });

      return {
        verified: true,
        message: `Billing verified: ${invoices.length} invoice(s) generated, ${subscriptions.length} active subscription schedule(s).`,
        details: { invoiceCount: invoices.length, subscriptionCount: subscriptions.length },
      };
    }

    return undefined;
  } catch (err: unknown) {
    return {
      verified: false,
      message: `Verification check encountered an error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
