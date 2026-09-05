"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ICONS } from "@/lib/nav-icons";
import type { NavSection } from "@/lib/navigation";

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  sections,
  onNavigate,
}: {
  sections: NavSection[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {section.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = NAV_ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-blue-700 text-white shadow-sm"
                        : "text-foreground/75 hover:bg-muted hover:text-foreground"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className={cn("size-4", active ? "text-white" : "text-muted-foreground")} aria-hidden />
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}