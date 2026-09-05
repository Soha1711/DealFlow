"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Finance/Admin action: generates the next recurring invoice + billing
 * schedule for an active subscription. Server-side idempotency (unique
 * period) prevents double-billing a period.
 */
export function BillSubscriptionButton({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}/bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to generate billing.");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to generate billing.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Billing failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={() => void run()} disabled={pending}>
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <CalendarPlus className="size-4" aria-hidden />
        )}
        Generate next billing period
      </Button>
    </div>
  );
} 