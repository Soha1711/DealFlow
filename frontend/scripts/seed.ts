import "dotenv/config";
import { Prisma, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  BillingInterval,
  CustomerTier,
  DiscountApprovalLevel,
} from "@prisma/client";

import { createQuotation, submitQuotation } from "../src/lib/modules/quotations/quotation-service";
import { approveApproval, rejectApproval } from "../src/lib/modules/approvals/approval-service";
import { createFulfillment, allocateFulfillment, fulfillFulfillment } from "../src/lib/modules/fulfillment/fulfillment-service";
import { createBillingFromQuotation } from "../src/lib/modules/billing/billing-service";
import { issueInvoice } from "../src/lib/modules/billing/invoice-service";
import { recordPayment } from "../src/lib/modules/billing/payment-service";
import { billSubscription } from "../src/lib/modules/billing/subscription-service";
import { submitCustomerNegotiation, counterNegotiation } from "../src/lib/modules/negotiations/negotiation-service";

const prisma = new PrismaClient();

function round2(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export const DEMO_PASSWORD = "DealFlow360!";
const PASSWORD_ROUNDS = 10;

async function resetTransactionalData() {
  console.log("  reset: cleaning transactional demo records for a fresh connected state...");
  await prisma.quotationNegotiation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.billingSchedule.updateMany({ data: { invoiceId: null } });
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.billingSchedule.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.inventoryReservation.deleteMany();
  await prisma.fulfillmentAllocation.deleteMany();
  await prisma.fulfillmentLine.deleteMany();
  await prisma.fulfillment.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.quotationLine.deleteMany();
  await prisma.quotation.deleteMany();
  console.log("  reset: transactional tables ready.");
}

async function main() {
  console.log("Seeding DealFlow360 realistic demo data...");

  // 1. Seed Core Users (all 6 roles)
  const userByEmail: Record<string, string> = {};

  const seedUsers = [
    {
      name: "Avery Stone",
      email: "avery.stone@dealflow360.io",
      role: Role.ADMIN,
    },
    {
      name: "Maya Chen",
      email: "maya.chen@dealflow360.io",
      role: Role.SALES_REP,
      salesTeamId: "team-americas",
    },
    {
      name: "Ravi Patel",
      email: "ravi.patel@dealflow360.io",
      role: Role.SALES_MANAGER,
      salesTeamId: "team-americas",
    },
    {
      name: "Priya Nair",
      email: "priya.nair@dealflow360.io",
      role: Role.FINANCE,
    },
    {
      name: "Diego Ramos",
      email: "diego.ramos@dealflow360.io",
      role: Role.OPERATIONS,
    },
    {
      name: "Jordan Lee",
      email: "jordan.lee@dealflow360.io",
      role: Role.CUSTOMER,
    },
  ];

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, PASSWORD_ROUNDS);

  for (const u of seedUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        salesTeamId: u.salesTeamId ?? null,
      },
      create: {
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        salesTeamId: u.salesTeamId,
      },
    });
    userByEmail[u.email] = user.id;
    console.log(`  user: ${u.email} (${u.role})`);
  }

  // 2. Seed Customers (Multiple accounts across tiers)
  const seedCustomers = [
    {
      name: "Northwind Traders Inc",
      email: "billing@northwindtraders.com",
      tier: CustomerTier.GOLD,
    },
    {
      name: "Bluepeak Manufacturing Co.",
      email: "procurement@bluepeakmfg.com",
      tier: CustomerTier.PLATINUM,
    },
    {
      name: "Helios Logistics Group",
      email: "finance@helioslogistics.com",
      tier: CustomerTier.SILVER,
    },
    {
      name: "Apex Global Systems",
      email: "contracts@apexglobal.io",
      tier: CustomerTier.STANDARD,
    },
  ];

  const customerIdByEmail: Record<string, string> = {};
  for (const c of seedCustomers) {
    const cust = await prisma.customer.upsert({
      where: { email: c.email },
      update: { name: c.name, tier: c.tier },
      create: c,
    });
    customerIdByEmail[c.email] = cust.id;
  }
  console.log(`  customers: ${seedCustomers.length} accounts configured`);

  // Link Jordan Lee to Northwind Traders Inc for Customer Portal
  const northwindId = customerIdByEmail["billing@northwindtraders.com"];
  if (northwindId) {
    await prisma.user.updateMany({
      where: { email: "jordan.lee@dealflow360.io" },
      data: { customerId: northwindId },
    });
    console.log("  customer-link: jordan.lee linked to Northwind Traders Inc (GOLD tier)");
  }

  // 3. Subscription Plans
  const seedPlans = [
    { name: "CRM Enterprise", price: 240.0, billingInterval: BillingInterval.ANNUAL },
    { name: "Analytics Pro", price: 120.0, billingInterval: BillingInterval.MONTHLY },
    { name: "API Access", price: 650.0, billingInterval: BillingInterval.MONTHLY },
  ];

  const planIdByName: Record<string, string> = {};
  for (const p of seedPlans) {
    const plan = await prisma.subscriptionPlan.upsert({
      where: { name: p.name },
      update: { price: p.price, billingInterval: p.billingInterval },
      create: p,
    });
    planIdByName[p.name] = plan.id;
  }

  // 4. Products Catalog
  const seedProducts = [
    {
      name: "Meridian CRM Enterprise",
      sku: "CRM-ENT-001",
      category: "Software",
      price: 240.0,
      cost: 96.0,
      maxDiscountPercent: 35,
      isRecurring: true,
      subscriptionPlanId: planIdByName["CRM Enterprise"],
    },
    {
      name: "Meridian Analytics Pro",
      sku: "ANL-PRO-002",
      category: "Software",
      price: 120.0,
      cost: 48.0,
      maxDiscountPercent: 25,
      isRecurring: true,
      subscriptionPlanId: planIdByName["Analytics Pro"],
    },
    {
      name: "Aurora API Access",
      sku: "API-ACC-011",
      category: "Subscription",
      price: 650.0,
      cost: 260.0,
      maxDiscountPercent: 20,
      isRecurring: true,
      subscriptionPlanId: planIdByName["API Access"],
    },
    {
      name: "Beacon Edge Device",
      sku: "EDGE-DEV-021",
      category: "Hardware",
      price: 999.0,
      cost: 540.0,
      maxDiscountPercent: 5,
      isRecurring: false,
    },
    {
      name: "Data Migration Service",
      sku: "MIG-SVC-031",
      category: "Services",
      price: 8000.0,
      cost: 5200.0,
      maxDiscountPercent: 15,
      isRecurring: false,
    },
    {
      name: "Titan Support Pack",
      sku: "SUP-PLT-041",
      category: "Support",
      price: 1800.0,
      cost: 1260.0,
      maxDiscountPercent: 12,
      isRecurring: false,
    },
    {
      name: "Cloud Sentinel Appliance",
      sku: "SENT-APP-051",
      category: "Hardware",
      price: 3500.0,
      cost: 2100.0,
      maxDiscountPercent: 10,
      isRecurring: false,
    },
  ];

  const productIdBySku: Record<string, string> = {};
  for (const p of seedProducts) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        name: p.name,
        category: p.category,
        price: p.price,
        cost: p.cost,
        maxDiscountPercent: p.maxDiscountPercent,
        isRecurring: p.isRecurring,
        subscriptionPlanId: p.subscriptionPlanId ?? null,
      },
      create: p,
    });
    productIdBySku[p.sku] = product.id;
  }
  console.log(`  products: ${seedProducts.length} catalog items configured`);

  // 5. Discount Tiers
  const seedTiers = [
    {
      name: "Standard Discount",
      minDiscount: 0,
      maxDiscount: 10,
      approvalLevel: DiscountApprovalLevel.NONE,
    },
    {
      name: "Manager Approval",
      minDiscount: 10,
      maxDiscount: 20,
      approvalLevel: DiscountApprovalLevel.MANAGER,
    },
    {
      name: "Deep Discount",
      minDiscount: 20,
      maxDiscount: 100,
      approvalLevel: DiscountApprovalLevel.MANAGER_AND_FINANCE,
    },
  ];

  for (const t of seedTiers) {
    await prisma.discountTier.upsert({
      where: { name: t.name },
      update: {
        minDiscount: t.minDiscount,
        maxDiscount: t.maxDiscount,
        approvalLevel: t.approvalLevel,
      },
      create: t,
    });
  }

  // 6. Multi-Warehouse Setup
  const seedWarehouses = [
    { name: "Cincinnati Distribution Center", location: "Cincinnati, OH, USA" },
    { name: "Reno Logistics Hub", location: "Reno, NV, USA" },
  ];

  const warehouseIdByName: Record<string, string> = {};
  for (const w of seedWarehouses) {
    const warehouse = await prisma.warehouse.upsert({
      where: { name: w.name },
      update: { location: w.location },
      create: w,
    });
    warehouseIdByName[w.name] = warehouse.id;
  }

  const cincinnatiId = warehouseIdByName["Cincinnati Distribution Center"];
  const renoId = warehouseIdByName["Reno Logistics Hub"];
  const beaconEdgeId = productIdBySku["EDGE-DEV-021"];
  const migrationServiceId = productIdBySku["MIG-SVC-031"];
  const titanSupportId = productIdBySku["SUP-PLT-041"];
  const crmEnterpriseId = productIdBySku["CRM-ENT-001"];
  const analyticsProId = productIdBySku["ANL-PRO-002"];
  const sentinelId = productIdBySku["SENT-APP-051"];

  // 7. Controlled Reset of Transactional Data
  await resetTransactionalData();

  // 8. Re-initialize authoritative Inventory
  const seedInventory = [
    {
      warehouseId: cincinnatiId,
      productId: beaconEdgeId,
      quantity: 120,
      reservedQuantity: 0,
    },
    {
      warehouseId: renoId,
      productId: beaconEdgeId,
      quantity: 80,
      reservedQuantity: 0,
    },
    {
      warehouseId: cincinnatiId,
      productId: migrationServiceId,
      quantity: 25,
      reservedQuantity: 0,
    },
    {
      warehouseId: renoId,
      productId: titanSupportId,
      quantity: 200,
      reservedQuantity: 0,
    },
    {
      warehouseId: cincinnatiId,
      productId: crmEnterpriseId,
      quantity: 5000,
      reservedQuantity: 0,
    },
    {
      warehouseId: renoId,
      productId: analyticsProId,
      quantity: 3000,
      reservedQuantity: 0,
    },
    // Low stock product: Cloud Sentinel Appliance (only 14 units total: 8 in Cincy, 6 in Reno)
    {
      warehouseId: cincinnatiId,
      productId: sentinelId,
      quantity: 8,
      reservedQuantity: 0,
    },
    {
      warehouseId: renoId,
      productId: sentinelId,
      quantity: 6,
      reservedQuantity: 0,
    },
  ];

  for (const inv of seedInventory) {
    await prisma.inventory.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: inv.warehouseId,
          productId: inv.productId,
        },
      },
      update: {
        quantity: inv.quantity,
        reservedQuantity: 0,
      },
      create: inv,
    });
  }
  console.log(`  inventory: configured stock across Cincinnati and Reno warehouses (including low-stock Sentinel)`);

  // Actors for domain services
  const mayaId = userByEmail["maya.chen@dealflow360.io"];
  const raviId = userByEmail["ravi.patel@dealflow360.io"];
  const priyaId = userByEmail["priya.nair@dealflow360.io"];
  const diegoId = userByEmail["diego.ramos@dealflow360.io"];
  const jordanId = userByEmail["jordan.lee@dealflow360.io"];

  const salesRepActor = { userId: mayaId, role: Role.SALES_REP };
  const managerActor = { userId: raviId, role: Role.SALES_MANAGER };
  const financeActor = { userId: priyaId, role: Role.FINANCE };
  const opsActor = { userId: diegoId, role: Role.OPERATIONS };

  const bluepeakId = customerIdByEmail["procurement@bluepeakmfg.com"];
  const heliosId = customerIdByEmail["finance@helioslogistics.com"];
  const apexId = customerIdByEmail["contracts@apexglobal.io"];

  console.log("\n  --- SEEDING CONNECTED ENTERPRISE DEMO SCENARIOS ---");

  // =========================================================================
  // 1. SALES REP (Maya Chen) SCENARIOS
  // =========================================================================
  // DRAFT 1: Interactive Draft for AI Product Recommendations
  const qDraftAi = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [
      { productId: beaconEdgeId, quantity: 1, unitPrice: 999, discountPercent: 0 },
    ],
  });
  console.log(`  [SALES_REP] Draft 1: ${qDraftAi.quotationNumber} in DRAFT (Bluepeak) - ready for AI upsells`);

  // DRAFT 2: Clean Draft ready for immediate submission
  const qDraftSubmit = await createQuotation({
    salesRepId: mayaId,
    customerId: apexId,
    lines: [
      { productId: beaconEdgeId, quantity: 2, unitPrice: 999, discountPercent: 5 },
      { productId: crmEnterpriseId, quantity: 1, unitPrice: 240, discountPercent: 5 },
    ],
  });
  console.log(`  [SALES_REP] Draft 2: ${qDraftSubmit.quotationNumber} in DRAFT (Apex Global) - ready to submit`);

  // SUBMITTED: Auto-Approved Low-Risk Quotation
  const qAutoApproved = await createQuotation({
    salesRepId: mayaId,
    customerId: apexId,
    lines: [
      { productId: analyticsProId, quantity: 2, unitPrice: 120, discountPercent: 5 },
    ],
  });
  await submitQuotation(qAutoApproved.id, salesRepActor);
  console.log(`  [SALES_REP] Auto-Approved: ${qAutoApproved.quotationNumber} (Apex Global) - status APPROVED (Risk: LOW)`);

  // =========================================================================
  // 2. SALES MANAGER (Ravi Patel) APPROVAL SCENARIOS
  // =========================================================================
  // Pending Approval 1: Medium Risk (18% discount on Beacon Edge)
  const qPendingManager1 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: beaconEdgeId, quantity: 5, unitPrice: 999, discountPercent: 18 },
    ],
  });
  await submitQuotation(qPendingManager1.id, salesRepActor);
  console.log(`  [SALES_MANAGER] Pending 1: ${qPendingManager1.quotationNumber} in PENDING_MANAGER (Northwind Traders, 18% discount)`);

  // Pending Approval 2: Medium-High Risk (20% discount on Services)
  const qPendingManager2 = await createQuotation({
    salesRepId: mayaId,
    customerId: heliosId,
    lines: [
      { productId: migrationServiceId, quantity: 1, unitPrice: 8000, discountPercent: 20 },
    ],
  });
  await submitQuotation(qPendingManager2.id, salesRepActor);
  console.log(`  [SALES_MANAGER] Pending 2: ${qPendingManager2.quotationNumber} in PENDING_MANAGER (Helios Logistics, 20% discount)`);

  // Previously Rejected Deal: Excessive 45% discount rejected by Ravi Patel
  const qRejected = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [
      { productId: migrationServiceId, quantity: 2, unitPrice: 8000, discountPercent: 45 },
    ],
  });
  await submitQuotation(qRejected.id, salesRepActor);
  const rejectApprovalRec = await prisma.approval.findFirst({
    where: { quotationId: qRejected.id, status: "PENDING", level: "MANAGER" },
  });
  if (rejectApprovalRec) {
    await rejectApproval(
      rejectApprovalRec.id,
      managerActor,
      "Discount request of 45% exceeds regional margin tolerance. Maximum allowable discount is 20%."
    );
    console.log(`  [SALES_MANAGER] Rejected: ${qRejected.quotationNumber} (Bluepeak) - status REJECTED with commercial feedback`);
  }

  // =========================================================================
  // 3. FINANCE (Priya Nair) & ESCALATION SCENARIOS
  // =========================================================================
  // Pending Finance Approval: Deep 35% discount escalated through Manager to Finance
  const qPendingFinance = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [
      { productId: titanSupportId, quantity: 3, unitPrice: 1800, discountPercent: 35 },
    ],
  });
  await submitQuotation(qPendingFinance.id, salesRepActor);
  const mgrStage = await prisma.approval.findFirst({
    where: { quotationId: qPendingFinance.id, level: "MANAGER", status: "PENDING" },
  });
  if (mgrStage) {
    await approveApproval(mgrStage.id, managerActor);
    console.log(`  [FINANCE] Pending Finance: ${qPendingFinance.quotationNumber} in PENDING_FINANCE (Bluepeak, 35% discount approved by Manager)`);
  }

  // Hybrid Billing: Quotation approved, billed, and active subscription generated
  const qHybridBilled = await createQuotation({
    salesRepId: mayaId,
    customerId: heliosId,
    lines: [
      { productId: beaconEdgeId, quantity: 2, unitPrice: 999, discountPercent: 5 },
      { productId: analyticsProId, quantity: 1, unitPrice: 120, discountPercent: 10 },
    ],
  });
  await submitQuotation(qHybridBilled.id, salesRepActor);
  const billingHybrid = await createBillingFromQuotation(qHybridBilled.id, financeActor);
  if (billingHybrid.oneTimeInvoice) {
    await issueInvoice(billingHybrid.oneTimeInvoice.id, financeActor);
    // Partially paid (~40%)
    const partialAmount = round2(new Prisma.Decimal(billingHybrid.oneTimeInvoice.total.toString()).times("0.4"));
    await recordPayment(billingHybrid.oneTimeInvoice.id, financeActor, {
      amount: partialAmount.toString(),
      method: "BANK_TRANSFER",
      reference: `Initial wire transfer for ${billingHybrid.oneTimeInvoice.invoiceNumber}`,
    });
    console.log(`  [FINANCE] Invoice ${billingHybrid.oneTimeInvoice.invoiceNumber} PARTIALLY_PAID (Helios Logistics, 40% paid)`);
  }

  // Overdue Invoice & Failed Payment Example
  const qOverdue = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [
      { productId: beaconEdgeId, quantity: 3, unitPrice: 999, discountPercent: 5 },
    ],
  });
  await submitQuotation(qOverdue.id, salesRepActor);
  const billingOverdue = await createBillingFromQuotation(qOverdue.id, financeActor);
  if (billingOverdue.oneTimeInvoice) {
    await issueInvoice(billingOverdue.oneTimeInvoice.id, financeActor);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    await prisma.invoice.update({
      where: { id: billingOverdue.oneTimeInvoice.id },
      data: {
        issueDate: thirtyDaysAgo,
        dueDate: fifteenDaysAgo,
        status: "OVERDUE",
      },
    });

    // Record a failed credit card attempt
    await prisma.payment.create({
      data: {
        invoiceId: billingOverdue.oneTimeInvoice.id,
        amount: billingOverdue.oneTimeInvoice.total,
        status: "FAILED",
        method: "CREDIT_CARD",
        reference: "DECLINED_CARD_EXPIRED",
        paidAt: new Date(),
      },
    });
    console.log(`  [FINANCE] Invoice ${billingOverdue.oneTimeInvoice.invoiceNumber} OVERDUE with FAILED payment attempt (Bluepeak)`);
  }

  // Active Subscription with History
  const qSubHistory = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [
      { productId: crmEnterpriseId, quantity: 1, unitPrice: 240, discountPercent: 10 },
    ],
  });
  await submitQuotation(qSubHistory.id, salesRepActor);
  const billingSub = await createBillingFromQuotation(qSubHistory.id, financeActor);
  if (billingSub.subscriptions[0]) {
    const sub = billingSub.subscriptions[0];
    const firstInvoice = sub.schedules[0]?.invoice;
    if (firstInvoice) {
      await issueInvoice(firstInvoice.id, financeActor);
      const invTotal = await prisma.invoice.findUniqueOrThrow({
        where: { id: firstInvoice.id },
        select: { total: true },
      });
      await recordPayment(firstInvoice.id, financeActor, {
        amount: invTotal.total.toString(),
        method: "ACH",
        reference: `Annual subscription fee for ${firstInvoice.invoiceNumber}`,
      });
    }
    await billSubscription(sub.id, financeActor);
    console.log(`  [FINANCE] Subscription ${sub.id} active with paid period 1 and scheduled period 2`);
  }

  // =========================================================================
  // 4. OPERATIONS (Diego Ramos) FULFILLMENT SCENARIOS
  // =========================================================================
  // Ready to Fulfill: Approved quote awaiting operations allocation
  const qReadyFulfill = await createQuotation({
    salesRepId: mayaId,
    customerId: apexId,
    lines: [
      { productId: beaconEdgeId, quantity: 10, unitPrice: 999, discountPercent: 5 },
    ],
  });
  await submitQuotation(qReadyFulfill.id, salesRepActor);
  console.log(`  [OPERATIONS] Ready for Fulfillment: ${qReadyFulfill.quotationNumber} in APPROVED (Apex Global)`);

  // Backorder Scenario: High-volume order exceeding single warehouse stock
  // 20 units of Cloud Sentinel Appliance requested (Cincinnati: 8, Reno: 6 = 14 total stock -> 6 backordered!)
  const qBackorder = await createQuotation({
    salesRepId: mayaId,
    customerId: heliosId,
    lines: [
      { productId: sentinelId, quantity: 20, unitPrice: 3500, discountPercent: 0 },
    ],
  });
  await submitQuotation(qBackorder.id, salesRepActor);
  const fulfillmentBackorder = await createFulfillment(qBackorder.id, opsActor);
  await allocateFulfillment(fulfillmentBackorder.id, opsActor);
  console.log(`  [OPERATIONS] Backorder: ${qBackorder.quotationNumber} allocated across Cincy & Reno (6 backordered, Status: ${fulfillmentBackorder.status})`);

  // Completed Fulfillment: Fully allocated, fulfilled and closed
  const qCompletedFulfill = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: beaconEdgeId, quantity: 2, unitPrice: 999, discountPercent: 5 },
    ],
  });
  await submitQuotation(qCompletedFulfill.id, salesRepActor);
  const fCompleted = await createFulfillment(qCompletedFulfill.id, opsActor);
  await allocateFulfillment(fCompleted.id, opsActor);
  await fulfillFulfillment(fCompleted.id, opsActor);
  console.log(`  [OPERATIONS] Completed: ${qCompletedFulfill.quotationNumber} fulfilled and closed (Status: COMPLETED)`);

  // =========================================================================
  // 5. CUSTOMER (Jordan Lee) PORTAL & NEGOTIATION SCENARIOS
  // =========================================================================
  // Scenario 1: Quotation where Sales Rep countered, awaiting Customer review
  const qCountered = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: beaconEdgeId, quantity: 2, unitPrice: 999, discountPercent: 5 },
    ],
  });
  await submitQuotation(qCountered.id, salesRepActor);
  const negCountered = await submitCustomerNegotiation(qCountered.id, northwindId, jordanId, {
    message: "We need 6 units for our logistics expansion. Could you offer 20% discount?",
    targetTotal: 4800,
    proposedLines: [
      { productId: beaconEdgeId, requestedQuantity: 6, requestedDiscountPercent: 20 },
    ],
  });
  await counterNegotiation(negCountered.id, salesRepActor, {
    message: "We can commit to 6 units at a 12% commercial discount, plus include standard warranty.",
  });
  console.log(`  [CUSTOMER] Negotiation Awaiting Customer: ${qCountered.quotationNumber} (Maya Chen COUNTERED with 12% offer)`);

  // Scenario 2: Quotation under initial negotiation review
  const qUnderNegotiation = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: migrationServiceId, quantity: 1, unitPrice: 8000, discountPercent: 10 },
    ],
  });
  await submitQuotation(qUnderNegotiation.id, salesRepActor);
  await submitCustomerNegotiation(qUnderNegotiation.id, northwindId, jordanId, {
    message: "Can we bundle data migration with on-site deployment assistance at no extra charge?",
    targetTotal: 7200,
  });
  console.log(`  [CUSTOMER] Under Negotiation: ${qUnderNegotiation.quotationNumber} (PENDING customer request)`);

  // Scenario 3: Clean Approved Quotation ready for Customer to Accept
  const qApprovedCustomer = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: crmEnterpriseId, quantity: 2, unitPrice: 240, discountPercent: 10 },
    ],
  });
  await submitQuotation(qApprovedCustomer.id, salesRepActor);
  console.log(`  [CUSTOMER] Approved & Ready to Accept: ${qApprovedCustomer.quotationNumber} (Northwind Traders)`);

  // Scenario 4: Customer Invoice (Issued historical invoice for Northwind)
  const qCustomerBilled = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: beaconEdgeId, quantity: 1, unitPrice: 999, discountPercent: 5 },
    ],
  });
  await submitQuotation(qCustomerBilled.id, salesRepActor);
  const billingCust = await createBillingFromQuotation(qCustomerBilled.id, financeActor);
  if (billingCust.oneTimeInvoice) {
    await issueInvoice(billingCust.oneTimeInvoice.id, financeActor);
    console.log(`  [CUSTOMER] Invoice ${billingCust.oneTimeInvoice.invoiceNumber} ISSUED for Northwind Traders (visible in portal)`);
  }

  // =========================================================================
  // 6. AGENTIC AI DEMO DEAL (Multi-step automation target)
  // =========================================================================
  const qAgentDemo = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: beaconEdgeId, quantity: 4, unitPrice: 999, discountPercent: 25 },
    ],
  });
  console.log(`  [COPILOT] Agent Automation Target: ${qAgentDemo.quotationNumber} in DRAFT (25% discount -> test 'Prepare for approval')`);

  console.log("\n==========================================================");
  console.log("Realistic Demo Data Generation Complete!");
  console.log("==========================================================");
  console.log("Demo Credentials (Password: DealFlow360! for all accounts):");
  console.log("  • ADMIN         : avery.stone@dealflow360.io");
  console.log("  • SALES_REP     : maya.chen@dealflow360.io");
  console.log("  • SALES_MANAGER : ravi.patel@dealflow360.io");
  console.log("  • FINANCE       : priya.nair@dealflow360.io");
  console.log("  • OPERATIONS    : diego.ramos@dealflow360.io");
  console.log("  • CUSTOMER      : jordan.lee@dealflow360.io");
  console.log("==========================================================\n");
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });