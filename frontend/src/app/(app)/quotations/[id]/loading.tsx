import { Skeleton } from "@/components/ui/skeleton";

export default function QuotationDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-lg border border-border bg-white lg:col-span-2">
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-32" />
          </div>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <div className="rounded-lg border border-border bg-white p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-4 w-40" />
            <Skeleton className="mt-2 h-4 w-36" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-3 h-4 w-32" />
            <Skeleton className="mt-2 h-4 w-28" />
            <Skeleton className="mt-2 h-4 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}