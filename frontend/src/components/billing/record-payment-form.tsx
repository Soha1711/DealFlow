"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign, LoaderCircle, TriangleAlert } from "lucide-react";
import type { FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Finance/Admin action: records an internal payment against an issued
 * invoice. The server recomputes the paid amount and rejects overpayment.
 */
export function RecordPaymentForm({
  invoiceId,
  outstanding,
}: {
  invoiceId: string;
  outstanding: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amount.trim(),
          method: "INTERNAL",
          reference: reference.trim() || undefined,
          idempotencyKey: `payment-${invoiceId}-${Date.now().toString(36)}`,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? "Failed to record payment.");
        return;
      }
      setAmount("");
      setReference("");
      router.refresh();
    } catch {
      setError("Failed to record payment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
      <p className="text-sm text-muted-foreground">
        Outstanding balance:{" "}
        <span className="font-medium text-foreground tabular-nums">
          ${outstanding.toFixed(2)}
        </span>
      </p>
      {error && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Payment not recorded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">Amount (USD)</Label>
            <Input
              id="payment-amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-reference">Reference (optional)</Label>
            <Input
              id="payment-reference"
              placeholder="Check no., wire ref…"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
        </div>
        <div>
          <Button type="submit" disabled={pending || amount.trim() === ""}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <CircleDollarSign className="size-4" aria-hidden />
            )}
            Record payment
          </Button>
        </div>
      </form>
    </div>
  );
} 