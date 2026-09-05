import type { CurrentUser } from "@/lib/auth-guards";
import { getNavForRole } from "@/lib/navigation";
import { roleLabel } from "@/lib/roles";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { UserMenu } from "@/components/app-shell/user-menu";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function Header({ user }: { user: CurrentUser }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-4 md:px-6">
      <div className="flex items-center gap-3">
        <MobileNav sections={getNavForRole(user.role)} />
        <Badge
          variant="outline"
          className="hidden bg-muted/40 font-medium text-muted-foreground sm:inline-flex"
        >
          {roleLabel(user.role)}
        </Badge>
      </div>
      <div className="flex items-center gap-4">
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <UserMenu user={user} />
      </div>
    </header>
  );
}