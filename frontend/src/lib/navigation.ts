import type { Role } from "@prisma/client";

import { hasAreaAccess, type AppArea } from "@/lib/rbac";
import type { NavIconKey } from "@/lib/nav-icons";

export type NavItem = {
  title: string;
  href: string;
  area: AppArea;
  icon: NavIconKey;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const appNav: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        area: "dashboard",
        icon: "dashboard",
      },
    ],
  },
  {
    title: "Sales",
    items: [
      { title: "Quotations", href: "/quotations", area: "quotations", icon: "quotations" },
      { title: "Approvals", href: "/approvals", area: "approvals", icon: "approvals" },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Fulfillment", href: "/fulfillment", area: "fulfillment", icon: "fulfillment" },
    ],
  },
  {
    title: "Finance",
    items: [
      { title: "Billing", href: "/billing", area: "billing", icon: "billing" },
    ],
  },
  {
    title: "Insights",
    items: [
      { title: "Deal Health", href: "/deal-health", area: "deal-health", icon: "deal-health" },
    ],
  },
  {
    title: "Administration",
    items: [
      { title: "Overview", href: "/admin", area: "admin", icon: "admin" },
      { title: "Products", href: "/admin/products", area: "admin-products", icon: "admin-products" },
      { title: "Customers", href: "/admin/customers", area: "admin-customers", icon: "admin-customers" },
      { title: "Discount Rules", href: "/admin/discounts", area: "admin-discounts", icon: "admin-discounts" },
      { title: "Warehouses", href: "/admin/warehouses", area: "admin-warehouses", icon: "admin-warehouses" },
      { title: "Subscription Plans", href: "/admin/subscriptions", area: "admin-subscriptions", icon: "admin-subscriptions" },
    ],
  },
];

/** Returns the navigation tree filtered for a specific role. */
export function getNavForRole(role: Role): NavSection[] {
  return appNav
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasAreaAccess(role, item.area)),
    }))
    .filter((section) => section.items.length > 0);
}