"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock,
  CornerDownLeft,
  LoaderCircle,
  MessageSquareQuote,
  X,
} from "lucide-react";
import type { NegotiationStatus, QuotationStatus } from "@prisma/client";

import { formatDate } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type SerializedNegotiationRecord = {
  id: string;
  status: NegotiationStatus;
  message: string;
  responseMessage: string | null;
  createdAt: string;
  actedAt: string | null;
  createdBy?: { name: string; email: string };
  actedBy?: { name: string; email: string } | null;
};

type ActiveAction = "accept" | "decline" | "reply" | null;

export function CustomerNegotiationPanel({
  quotationStatus,
  activeNegotiation,
  salesRepName = "Your Sales Representative",
}: {
  quotationId: string;
  quotationStatus: QuotationStatus;
  activeNegotiation?: SerializedNegotiationRecord | null;
  salesRepName?: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<ActiveAction>(null);
  const [acceptNote, setAcceptNote] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (
    quotationStatus !== "UNDER_NEGOTIATION" ||
    !activeNegotiation ||
    (activeNegotiation.status !== "COUNTERED" && activeNegotiation.status !== "PENDING")
  ) {
    return null;
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
      setAction(null);
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
      setAction(null);
      setDeclineReason("");
      router.refresh();
    } catch {
      setError("Failed to decline counter-offer.");
    } finally {
      setPending(false);
    }
  }

  async function handleReply(negotiationId: string) {
    if (replyMessage.trim().length < 2) {
      setError("Please enter a response message (at least 2 characters).");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/negotiations/${negotiationId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyMessage.trim() }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error?.message ?? "Failed to send response.");
        return;
      }
      setAction(null);
      setReplyMessage("");
      router.refresh();
    } catch {
      setError("Failed to send response.");
    } finally {
      setPending(false);
    }
  }

  if (activeNegotiation.status === "COUNTERED") {
    return (
      <Card className="mb-6 border-amber-300 bg-amber-50/40 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareQuote className="size-5 text-amber-700" />
              <CardTitle className="text-base font-semibold text-amber-950">
                Counter-Offer from {salesRepName}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-100 text-amber-900 border-amber-300">
                Action Required: Counter-Offer Received
              </Badge>
              {activeNegotiation.actedAt && (
                <span className="text-xs text-muted-foreground">
                  {formatDate(new Date(activeNegotiation.actedAt))}
                </span>
              )}
            </div>
          </div>
          <CardDescription className="text-amber-900/80 text-xs">
            Your sales representative has responded to your change request with updated terms. Review the counter-offer below to accept, decline, or reply.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Action Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {activeNegotiation.responseMessage && (
            <div className="rounded-lg border border-amber-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-amber-100 pb-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                  Sales Representative&apos;s Proposal
                </span>
                <span className="text-xs text-muted-foreground">
                  By {activeNegotiation.actedBy?.name ?? salesRepName}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {activeNegotiation.responseMessage}
              </p>
            </div>
          )}

          <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Your Previous Request: </span>
            <span className="whitespace-pre-wrap">{activeNegotiation.message}</span>
          </div>

          {action === "accept" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
              <h4 className="text-sm font-semibold text-emerald-950">
                Accept Sales Representative&apos;s Counter-Offer
              </h4>
              <p className="mt-0.5 text-xs text-emerald-800">
                By accepting, this quotation will be confirmed and our team will begin processing your order.
              </p>
              <textarea
                rows={2}
                className="mt-3 w-full rounded-md border border-input bg-white p-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Add an optional acceptance note or confirmation details..."
                value={acceptNote}
                onChange={(e) => setAcceptNote(e.target.value)}
                disabled={pending}
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAction(null);
                    setError(null);
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => handleAccept(activeNegotiation.id)}
                  disabled={pending}
                >
                  {pending ? (
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-3.5" aria-hidden />
                  )}
                  Confirm & Accept Counter-Offer
                </Button>
              </div>
            </div>
          )}

          {action === "decline" && (
            <div className="rounded-lg border border-red-200 bg-red-50/60 p-4">
              <h4 className="text-sm font-semibold text-red-950">
                Decline Counter-Offer
              </h4>
              <p className="mt-0.5 text-xs text-red-800">
                Declining will reject this counter-offer and restore the quotation to its previous approved state, where you may accept the original proposal or request different adjustments.
              </p>
              <textarea
                rows={2}
                className="mt-3 w-full rounded-md border border-input bg-white p-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Reason for declining (optional)..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                disabled={pending}
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAction(null);
                    setError(null);
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDecline(activeNegotiation.id)}
                  disabled={pending}
                >
                  {pending ? (
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <X className="size-3.5" aria-hidden />
                  )}
                  Confirm Decline
                </Button>
              </div>
            </div>
          )}

          {action === "reply" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
              <h4 className="text-sm font-semibold text-blue-950">
                Reply to Sales Representative
              </h4>
              <p className="mt-0.5 text-xs text-blue-800">
                Send a follow-up question or suggest another counter-proposal.
              </p>
              <textarea
                rows={3}
                className="mt-3 w-full rounded-md border border-input bg-white p-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="e.g. Can we meet halfway at 10% discount if we commit to an annual contract?"
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                disabled={pending}
                required
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAction(null);
                    setError(null);
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleReply(activeNegotiation.id)}
                  disabled={pending || replyMessage.trim().length < 2}
                >
                  {pending ? (
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <CornerDownLeft className="size-3.5" aria-hidden />
                  )}
                  Send Reply
                </Button>
              </div>
            </div>
          )}

          {!action && (
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  setAction("accept");
                  setError(null);
                }}
              >
                <Check className="size-3.5" aria-hidden />
                Accept Counter-Offer
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-blue-300 text-blue-800 hover:bg-blue-50"
                onClick={() => {
                  setAction("reply");
                  setError(null);
                }}
              >
                <CornerDownLeft className="size-3.5" aria-hidden />
                Reply / Counter Again
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => {
                  setAction("decline");
                  setError(null);
                }}
              >
                <X className="size-3.5" aria-hidden />
                Decline Counter-Offer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // PENDING state (waiting for sales representative)
  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/30 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Clock className="size-5 text-blue-700" />
            <CardTitle className="text-base font-semibold text-blue-950">
              Negotiation Request Under Review
            </CardTitle>
          </div>
          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
            Awaiting Sales Review
          </Badge>
        </div>
        <CardDescription className="text-blue-900/80 text-xs">
          Your change request is currently being reviewed by {salesRepName}. You will be notified when they update terms or reply with a counter-offer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-blue-100 bg-white p-3 text-xs">
          <div className="flex items-center justify-between border-b border-border/50 pb-1.5 mb-1.5 text-muted-foreground">
            <span className="font-semibold text-foreground">Your Submitted Request</span>
            <span>{formatDate(new Date(activeNegotiation.createdAt))}</span>
          </div>
          <p className="whitespace-pre-wrap text-foreground">{activeNegotiation.message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
