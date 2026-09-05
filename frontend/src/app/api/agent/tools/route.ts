import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TOOL_POLICIES } from "@/lib/modules/agent/tool-policy";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return NextResponse.json(
      { error: { message: "Authentication required.", code: "UNAUTHENTICATED" } },
      { status: 401 }
    );
  }

  const role = session.user.role;
  const tools = Object.values(TOOL_POLICIES)
    .filter((policy) => policy.allowedRoles.includes(role))
    .map((policy) => ({
      name: policy.name,
      description: policy.description,
      impactLevel: policy.impactLevel,
      requiresConfirmation: policy.requiresConfirmation,
    }));

  return NextResponse.json({ role, tools });
}
