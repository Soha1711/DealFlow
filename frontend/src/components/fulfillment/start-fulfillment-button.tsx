"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PackagePlus, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function StartFulfillmentButton({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setIsPending(true);
    try {
      const response = await fetch("/api/fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotationId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to start fulfillment.");
        return;
      }
      router.refresh();
      router.push(`/fulfillment/${payload.data.id}`);
    } catch {
      setError("Failed to start fulfillment.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {error && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Could not start fulfillment</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={() => void start()} disabled={isPending}>
        {isPending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <PackagePlus className="size-4" aria-hidden />
        )}
        Start fulfillment
      </Button>
    </div>
  );
}