import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { listAgentRuns } from "@/lib/modules/agent/agent-audit";
import { listAgentAuditQuerySchema } from "@/lib/modules/agent/agent-validation";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json(
      { error: { message: "Authentication required.", code: "UNAUTHENTICATED" } },
      { status: 401 }
    );
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listAgentAuditQuerySchema.safeParse(params);
  const quotationId = parsed.success ? parsed.data.quotationId : undefined;

  const runs = listAgentRuns(
    {
      userId: session.user.id,
      role: session.user.role,
      customerId: session.user.customerId,
    },
    quotationId
  );

  return NextResponse.json({ runs });
}
