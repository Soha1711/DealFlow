"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Finance/Admin action: DRAFT → ISSUED (stamps issue + due dates). */
export function IssueInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to issue invoice.");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to issue invoice.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Issue failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={() => void run()} disabled={pending}>
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )}
        Issue invoice
      </Button>
    </div>
  );
} 