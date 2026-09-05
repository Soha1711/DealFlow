import Link from "next/link";

import { cn } from "cn";

const TABS = [
  { label: "Invoices", href: "/billing" },
  { label: "Subscriptions", href: "/billing/subscriptions" },
] as const;

export function BillingTabs({ active }: { active: "invoices" | "subscriptions" }) {
  return (
    <nav className="mb-6 flex items-center gap-1 border-b border-border">
      {TABS.map((tab) => {
        const isActive =
          active === "invoices"
            ? tab.href === "/billing"
            : tab.href === "/billing/subscriptions";
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-blue-700 text-blue-700"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
} 