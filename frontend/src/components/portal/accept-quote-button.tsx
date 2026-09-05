"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AcceptQuoteButton({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/portal/quotations/${quotationId}/accept`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? "Failed to accept quotation.");
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Failed to accept quotation.");
    } finally {
      setPending(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleAccept}
          disabled={pending}
        >
          {pending ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
          Confirm Acceptance
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <Button
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
        onClick={() => setConfirming(true)}
      >
        <Check className="size-4" aria-hidden />
        Accept Quotation
      </Button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </div>
  );
}
