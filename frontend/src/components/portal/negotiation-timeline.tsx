"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CornerDownLeft, LoaderCircle, MessageSquare, X } from "lucide-react";
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
  const [activeAction, setActiveAction] = useState<"reply" | "accept" | "decline" | null>(null);
  const [responseMsg, setResponseMsg] = useState("");
  const [acceptNote, setAcceptNote] = useState("");
  const [declineReason, setDeclineReason] = useState("");
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
      setActiveAction(null);
      setResponseMsg("");
      router.refresh();
    } catch {
      setError("Failed to respond.");
    } finally {
      setPending(false);
    }
  }

  async function handleAccept(negotiationId: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/negotiations/${negotiationId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: acceptNote.trim() || undefined }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error?.message ?? "Failed to accept counter-offer.");
        return;
      }
      setActiveNegotiationId(null);
      setActiveAction(null);
      setAcceptNote("");
      router.refresh();
    } catch {
      setError("Failed to accept counter-offer.");
    } finally {
      setPending(false);
    }
  }

  async function handleDecline(negotiationId: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/negotiations/${negotiationId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason.trim() || undefined }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error?.message ?? "Failed to decline counter-offer.");
        return;
      }
      setActiveNegotiationId(null);
      setActiveAction(null);
      setDeclineReason("");
      router.refresh();
    } catch {
      setError("Failed to decline counter-offer.");
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
                  <div className="flex flex-col gap-2.5">
                    {activeAction === "accept" && (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
                        <p className="text-xs font-semibold text-emerald-950">
                          Confirm Acceptance of Counter-Offer
                        </p>
                        <textarea
                          rows={2}
                          className="mt-2 w-full rounded-md border border-input bg-white p-2 text-xs"
                          placeholder="Add optional acceptance note..."
                          value={acceptNote}
                          onChange={(e) => setAcceptNote(e.target.value)}
                          disabled={pending}
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setActiveNegotiationId(null);
                              setActiveAction(null);
                            }}
                            disabled={pending}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleAccept(item.id)}
                            disabled={pending}
                          >
                            {pending && <LoaderCircle className="size-3 animate-spin mr-1" />}
                            Confirm & Accept
                          </Button>
                        </div>
                      </div>
                    )}

                    {activeAction === "decline" && (
                      <div className="rounded-md border border-red-200 bg-red-50/50 p-3">
                        <p className="text-xs font-semibold text-red-950">
                          Decline Counter-Offer
                        </p>
                        <textarea
                          rows={2}
                          className="mt-2 w-full rounded-md border border-input bg-white p-2 text-xs"
                          placeholder="State reason for declining (optional)..."
                          value={declineReason}
                          onChange={(e) => setDeclineReason(e.target.value)}
                          disabled={pending}
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setActiveNegotiationId(null);
                              setActiveAction(null);
                            }}
                            disabled={pending}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDecline(item.id)}
                            disabled={pending}
                          >
                            {pending && <LoaderCircle className="size-3 animate-spin mr-1" />}
                            Confirm Decline
                          </Button>
                        </div>
                      </div>
                    )}

                    {activeAction === "reply" && (
                      <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3">
                        <p className="text-xs font-semibold text-blue-950">
                          Reply to Sales Representative
                        </p>
                        <textarea
                          rows={2}
                          className="mt-2 w-full rounded-md border border-input bg-white p-2 text-xs"
                          placeholder="Write your response to the sales rep's counter-proposal..."
                          value={responseMsg}
                          onChange={(e) => setResponseMsg(e.target.value)}
                          disabled={pending}
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setActiveNegotiationId(null);
                              setActiveAction(null);
                            }}
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
                              <CornerDownLeft className="size-3" />
                            )}
                            Send Response
                          </Button>
                        </div>
                      </div>
                    )}

                    {error && <p className="text-xs text-red-600">{error}</p>}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7"
                      onClick={() => {
                        setActiveNegotiationId(item.id);
                        setActiveAction("accept");
                        setError(null);
                      }}
                    >
                      <Check className="size-3 mr-1" />
                      Accept Counter
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 border-blue-300 text-blue-800 hover:bg-blue-50"
                      onClick={() => {
                        setActiveNegotiationId(item.id);
                        setActiveAction("reply");
                        setError(null);
                      }}
                    >
                      <MessageSquare className="size-3 mr-1" />
                      Reply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 border-red-300 text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setActiveNegotiationId(item.id);
                        setActiveAction("decline");
                        setError(null);
                      }}
                    >
                      <X className="size-3 mr-1" />
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
