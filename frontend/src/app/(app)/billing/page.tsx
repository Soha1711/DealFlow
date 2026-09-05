import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { SectionPlaceholder } from "@/components/layout/section-placeholder";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  await requireAreaAccess("billing");
  return (
    <SectionPlaceholder
      title="Billing"
      description="Invoice generation, payments and subscription billing for delivered business."
      plannedIn="Phase 4"
    />
  );
}