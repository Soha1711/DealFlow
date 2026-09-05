"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CornerDownLeft,
  LoaderCircle,
  MessageSquare,
  MessageSquareQuote,
  X,
} from "lucide-react";

import { formatDate } from "@/lib/format";
import {
  NEGOTIATION_STATUS_BADGE_CLASSES,
  NEGOTIATION_STATUS_LABELS,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptNegotiationDialog } from "@/components/quotations/accept-negotiation-dialog";

type NegotiationRecord = {
  id: string;
  status: import("@prisma/client").NegotiationStatus;
  message: string;
  proposedChanges: unknown;
  responseMessage: string | null;
  createdAt: Date | string;
  actedAt: Date | string | null;
  createdBy?: { name: string; email: string };
  actedBy?: { name: string; email: string } | null;
};

export function NegotiationPanel({
  quotationId,
  quotationStatus,
  negotiations = [],
  lines = [],
  canAct = false,
}: {
  quotationId: string;
  quotationStatus: string;
  negotiations: NegotiationRecord[];
  lines: any[];
  canAct: boolean;
}) {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<"accept" | "counter" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeNegotiation = negotiations.find(
    (n) => n.status === "PENDING" || n.status === "COUNTERED"
  );

  async function handleReject(negotiationId: string) {
    if (rejectReason.trim().length < 5) {
      setError("Please provide a decline reason (at least 5 characters).");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/quotations/${quotationId}/negotiations/${negotiationId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason.trim() }),
        }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error?.message ?? "Failed to reject negotiation.");
        return;
      }
      setActiveModal(null);
      setRejectReason("");
      router.refresh();
    } catch {
      setError("Failed to reject negotiation.");
    } finally {
      setPending(false);
    }
  }

  async function handleCounter(negotiationId: string) {
    if (counterMessage.trim().length < 5) {
      setError("Please provide counter details (at least 5 characters).");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/quotations/${quotationId}/negotiations/${negotiationId}/counter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: counterMessage.trim() }),
        }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error?.message ?? "Failed to counter negotiation.");
        return;
      }
      setActiveModal(null);
      setCounterMessage("");
      router.refresh();
    } catch {
      setError("Failed to counter negotiation.");
    } finally {
      setPending(false);
    }
  }

  if (negotiations.length === 0 && quotationStatus !== "UNDER_NEGOTIATION") {
    return null;
  }

  return (
    <Card className="bg-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareQuote className="size-5 text-blue-600" />
            <CardTitle>Customer Negotiation</CardTitle>
          </div>
          {activeNegotiation && (
            <Badge className={NEGOTIATION_STATUS_BADGE_CLASSES[activeNegotiation.status]}>
              {NEGOTIATION_STATUS_LABELS[activeNegotiation.status]}
            </Badge>
          )}
        </div>
        <CardDescription>
          Requests, counter-proposals and negotiation rounds from the customer portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {activeNegotiation && activeModal === "accept" && (
          <AcceptNegotiationDialog
            quotationId={quotationId}
            negotiationId={activeNegotiation.id}
            lines={lines}
            onClose={() => setActiveModal(null)}
          />
        )}

        {activeNegotiation && activeModal === "reject" && (
          <div className="rounded-lg border border-red-200 bg-red-50/40 p-4">
            <h4 className="text-sm font-semibold text-red-900">
              Decline Negotiation Request
            </h4>
            <p className="mt-0.5 text-xs text-red-700">
              This will decline the customer&apos;s request and restore the quotation to APPROVED.
            </p>
            <textarea
              rows={2}
              className="mt-3 w-full rounded-md border border-input bg-white p-2 text-xs"
              placeholder="State reason for declining (e.g. Cannot meet discount target on hardware lines)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              disabled={pending}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveModal(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleReject(activeNegotiation.id)}
                disabled={pending || rejectReason.trim().length < 5}
              >
                {pending && <LoaderCircle className="size-3 animate-spin" />}
                Confirm Decline
              </Button>
            </div>
          </div>
        )}

        {activeNegotiation && activeModal === "counter" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
            <h4 className="text-sm font-semibold text-blue-900">
              Send Counter-Proposal to Customer
            </h4>
            <p className="mt-0.5 text-xs text-blue-700">
              Suggest alternative terms or ask clarifying questions.
            </p>
            <textarea
              rows={2}
              className="mt-3 w-full rounded-md border border-input bg-white p-2 text-xs"
              placeholder="e.g. We cannot do 20%, but we can do 12% if ordered this week..."
              value={counterMessage}
              onChange={(e) => setCounterMessage(e.target.value)}
              disabled={pending}
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveModal(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleCounter(activeNegotiation.id)}
                disabled={pending || counterMessage.trim().length < 5}
              >
                {pending && <LoaderCircle className="size-3 animate-spin" />}
                Send Counter-Proposal
              </Button>
            </div>
          </div>
        )}

        {activeNegotiation && !activeModal && canAct && quotationStatus === "UNDER_NEGOTIATION" && (
          <div className="flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50/30 p-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-900">
                  Active Request from {activeNegotiation.createdBy?.name ?? "Customer"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDate(new Date(activeNegotiation.createdAt))}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
                {activeNegotiation.message}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setActiveModal("accept")}
              >
                <Check className="size-3.5" />
                Accept / Apply Changes
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveModal("counter")}
              >
                <CornerDownLeft className="size-3.5" />
                Counter-Offer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-700 hover:bg-red-50"
                onClick={() => setActiveModal("reject")}
              >
                <X className="size-3.5" />
                Decline Request
              </Button>
            </div>
          </div>
        )}

        {negotiations.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold text-muted-foreground">
              Negotiation History ({negotiations.length} {negotiations.length === 1 ? "round" : "rounds"})
            </h4>
            <div className="flex flex-col gap-2">
              {negotiations.map((n) => (
                <div
                  key={n.id}
                  className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/10 p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {n.createdBy?.name ?? "Customer"}
                    </span>
                    <Badge className={NEGOTIATION_STATUS_BADGE_CLASSES[n.status]}>
                      {NEGOTIATION_STATUS_LABELS[n.status]}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">{n.message}</p>
                  {n.responseMessage && (
                    <div className="mt-1 border-t border-border pt-1 text-blue-900">
                      <span className="font-semibold">Response: </span>
                      {n.responseMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
