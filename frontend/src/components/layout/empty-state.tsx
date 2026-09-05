import { Inbox } from "lucide-react";

export function EmptyState({
  title = "Nothing here yet",
  description = "No records were found for this view.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-white px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}