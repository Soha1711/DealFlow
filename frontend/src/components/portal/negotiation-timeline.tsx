"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MessageSquare, Send } from "lucide-react";
import type { NegotiationStatus } from "@prisma/client";

import { formatDate } from "@/lib/format";
import {
  NEGOTIATION_STATUS_BADGE_CLASSES,
  NEGOTIATION_STATUS_LABELS,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type NegotiationItem = {
  id: string;
  status: NegotiationStatus;
  message: string;
  responseMessage: string | null;
  createdAt: Date | string;
  actedAt: Date | string | null;
  createdBy?: { name: string; email: string };
  actedBy?: { name: string; email: string } | null;
  proposedChanges?: unknown;
};

export function NegotiationTimeline({
  negotiations = [],
}: {
  negotiations: NegotiationItem[];
  customerId?: string;
}) {
  const router = useRouter();
  const [activeNegotiationId, setActiveNegotiationId] = useState<string | null>(null);
  const [responseMsg, setResponseMsg] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (negotiations.length === 0) {
    return null;
  }

  async function handleRespond(negotiationId: string) {
    if (responseMsg.trim().length < 2) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/negotiations/${negotiationId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: responseMsg.trim() }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error?.message ?? "Failed to respond.");
        return;
      }
      setActiveNegotiationId(null);
      setResponseMsg("");
      router.refresh();
    } catch {
      setError("Failed to respond.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-foreground">
        Negotiation History & Messages
      </h3>
      <div className="flex flex-col gap-3">
        {negotiations.map((item, index) => (
          <div
            key={item.id}
            className="rounded-lg border border-border bg-white p-4 text-sm shadow-2xs"
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">
                  Round {negotiations.length - index}
                </span>
                <Badge className={NEGOTIATION_STATUS_BADGE_CLASSES[item.status]}>
                  {NEGOTIATION_STATUS_LABELS[item.status]}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDate(new Date(item.createdAt))}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <div className="rounded-md bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Your Request ({item.createdBy?.name ?? "Customer"}):
                </p>
                <p className="mt-1 whitespace-pre-wrap text-foreground">
                  {item.message}
                </p>
              </div>

              {item.responseMessage && (
                <div className="rounded-md border border-border bg-blue-50/50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-blue-900">
                      Sales Representative Response ({item.actedBy?.name ?? "Sales Rep"}):
                    </p>
                    {item.actedAt && (
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(new Date(item.actedAt))}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-blue-950">
                    {item.responseMessage}
                  </p>
                </div>
              )}
            </div>

            {item.status === "COUNTERED" && (
              <div className="mt-3 border-t border-border pt-3">
                {activeNegotiationId === item.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      rows={2}
                      className="w-full rounded-md border border-input p-2 text-xs"
                      placeholder="Write your response to the sales rep's counter-proposal..."
                      value={responseMsg}
                      onChange={(e) => setResponseMsg(e.target.value)}
                      disabled={pending}
                    />
                    {error && <p className="text-xs text-red-600">{error}</p>}
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setActiveNegotiationId(null)}
                        disabled={pending}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleRespond(item.id)}
                        disabled={pending || responseMsg.trim().length < 2}
                      >
                        {pending ? (
                          <LoaderCircle className="size-3 animate-spin" />
                        ) : (
                          <Send className="size-3" />
                        )}
                        Send Response
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActiveNegotiationId(item.id);
                      setResponseMsg("");
                    }}
                  >
                    <MessageSquare className="size-3.5" aria-hidden />
                    Reply to Counter-Proposal
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
