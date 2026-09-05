import Link from "next/link";
import { TrendingUp } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2.5 overflow-hidden"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-blue-700/20 bg-blue-700 text-white">
        <TrendingUp className="size-4" aria-hidden />
      </span>
      {!compact && (
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            DealFlow360
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            Sales Operations
          </span>
        </span>
      )}
    </Link>
  );
}