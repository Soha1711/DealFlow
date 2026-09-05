"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FULFILLMENT_STATUS_LABELS } from "@/lib/labels";

const STATUSES = [
  "PENDING_ALLOCATION",
  "ALLOCATED",
  "PARTIALLY_ALLOCATED",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "COMPLETED",
  "CANCELLED",
] as const;

export function FulfillmentStatusFilter({ status }: { status?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const params = new URLSearchParams();
    if (value !== "ALL") params.set("status", value);
    params.set("page", "1");
    startTransition(() => router.push(`?${params.toString()}`));
  }

  return (
    <Select
      value={status ?? "ALL"}
      onValueChange={handleChange}
      disabled={isPending}
    >
      <SelectTrigger className="w-48" aria-label="Filter by status">
        <SelectValue placeholder="All statuses" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">All statuses</SelectItem>
        {STATUSES.map((value) => (
          <SelectItem key={value} value={value}>
            {FULFILLMENT_STATUS_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}