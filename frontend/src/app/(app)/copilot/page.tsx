import { db } from "@/lib/db";
import { requireAreaAccess } from "@/lib/auth-guards";
import { DealCopilotClient } from "./deal-copilot-client";

export default async function DealCopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ quotationId?: string; prompt?: string }>;
}) {
  const user = await requireAreaAccess("copilot");
  const params = await searchParams;

  const where =
    user.role === "SALES_REP"
      ? { salesRepId: user.id }
      : user.role === "CUSTOMER" && user.customerId
      ? { customerId: user.customerId }
      : {};

  const quotations = await db.quotation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 25,
    select: {
      id: true,
      quotationNumber: true,
      status: true,
      total: true,
      customer: { select: { name: true } },
    },
  });

  const formattedQuotations = quotations.map((q) => ({
    id: q.id,
    quotationNumber: q.quotationNumber,
    status: q.status,
    customerName: q.customer.name,
    total: Number(q.total),
  }));

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      <DealCopilotClient
        initialQuotations={formattedQuotations}
        preselectedQuotationId={params.quotationId}
        preselectedPrompt={params.prompt}
        userRole={user.role}
      />
    </div>
  );
}
