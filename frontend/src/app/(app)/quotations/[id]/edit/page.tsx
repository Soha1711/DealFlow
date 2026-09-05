import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireAreaAccess } from "@/lib/auth-guards";
import { listCustomers } from "@/lib/modules/catalog/catalog-service";
import { listProducts } from "@/lib/modules/products/products-service";
import { canEditQuotation } from "@/lib/modules/quotations/guards";
import {
  toCustomerOptions,
  toProductOptions,
} from "@/lib/modules/quotations/quotation-options";
import { getQuotation } from "@/lib/modules/quotations/quotation-service";
import { QuotationForm } from "@/components/quotations/quotation-form";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Edit Quotation" };

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAreaAccess("quotations");
  const { id } = await params;

  const quotation = await getQuotation(id);
  if (!quotation) notFound();

  if (
    !canEditQuotation({
      role: user.role,
      userId: user.id,
      salesRepId: quotation.salesRepId,
      status: quotation.status,
    })
  ) {
    redirect(`/quotations/${id}`);
  }

  const [customers, products] = await Promise.all([
    listCustomers(),
    listProducts(),
  ]);

  return (
    <>
      <PageHeader
        title={`Edit ${quotation.quotationNumber}`}
        description="Update the draft and save, or submit it for approval."
      />
      <QuotationForm
        mode="edit"
        quotationId={quotation.id}
        customers={toCustomerOptions(customers)}
        products={toProductOptions(products)}
        initial={{
          customerId: quotation.customerId,
          validUntil: quotation.validUntil
            ? toDateInputValue(quotation.validUntil)
            : null,
          lines: quotation.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: Number(line.unitPrice.toString()),
            discountPercent: line.discountPercent,
          })),
        }}
      />
    </>
  );
}