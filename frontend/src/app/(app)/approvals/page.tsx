import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { SectionPlaceholder } from "@/components/layout/section-placeholder";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  await requireAreaAccess("approvals");
  return (
    <SectionPlaceholder
      title="Approvals"
      description="Review and approve discount requests against the configured discount governance tiers."
      plannedIn="Phase 2"
    />
  );
}