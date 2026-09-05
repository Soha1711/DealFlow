import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { SectionPlaceholder } from "@/components/layout/section-placeholder";

export const metadata: Metadata = { title: "Deal Health" };

export default async function DealHealthPage() {
  await requireAreaAccess("deal-health");
  return (
    <SectionPlaceholder
      title="Deal Health"
      description="AI-assisted insights into quotation performance, negotiation posture and pipeline health."
      plannedIn="Phase 5"
    />
  );
}