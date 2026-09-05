import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { listCustomers } from "@/lib/modules/catalog/catalog-service";
import { listProducts } from "@/lib/modules/products/products-service";
import {
  toCustomerOptions,
  toProductOptions,
} from "@/lib/modules/quotations/quotation-options";
import { QuotationForm } from "@/components/quotations/quotation-form";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "New Quotation" };

export default async function NewQuotationPage() {
  await requireAreaAccess("quotations");

  const [customers, products] = await Promise.all([
    listCustomers(),
    listProducts(),
  ]);

  return (
    <>
      <PageHeader
        title="New quotation"
        description="Build a quotation with product lines, discounts and proposal totals."
      />
      <QuotationForm
        mode="create"
        customers={toCustomerOptions(customers)}
        products={toProductOptions(products)}
      />
    </>
  );
}