import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { runAgentSchema } from "@/lib/modules/agent/agent-validation";
import { runAgentTask } from "@/lib/modules/agent/agent-runner";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.role) {
      return NextResponse.json(
        { error: { message: "Authentication required.", code: "UNAUTHENTICATED" } },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: { message: "Missing request body.", code: "BAD_REQUEST" } },
        { status: 400 }
      );
    }

    const parsed = runAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            message: "Invalid agent parameters.",
            code: "VALIDATION_ERROR",
            issues: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const result = await runAgentTask({
      prompt: parsed.data.prompt,
      quotationId: parsed.data.quotationId,
      confirmation: parsed.data.confirmation,
      actor: {
        userId: session.user.id,
        role: session.user.role,
        customerId: session.user.customerId,
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
      },
    });

    if (result.status === "AWAITING_CONFIRMATION") {
      return NextResponse.json(result, { status: 422 });
    }

    if (result.status === "FAILED") {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    console.error("Agent API Error:", error);
    const message = error instanceof Error ? error.message : "Internal agent execution error.";
    return NextResponse.json(
      { error: { message, code: "AGENT_EXECUTION_ERROR" } },
      { status: 500 }
    );
  }
}
