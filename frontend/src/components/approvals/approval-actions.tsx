"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  LoaderCircle,
  ShieldX,
  TriangleAlert,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<
    "approve" | "reject" | null
  >(null);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve" | "reject") {
    setError(null);
    setPendingAction(action);
    try {
      const response = await fetch(`/api/approvals/${approvalId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "reject" ? JSON.stringify({ reason: reason.trim() }) : "{}",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? `Failed to ${action} approval.`);
        return;
      }
      setShowReason(false);
      setReason("");
      router.refresh();
    } catch {
      setError(`Failed to ${action} approval.`);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showReason ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
          <Label htmlFor="reject-reason">Rejection reason</Label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Discount exceeds acceptable margin."
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label="Rejection reason"
          />
          <p className="text-xs text-muted-foreground">
            A reason is required and will be recorded with the rejection.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pendingAction !== null || reason.trim().length === 0}
              onClick={() => run("reject")}
            >
              {pendingAction === "reject" ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <ShieldX className="size-4" aria-hidden />
              )}
              Confirm rejection
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pendingAction !== null}
              onClick={() => {
                setShowReason(false);
                setReason("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            disabled={pendingAction !== null}
            onClick={() => run("approve")}
          >
            {pendingAction === "approve" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Check className="size-4" aria-hidden />
            )}
            Approve
          </Button>
          <Button
            variant="outline"
            disabled={pendingAction !== null}
            onClick={() => setShowReason(true)}
          >
            <X className="size-4" aria-hidden />
            Reject
          </Button>
        </div>
      )}

    </div>
  );
}