import type { CurrentUser } from "@/lib/auth-guards";
import { Header } from "@/components/app-shell/header";
import { Sidebar } from "@/components/app-shell/sidebar";

export function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto bg-muted/40">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}