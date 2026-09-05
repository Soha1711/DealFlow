"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  LoaderCircle,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type FulfillmentStatus =
  | "PENDING_ALLOCATION"
  | "ALLOCATED"
  | "PARTIALLY_ALLOCATED"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "COMPLETED"
  | "CANCELLED";

const ACTIONS: {
  key: "allocate" | "fulfill" | "release" | "cancel";
  label: string;
  icon: typeof PackagePlus;
  variant?: "outline" | "destructive";
  /** Statuses in which the action is offered. */
  enabledFor: FulfillmentStatus[];
}[] = [
  {
    key: "allocate",
    label: "Allocate",
    icon: PackagePlus,
    enabledFor: ["PENDING_ALLOCATION", "PARTIALLY_ALLOCATED", "ALLOCATED"],
  },
  {
    key: "release",
    label: "Release backorder",
    icon: RotateCcw,
    enabledFor: ["PARTIALLY_ALLOCATED", "PARTIALLY_FULFILLED"],
  },
  {
    key: "fulfill",
    label: "Fulfill",
    icon: PackageCheck,
    enabledFor: ["ALLOCATED", "PARTIALLY_ALLOCATED", "PARTIALLY_FULFILLED"],
  },
  {
    key: "cancel",
    label: "Cancel",
    icon: Ban,
    variant: "destructive",
    enabledFor: [
      "PENDING_ALLOCATION",
      "ALLOCATED",
      "PARTIALLY_ALLOCATED",
      "PARTIALLY_FULFILLED",
    ],
  },
];

export function FulfillmentActions({
  fulfillmentId,
  status,
  hasBackorders,
}: {
  fulfillmentId: string;
  status: FulfillmentStatus;
  hasBackorders: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string) {
    setError(null);
    setPending(action);
    try {
      const response = await fetch(`/api/fulfillment/${fulfillmentId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message ?? `Failed to ${action} fulfillment.`);
        return;
      }
      router.refresh();
    } catch {
      setError(`Failed to ${action} fulfillment.`);
    } finally {
      setPending(null);
    }
  }

  const visible = ACTIONS.filter((action) => action.enabledFor.includes(status));

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {hasBackorders && status === "PARTIALLY_ALLOCATED" && (
        <p className="text-xs text-muted-foreground">
          Backorders remain — allocate newly available stock or wait for a
          release before this can complete.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {visible.map((action) => (
          <Button
            key={action.key}
            size="sm"
            variant={action.variant}
            disabled={pending !== null}
            onClick={() => void run(action.key)}
          >
            {pending === action.key ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <action.icon className="size-4" aria-hidden />
            )}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}