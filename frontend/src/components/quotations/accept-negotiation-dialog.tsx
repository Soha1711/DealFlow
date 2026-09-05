"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";

import type { Decimal } from "@prisma/client/runtime/library";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LineData = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number | string | Decimal;
  discountPercent: number;
  product: {
    id: string;
    name: string;
    sku: string;
    price: number | string | Decimal;
  };
};

export function AcceptNegotiationDialog({
  quotationId,
  negotiationId,
  lines,
  onClose,
}: {
  quotationId: string;
  negotiationId: string;
  lines: LineData[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [lineChanges, setLineChanges] = useState(
    lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: String(l.unitPrice),
      discountPercent: l.discountPercent,
      name: l.product.name,
    }))
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLine(index: number, field: "quantity" | "discountPercent", val: number) {
    setLineChanges((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    );
  }

  async function handleAccept(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/quotations/${quotationId}/negotiations/${negotiationId}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: message.trim() || undefined,
            lines: lineChanges.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountPercent: l.discountPercent,
            })),
          }),
        }
      );

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to accept negotiation.");
        return;
      }

      onClose();
      router.refresh();
    } catch {
      setError("Failed to accept negotiation.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-md">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Accept Negotiation & Apply Changes
          </h3>
          <p className="text-xs text-muted-foreground">
            Apply agreed commercial terms. Totals will be recalculated, and discount risk
            will re-evaluate against product limits.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <Alert variant="destructive">
            <TriangleAlert className="size-4" aria-hidden />
            <AlertTitle>Action Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <form onSubmit={handleAccept} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accept-message">Response Note (optional)</Label>
          <Input
            id="accept-message"
            placeholder="e.g. Agreed to requested 15% discount for volume increase."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={pending}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-foreground">
            Adjust quotation lines to apply:
          </p>
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
            {lineChanges.map((line, idx) => (
              <div
                key={line.productId}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{line.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs">Qty:</Label>
                    <Input
                      type="number"
                      min="1"
                      className="h-8 w-20 text-xs"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))}
                      disabled={pending}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs">Disc %:</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      className="h-8 w-20 text-xs"
                      value={line.discountPercent}
                      onChange={(e) =>
                        updateLine(idx, "discountPercent", Number(e.target.value))
                      }
                      disabled={pending}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Confirm & Apply Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
