"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Admin-only stock adjustment (±10 units). Every change is a transactional
 * service call; availability (quantity − reservedQuantity) is updated
 * atomically, which lets Operations replenish stock for backorder release.
 */
export function InventoryAdjust({ inventoryId }: { inventoryId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function adjust(delta: number) {
    setError(null);
    setPending(delta);
    try {
      const response = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryId, delta }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to adjust inventory.");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to adjust inventory.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error && (
        <Alert variant="destructive" className="w-full max-w-xs">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Adjustment failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          disabled={pending !== null}
          onClick={() => void adjust(-10)}
          aria-label="Decrease stock by 10"
        >
          <Minus className="size-3.5" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={pending !== null}
          onClick={() => void adjust(10)}
          aria-label="Increase stock by 10"
        >
          <Plus className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}