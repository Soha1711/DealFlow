"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, LoaderCircle, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Finance/Admin action: creates hybrid billing (one-time invoice +
 * subscriptions + first-period recurring invoices) from an approved
 * quotation. The service is idempotent — a double click can never create
 * duplicates.
 */
export function GenerateBillingButton({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/quotations/${quotationId}/billing`, {
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
          <FilePlus2 className="size-4" aria-hidden />
        )}
        Generate billing
      </Button>
    </div>
  );
} 