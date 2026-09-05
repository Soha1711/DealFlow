-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING_ALLOCATION', 'ALLOCATED', 'PARTIALLY_ALLOCATED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FulfillmentLineStatus" AS ENUM ('REQUESTED', 'ALLOCATED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'BACKORDERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FulfillmentAllocationStatus" AS ENUM ('ALLOCATED', 'FULFILLED', 'RELEASED');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'RELEASED');

-- CreateTable
CREATE TABLE "fulfillments" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING_ALLOCATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_lines" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "requestedQuantity" INTEGER NOT NULL,
    "allocatedQuantity" INTEGER NOT NULL DEFAULT 0,
    "fulfilledQuantity" INTEGER NOT NULL DEFAULT 0,
    "backorderQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" "FulfillmentLineStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_allocations" (
    "id" TEXT NOT NULL,
    "fulfillmentLineId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "FulfillmentAllocationStatus" NOT NULL DEFAULT 'ALLOCATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "allocationId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fulfillments_quotationId_idx" ON "fulfillments"("quotationId");

-- CreateIndex
CREATE INDEX "fulfillments_status_idx" ON "fulfillments"("status");

-- CreateIndex
CREATE INDEX "fulfillments_createdAt_idx" ON "fulfillments"("createdAt");

-- CreateIndex
CREATE INDEX "fulfillment_lines_fulfillmentId_idx" ON "fulfillment_lines"("fulfillmentId");

-- CreateIndex
CREATE INDEX "fulfillment_lines_productId_idx" ON "fulfillment_lines"("productId");

-- CreateIndex
CREATE INDEX "fulfillment_lines_status_idx" ON "fulfillment_lines"("status");

-- CreateIndex
CREATE INDEX "fulfillment_allocations_fulfillmentLineId_idx" ON "fulfillment_allocations"("fulfillmentLineId");

-- CreateIndex
CREATE INDEX "fulfillment_allocations_inventoryId_idx" ON "fulfillment_allocations"("inventoryId");

-- CreateIndex
CREATE INDEX "inventory_reservations_inventoryId_idx" ON "inventory_reservations"("inventoryId");

-- CreateIndex
CREATE INDEX "inventory_reservations_allocationId_idx" ON "inventory_reservations"("allocationId");

-- CreateIndex
CREATE INDEX "inventory_reservations_status_idx" ON "inventory_reservations"("status");

-- AddForeignKey
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_lines" ADD CONSTRAINT "fulfillment_lines_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_lines" ADD CONSTRAINT "fulfillment_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_allocations" ADD CONSTRAINT "fulfillment_allocations_fulfillmentLineId_fkey" FOREIGN KEY ("fulfillmentLineId") REFERENCES "fulfillment_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_allocations" ADD CONSTRAINT "fulfillment_allocations_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "fulfillment_allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
