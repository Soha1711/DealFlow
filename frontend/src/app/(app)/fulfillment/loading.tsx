import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function FulfillmentLoading() {
  return (
    <>
      <PageHeader title="Fulfillment" />
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </>
  );
}