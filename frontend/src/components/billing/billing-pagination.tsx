import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function BillingPagination({
  basePath,
  page,
  totalPages,
  params,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  params?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  function href(targetPage: number) {
    const search = new URLSearchParams();
    search.set("page", String(targetPage));
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) search.set(key, value);
    }
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        {page <= 1 ? (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="size-3.5" aria-hidden />
            Previous
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>
              <ChevronLeft className="size-3.5" aria-hidden />
              Previous
            </Link>
          </Button>
        )}
        {page >= totalPages ? (
          <Button variant="outline" size="sm" disabled>
            Next
            <ChevronRight className="size-3.5" aria-hidden />
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>
              Next
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
} 