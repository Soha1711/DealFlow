import type { Customer, Product } from "@prisma/client";

import type {
  CustomerOption,
  ProductOption,
} from "@/components/quotations/quotation-form";

/**
 * Maps Prisma entities to plain, serializable option objects for the client
 * quotation form. Decimal values are converted to numbers here so nothing
 * non-serializable crosses the server/client boundary.
 */
export function toCustomerOptions(
  customers: Pick<Customer, "id" | "name">[]
): CustomerOption[] {
  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
  }));
}

export function toProductOptions(
  products: Pick<
    Product,
    "id" | "name" | "sku" | "price" | "cost" | "maxDiscountPercent" | "isRecurring"
  >[]
): ProductOption[] {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: Number(product.price.toString()),
    cost: Number(product.cost.toString()),
    maxDiscountPercent: product.maxDiscountPercent,
    isRecurring: product.isRecurring,
  }));
}