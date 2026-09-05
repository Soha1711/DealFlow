import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { SectionPlaceholder } from "@/components/layout/section-placeholder";

export const metadata: Metadata = { title: "Quotations" };

export default async function QuotationsPage() {
  await requireAreaAccess("quotations");
  return (
    <SectionPlaceholder
      title="Quotations"
      description="Create, price and send customer quotations — including line items and proposal totals."
      plannedIn="Phase 2"
    />
  );
}