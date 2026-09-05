"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-red-50">
        <TriangleAlert className="size-6 text-red-600" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred while rendering this page. Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}