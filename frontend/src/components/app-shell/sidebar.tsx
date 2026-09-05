import type { CurrentUser } from "@/lib/auth-guards";
import { getNavForRole } from "@/lib/navigation";
import { Brand } from "@/components/app-shell/brand";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { Separator } from "@/components/ui/separator";

export function Sidebar({ user }: { user: CurrentUser }) {
  const sections = getNavForRole(user.role);

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-border bg-white lg:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <SidebarNav sections={sections} />
      </div>
      <div className="px-4 py-4">
        <Separator className="mb-4" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          DealFlow360 · Enterprise Platform
        </p>
      </div>
    </aside>
  );
}