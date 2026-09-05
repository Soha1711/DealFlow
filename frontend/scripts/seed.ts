import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  BillingInterval,
  CustomerTier,
  DiscountApprovalLevel,
  Role,
} from "@prisma/client";

const prisma = new PrismaClient();

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