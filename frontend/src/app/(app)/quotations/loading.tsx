import { Skeleton } from "@/components/ui/skeleton";

export default function QuotationsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="flex items-center gap-4 border-b border-border bg-muted/50 px-4 py-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="ml-auto h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}