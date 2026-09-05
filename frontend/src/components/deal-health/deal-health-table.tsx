"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";

import { formatCurrency, formatPercent } from "@/lib/format";
import { QuotationStatusBadge } from "@/components/quotations/status-badge";
import { DealHealthBadge } from "@/components/deal-health/deal-health-badge";
import type { DealHealthPortfolioItem } from "@/lib/modules/deal-health/deal-health-types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

export function DealHealthTable({
  items,
  pagination,
  currentLevel = "ALL",
  search = "",
}: {
  items: DealHealthPortfolioItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  currentLevel?: string;
  search?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState(search);

  function updateQuery(next: { q?: string; level?: string; page?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    if (next.level !== undefined) {
      if (next.level && next.level !== "ALL") params.set("level", next.level);
      else params.delete("level");
    }
    if (next.page !== undefined) {
      params.set("page", String(next.page));
    } else {
      params.set("page", "1");
    }

    startTransition(() => {
      router.push(`/deal-health?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search and level filter controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          className="relative max-w-sm flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            updateQuery({ q: searchTerm.trim() });
          }}
        >
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search quotation, customer or sales rep..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 text-xs bg-white"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                updateQuery({ q: "" });
              }}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </form>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(["ALL", "CRITICAL", "AT_RISK", "HEALTHY"] as const).map((lvl) => {
            const isSelected = currentLevel === lvl || (!currentLevel && lvl === "ALL");
            return (
              <Button
                key={lvl}
                size="sm"
                variant={isSelected ? "default" : "outline"}
                className={isSelected ? "text-xs font-semibold" : "text-xs bg-white"}
                onClick={() => updateQuery({ level: lvl })}
                disabled={isPending}
              >
                {lvl === "ALL" ? "All Deals" : lvl.replace("_", " ")}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Deals table */}
      <Card className="bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Quotation</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sales Rep</TableHead>
                <TableHead>Total & Margin</TableHead>
                <TableHead className="w-[180px]">Health Score</TableHead>
                <TableHead>Primary Risk / Anomaly</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                    No deals match the selected criteria.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="text-xs">
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/quotations/${item.id}`}
                          className="font-medium text-foreground hover:underline flex items-center gap-1"
                        >
                          {item.quotationNumber}
                        </Link>
                        <QuotationStatusBadge status={item.status} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-foreground">{item.customer.name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{item.salesRep.name}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">
                          {formatCurrency(item.total)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Margin: {formatPercent(Math.round(item.marginRate * 100))} (
                          {formatCurrency(item.margin)})
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <DealHealthBadge level={item.health.level} score={item.health.score} />
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={
                              item.health.level === "HEALTHY"
                                ? "h-full bg-emerald-500 rounded-full"
                                : item.health.level === "AT_RISK"
                                ? "h-full bg-amber-500 rounded-full"
                                : "h-full bg-red-500 rounded-full"
                            }
                            style={{ width: `${Math.max(5, item.health.score)}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.health.primaryRisk ? (
                        <div className="flex items-center gap-1 text-slate-700 font-medium">
                          <span className="truncate max-w-[200px]" title={item.health.primaryRisk}>
                            {item.health.primaryRisk}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No active risks</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                        <Link href={`/quotations/${item.id}`}>
                          Inspect
                          <ArrowUpRight className="ml-1 size-3" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
            {pagination.total} deals
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateQuery({ page: pagination.page - 1 })}
              disabled={pagination.page <= 1 || isPending}
            >
              Previous
            </Button>
            <span className="px-2">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateQuery({ page: pagination.page + 1 })}
              disabled={pagination.page >= pagination.totalPages || isPending}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
