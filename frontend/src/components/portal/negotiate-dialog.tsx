"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MessageSquareQuote, Send, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type QuotationLineItem = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice?: string;
  discountPercent?: number;
  discountAmount?: string;
  lineTotal?: string;
  product?: {
    id?: string;
    name: string;
    sku: string;
    price?: string;
  };
};

export function NegotiateDialog({
  quotationId,
  lines = [],
}: {
  quotationId: string;
  lines: QuotationLineItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [targetTotal, setTargetTotal] = useState("");
  const [lineAdjustments, setLineAdjustments] = useState<
    Record<string, { quantity?: number; discountPercent?: number }>
  >({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLineChange(
    productId: string,
    field: "quantity" | "discountPercent",
    val: string
  ) {
    const num = val === "" ? undefined : Number(val);
    setLineAdjustments((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: num,
      },
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (message.trim().length < 5) {
      setError("Please explain your request (at least 5 characters).");
      return;
    }

    const proposedLines = lines
      .filter((line) => {
        const adj = lineAdjustments[line.productId];
        return adj && (adj.quantity !== undefined || adj.discountPercent !== undefined);
      })
      .map((line) => {
        const adj = lineAdjustments[line.productId];
        return {
          productId: line.productId,
          requestedQuantity: adj?.quantity,
          requestedDiscountPercent: adj?.discountPercent,
        };
      });

    setError(null);
    setPending(true);

    try {
      const response = await fetch(`/api/portal/quotations/${quotationId}/negotiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          targetTotal: targetTotal ? Number(targetTotal) : undefined,
          proposedLines: proposedLines.length > 0 ? proposedLines : undefined,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to submit request.");
        return;
      }

      setOpen(false);
      setMessage("");
      setTargetTotal("");
      setLineAdjustments({});
      router.refresh();
    } catch {
      setError("Failed to submit request.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <MessageSquareQuote className="size-4" aria-hidden />
        Request Changes / Negotiate
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Submit Negotiation / Change Request
          </h3>
          <p className="text-xs text-muted-foreground">
            Let your sales representative know what changes you require on this quotation.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>

      {error && (
        <div className="mt-4">
          <Alert variant="destructive">
            <TriangleAlert className="size-4" aria-hidden />
            <AlertTitle>Submission Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="negotiation-message">
            Message to Sales Rep <span className="text-red-500">*</span>
          </Label>
          <textarea
            id="negotiation-message"
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="e.g. Can we get an additional 5% discount if we increase our volume, or can you adjust delivery terms?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={pending}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:w-1/2">
          <Label htmlFor="target-total">Target Budget / Total (optional)</Label>
          <Input
            id="target-total"
            type="number"
            min="1"
            step="0.01"
            placeholder="e.g. 5000"
            value={targetTotal}
            onChange={(e) => setTargetTotal(e.target.value)}
            disabled={pending}
          />
        </div>

        {lines.length > 0 && (
          <div className="flex flex-col gap-2 pt-2">
            <p className="text-xs font-medium text-foreground">
              Optional line item adjustments:
            </p>
            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {line.product?.name ?? "Product"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Current Qty: {line.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`qty-${line.id}`} className="text-xs">
                        Requested Qty:
                      </Label>
                      <Input
                        id={`qty-${line.id}`}
                        type="number"
                        min="1"
                        className="h-8 w-20 text-xs"
                        placeholder={String(line.quantity)}
                        onChange={(e) =>
                          handleLineChange(line.productId, "quantity", e.target.value)
                        }
                        disabled={pending}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`disc-${line.id}`} className="text-xs">
                        Target Disc %:
                      </Label>
                      <Input
                        id={`disc-${line.id}`}
                        type="number"
                        min="0"
                        max="100"
                        className="h-8 w-20 text-xs"
                        placeholder="%"
                        onChange={(e) =>
                          handleLineChange(line.productId, "discountPercent", e.target.value)
                        }
                        disabled={pending}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending || message.trim().length < 5}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            Submit Request
          </Button>
        </div>
      </form>
    </div>
  );
}
