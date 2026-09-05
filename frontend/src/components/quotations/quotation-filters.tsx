"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
];

export function QuotationFilters({
  search,
  status,
}: {
  search?: string;
  status?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(search ?? "");

  function navigate(next: { q?: string; status?: string }) {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.status) params.set("status", next.status);
    params.set("page", "1");
    const query = params.toString();
    startTransition(() => router.push(query ? `?${query}` : ""));
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    navigate({ q: searchInput.trim(), status });
  }

  function handleStatusChange(value: string) {
    navigate({ q: search, status: value === "ALL" ? undefined : value });
  }

  function handleClear() {
    setSearchInput("");
    startTransition(() => router.push(""));
  }

  const hasFilters = Boolean(search) || Boolean(status);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <form onSubmit={handleSearchSubmit} className="flex w-full max-w-xs items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search number, customer, rep…"
            className="pl-8"
            aria-label="Search quotations"
          />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          Search
        </Button>
      </form>

      <Select value={status ?? "ALL"} onValueChange={handleStatusChange}>
        <SelectTrigger className="w-44" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All statuses</SelectItem>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="text-muted-foreground"
        >
          <X className="size-3.5" aria-hidden />
          Clear filters
        </Button>
      )}
    </div>
  );
}