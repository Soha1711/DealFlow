import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { SectionPlaceholder } from "@/components/layout/section-placeholder";

export const metadata: Metadata = { title: "Fulfillment" };

export default async function FulfillmentPage() {
  await requireAreaAccess("fulfillment");
  return (
    <SectionPlaceholder
      title="Fulfillment"
      description="Allocate inventory across warehouses and manage the delivery of approved orders."
      plannedIn="Phase 3"
    />
  );
}