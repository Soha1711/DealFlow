"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SubmitQuotationButton({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/quotations/${quotationId}/submit`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to submit quotation.");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to submit quotation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <Alert variant="destructive" className="w-full max-w-sm">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Submit failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )}
        {isSubmitting ? "Submitting…" : "Submit quotation"}
      </Button>
    </div>
  );
}