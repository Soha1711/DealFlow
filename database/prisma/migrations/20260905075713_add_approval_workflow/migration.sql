-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('MANAGER', 'FINANCE');

-- CreateEnum
CREATE TYPE "DiscountRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuotationStatus" ADD VALUE 'DISCOUNT_CHECK';
ALTER TYPE "QuotationStatus" ADD VALUE 'PENDING_MANAGER';
ALTER TYPE "QuotationStatus" ADD VALUE 'PENDING_FINANCE';

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "requiredApprovalLevel" "DiscountApprovalLevel",
ADD COLUMN     "riskLevel" "DiscountRiskLevel",
ADD COLUMN     "riskScore" INTEGER;

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "level" "ApprovalLevel" NOT NULL,
    "approverId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approvals_quotationId_idx" ON "approvals"("quotationId");

-- CreateIndex
CREATE INDEX "approvals_status_idx" ON "approvals"("status");

-- CreateIndex
CREATE INDEX "approvals_approverId_idx" ON "approvals"("approverId");

-- CreateIndex
CREATE INDEX "quotations_riskLevel_idx" ON "quotations"("riskLevel");

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
