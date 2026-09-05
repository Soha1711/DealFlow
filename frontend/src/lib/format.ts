import type { Decimal } from "@prisma/client/runtime/library";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: Decimal | number): string {
  const amount = typeof value === "number" ? value : value.toNumber();
  return currencyFormatter.format(amount);
}

export function formatPercent(value: number): string {
  return `${value}%`;
}

export function formatDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}