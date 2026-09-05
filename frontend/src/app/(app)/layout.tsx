import type { Metadata } from "next";

import { requireCurrentUser } from "@/lib/auth-guards";
import { AppShell } from "@/components/app-shell/app-shell";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s · DealFlow360",
  },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();

  return <AppShell user={user}>{children}</AppShell>;
}