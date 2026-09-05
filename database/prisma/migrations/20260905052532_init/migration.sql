-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES_REP', 'SALES_MANAGER', 'FINANCE', 'OPERATIONS', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "CustomerTier" AS ENUM ('STANDARD', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "DiscountApprovalLevel" AS ENUM ('NONE', 'MANAGER', 'MANAGER_AND_FINANCE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "salesTeamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tier" "CustomerTier" NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "maxDiscountPercent" INTEGER NOT NULL DEFAULT 20,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minDiscount" INTEGER NOT NULL,
    "maxDiscount" INTEGER NOT NULL,
    "approvalLevel" "DiscountApprovalLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_isRecurring_idx" ON "products"("isRecurring");

-- CreateIndex
CREATE UNIQUE INDEX "discount_tiers_name_key" ON "discount_tiers"("name");

-- CreateIndex
CREATE INDEX "discount_tiers_approvalLevel_idx" ON "discount_tiers"("approvalLevel");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_name_key" ON "warehouses"("name");

-- CreateIndex
CREATE INDEX "inventory_productId_idx" ON "inventory"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_warehouseId_productId_key" ON "inventory"("warehouseId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
