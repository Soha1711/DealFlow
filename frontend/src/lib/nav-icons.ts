import {
  BarChart3,
  Boxes,
  Building2,
  ChartLine,
  CheckSquare2,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  ListChecks,
  Package,
  Percent,
  Warehouse as WarehouseIcon,
} from "lucide-react";

export const NAV_ICONS = {
  dashboard: LayoutDashboard,
  portal: Building2,
  quotations: FileText,
  approvals: CheckSquare2,
  fulfillment: Boxes,
  billing: CircleDollarSign,
  "deal-health": ChartLine,
  "admin": BarChart3,
  "admin-products": Package,
  "admin-customers": Building2,
  "admin-discounts": Percent,
  "admin-warehouses": WarehouseIcon,
  "admin-subscriptions": ListChecks,
} as const;

export type NavIconKey = keyof typeof NAV_ICONS;