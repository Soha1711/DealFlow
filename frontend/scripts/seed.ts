import "dotenv/config";
import { Prisma, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  BillingInterval,
  CustomerTier,
  DiscountApprovalLevel,
} from "@prisma/client";

import { createQuotation, submitQuotation } from "../src/lib/modules/quotations/quotation-service";
import { createBillingFromQuotation } from "../src/lib/modules/billing/billing-service";
import { issueInvoice } from "../src/lib/modules/billing/invoice-service";
import { recordPayment } from "../src/lib/modules/billing/payment-service";
import { billSubscription } from "../src/lib/modules/billing/subscription-service";
import { submitCustomerNegotiation } from "../src/lib/modules/negotiations/negotiation-service";

const prisma = new PrismaClient();

/** Rounds a Decimal to 2dp (same rule as the billing engine). */
function round2(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

const DEMO_PASSWORD = "DealFlow360!";
const PASSWORD_ROUNDS = 10;

async function main() {
  console.log("Seeding DealFlow360 database...");

  const userByEmail: Record<string, string> = {};

  const seedUsers: {
    name: string;
    email: string;
    role: Role;
    salesTeamId?: string;
  }[] = [
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
    console.log(`  user  : ${u.email} (${u.role})`);
  }

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
  ];

  for (const c of seedCustomers) {
    await prisma.customer.upsert({
      where: { email: c.email },
      update: { name: c.name, tier: c.tier },
      create: c,
    });
  }
  console.log(`  customer: ${seedCustomers.length} accounts upserted`);

  const northwindCustomer = await prisma.customer.findUnique({
    where: { email: "billing@northwindtraders.com" },
  });
  if (northwindCustomer) {
    await prisma.user.updateMany({
      where: { email: "jordan.lee@dealflow360.io" },
      data: { customerId: northwindCustomer.id },
    });
    console.log("  customer-link: jordan.lee linked to Northwind Traders Inc");
  }

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
  console.log(`  subscription plan: ${seedPlans.length} plans upserted`);

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
  console.log(`  product: ${seedProducts.length} products upserted`);

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
  console.log(`  discount tier: ${seedTiers.length} tiers upserted`);

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
  console.log(`  warehouse: ${seedWarehouses.length} warehouses upserted`);

  const beaconEdgeId = productIdBySku["EDGE-DEV-021"];
  const migrationServiceId = productIdBySku["MIG-SVC-031"];
  const titanSupportId = productIdBySku["SUP-PLT-041"];
  const crmEnterpriseId = productIdBySku["CRM-ENT-001"];
  const analyticsProId = productIdBySku["ANL-PRO-002"];
  const cincinnatiId = warehouseIdByName["Cincinnati Distribution Center"];
  const renoId = warehouseIdByName["Reno Logistics Hub"];

  const seedInventory = [
    {
      warehouseId: cincinnatiId,
      productId: beaconEdgeId,
      quantity: 120,
      reservedQuantity: 8,
    },
    {
      warehouseId: renoId,
      productId: beaconEdgeId,
      quantity: 80,
      reservedQuantity: 5,
    },
    {
      warehouseId: cincinnatiId,
      productId: migrationServiceId,
      quantity: 15,
      reservedQuantity: 2,
    },
    {
      warehouseId: renoId,
      productId: titanSupportId,
      quantity: 200,
      reservedQuantity: 10,
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
        reservedQuantity: inv.reservedQuantity,
      },
      create: inv,
    });
  }
  console.log(`  inventory: ${seedInventory.length} records upserted`);

  // -------------------------------------------------------------------------
  // Reservation-ledger reconciliation (Phase 5)
  // -------------------------------------------------------------------------
  // The Phase 1 seed set non-zero reservedQuantity values before the
  // InventoryReservation ledger existed. To make reserved inventory auditable
  // without changing effective availability (quantity − reservedQuantity), we
  // back each legacy reserved counter with an ACTIVE reservation ledger row
  // (not tied to any allocation) when none exists. This is deterministic and
  // idempotent: re-running the seed never double-books.
  const legacyReserved = await prisma.inventory.findMany({
    where: { reservedQuantity: { gt: 0 } },
    select: { id: true, reservedQuantity: true },
  });
  for (const row of legacyReserved) {
    const hasLedger = await prisma.inventoryReservation.count({
      where: { inventoryId: row.id, status: "ACTIVE" },
    });
    if (hasLedger === 0) {
      await prisma.inventoryReservation.create({
        data: {
          inventoryId: row.id,
          quantity: row.reservedQuantity,
          status: "ACTIVE",
        },
      });
      console.log(
        `  reservation: backfilled ${row.reservedQuantity} units for inventory ${row.id}`
      );
    }
  }

  // -----------------------------------------------------------------------
  // Phase 6 demo: hybrid billing scenarios
  // -----------------------------------------------------------------------
  // Only created on a database that has no invoices yet (fresh setup / after a
  // migrate reset). Re-running the seed after the app has been used leaves
  // the demo billing data untouched, so quotation numbers and invoices are
  // never duplicated. Every artifact is produced through the real domain
  // services (createQuotation → submit → billing → issue → payments), so the
  // state machines, pricing and Decimal arithmetic are authoritative.
  const existingInvoices = await prisma.invoice.count();
  if (existingInvoices > 0) {
    console.log("  billing: demo scenarios skipped (invoices already exist)");
  } else {
    const mayaId = userByEmail["maya.chen@dealflow360.io"];
    const priyaId = userByEmail["priya.nair@dealflow360.io"];
    if (mayaId && priyaId) {
      const salesRepActor = { userId: mayaId, role: Role.SALES_REP };
      const financeActor = { userId: priyaId, role: Role.FINANCE };

      const customerIdByEmail: Record<string, string> = {};
      for (const c of seedCustomers) {
        const customer = await prisma.customer.findUnique({
          where: { email: c.email },
          select: { id: true },
        });
        if (customer) customerIdByEmail[c.email] = customer.id;
      }
      const northwind = customerIdByEmail["billing@northwindtraders.com"];
      const bluepeak = customerIdByEmail["procurement@bluepeakmfg.com"];
      const helios = customerIdByEmail["finance@helioslogistics.com"];

      const edge = productIdBySku["EDGE-DEV-021"];
      const migration = productIdBySku["MIG-SVC-031"];
      const crm = productIdBySku["CRM-ENT-001"];
      const analytics = productIdBySku["ANL-PRO-002"];
      const api = productIdBySku["API-ACC-011"];

      // Helper: build a quotation and run it through submit. Discounts are
      // kept within each product's limit so the deterministic risk check is
      // LOW and the quotation is APPROVED without a manager/finance chain.
      async function approvedQuote(
        customerId: string,
        label: string,
        lines: { productId: string; quantity: number; unitPrice: number; discountPercent: number }[]
      ) {
        const quote = await createQuotation({
          salesRepId: mayaId,
          customerId,
          lines,
        });
        await submitQuotation(quote.id, salesRepActor);
        console.log(`  billing demo: ${label} → ${quote.quotationNumber} (APPROVED)`);
        return quote;
      }

      // 1–3. One-time / recurring / hybrid quotations left APPROVED and
      // unbilled — Finance sees these in the “ready to bill” pool.
      if (northwind && edge) {
        await approvedQuote(northwind, "one-time (Beacon Edge ×2)", [
          { productId: edge, quantity: 2, unitPrice: 999, discountPercent: 5 },
        ]);
      }
      if (bluepeak && crm) {
        await approvedQuote(bluepeak, "recurring (CRM Enterprise ×1)", [
          { productId: crm, quantity: 1, unitPrice: 240, discountPercent: 20 },
        ]);
      }
      if (helios && edge && analytics) {
        await approvedQuote(helios, "hybrid (Beacon Edge ×1 + Analytics Pro ×1)", [
          { productId: edge, quantity: 1, unitPrice: 999, discountPercent: 5 },
          { productId: analytics, quantity: 1, unitPrice: 120, discountPercent: 10 },
        ]);
      }

      // 4. One-time quotation that is billed and issued (no payment yet).
      if (northwind && migration) {
        const q = await approvedQuote(northwind, "billed one-time (Data Migration ×1)", [
          { productId: migration, quantity: 1, unitPrice: 8000, discountPercent: 10 },
        ]);
        const billing = await createBillingFromQuotation(q.id, financeActor);
        if (billing.oneTimeInvoice) {
          await issueInvoice(billing.oneTimeInvoice.id, financeActor);
          console.log(
            `  billing demo: invoice ${billing.oneTimeInvoice.invoiceNumber} ISSUED`
          );
        }
      }

      // 5. Recurring quotation fully billed and paid, then the next period is
      // generated — an active subscription with billing history + upcoming
      // schedule.
      if (bluepeak && analytics) {
        const q = await approvedQuote(bluepeak, "billed recurring (Analytics Pro ×1)", [
          { productId: analytics, quantity: 1, unitPrice: 120, discountPercent: 10 },
        ]);
        const billing = await createBillingFromQuotation(q.id, financeActor);
        const subscription = billing.subscriptions[0];
        if (subscription) {
          const firstInvoice = subscription.schedules[0]?.invoice;
          if (firstInvoice) {
            await issueInvoice(firstInvoice.id, financeActor);
            const full = await prisma.invoice.findUniqueOrThrow({
              where: { id: firstInvoice.id },
              select: { total: true },
            });
            await recordPayment(firstInvoice.id, financeActor, {
              amount: full.total.toString(),
              method: "BANK_TRANSFER",
              reference: `Seed payment for ${firstInvoice.invoiceNumber}`,
            });
            console.log(
              `  billing demo: recurring invoice ${firstInvoice.invoiceNumber} PAID`
            );
          }
          // Generate the next billing period so the subscription shows an
          // upcoming (DRAFT invoice / DUE schedule) cycle.
          const next = await billSubscription(subscription.id, financeActor);
          console.log(
            `  billing demo: subscription ${subscription.id} — next period scheduled (invoice ${next.invoiceId})`
          );
        }
      }

      // 6. Hybrid quotation billed and partially paid on the one-time
      // invoice; the recurring line becomes an active subscription.
      if (helios && edge && api) {
        const q = await approvedQuote(helios, "billed hybrid (Beacon Edge ×2 + API Access ×1)", [
          { productId: edge, quantity: 2, unitPrice: 999, discountPercent: 5 },
          { productId: api, quantity: 1, unitPrice: 650, discountPercent: 10 },
        ]);
        const billing = await createBillingFromQuotation(q.id, financeActor);
        if (billing.oneTimeInvoice) {
          await issueInvoice(billing.oneTimeInvoice.id, financeActor);
          const total = await prisma.invoice.findUniqueOrThrow({
            where: { id: billing.oneTimeInvoice.id },
            select: { total: true },
          });
          // Record ~40% so the invoice is PARTIALLY_PAID.
          const partial = round2(new Prisma.Decimal(total.total.toString()).times("0.4"));
          await recordPayment(billing.oneTimeInvoice.id, financeActor, {
            amount: partial.toString(),
            method: "BANK_TRANSFER",
            reference: `Seed partial payment for ${billing.oneTimeInvoice.invoiceNumber}`,
          });
          console.log(
            `  billing demo: invoice ${billing.oneTimeInvoice.invoiceNumber} PARTIALLY_PAID`
          );
        }
        if (billing.subscriptions.length > 0) {
          console.log(
            `  billing demo: hybrid subscription created (${billing.subscriptions[0].id})`
          );
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 7 demo: customer quotation negotiation
  // -----------------------------------------------------------------------
  const existingNegotiations = await prisma.quotationNegotiation.count();
  if (existingNegotiations > 0) {
    console.log("  negotiation: demo scenarios skipped (negotiations already exist)");
  } else {
    const jordan = await prisma.user.findUnique({
      where: { email: "jordan.lee@dealflow360.io" },
    });
    const maya = await prisma.user.findUnique({
      where: { email: "maya.chen@dealflow360.io" },
    });
    const northwind = await prisma.customer.findUnique({
      where: { email: "billing@northwindtraders.com" },
    });
    const beaconEdge = await prisma.product.findUnique({
      where: { sku: "EDGE-DEV-021" },
    });

    if (jordan && maya && northwind && beaconEdge) {
      const q = await createQuotation({
        salesRepId: maya.id,
        customerId: northwind.id,
        lines: [
          { productId: beaconEdge.id, quantity: 2, unitPrice: 999, discountPercent: 5 },
        ],
      });
      await submitQuotation(q.id, { userId: maya.id, role: Role.SALES_REP });
      await submitCustomerNegotiation(q.id, northwind.id, jordan.id, {
        message:
          "We are planning to deploy the Beacon Edge Device across 4 distribution hubs. If we commit to 4 units, can you provide a 15% volume discount?",
        targetTotal: 3400,
        proposedLines: [
          { productId: beaconEdge.id, requestedQuantity: 4, requestedDiscountPercent: 15 },
        ],
      });
      console.log(`  negotiation demo: ${q.quotationNumber} submitted UNDER_NEGOTIATION`);
    }
  }

  console.log("Seed complete.");
  console.log("");
  console.log(`Demo password for all seeded users: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });