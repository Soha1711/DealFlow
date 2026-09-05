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
import {
  createFulfillment,
  allocateFulfillment,
  fulfillFulfillment,
} from "../src/lib/modules/fulfillment/fulfillment-service";
import { createBillingFromQuotation } from "../src/lib/modules/billing/billing-service";
import { issueInvoice } from "../src/lib/modules/billing/invoice-service";
import { recordPayment } from "../src/lib/modules/billing/payment-service";
import { billSubscription } from "../src/lib/modules/billing/subscription-service";
import {
  submitCustomerNegotiation,
  counterNegotiation,
  acceptNegotiation,
} from "../src/lib/modules/negotiations/negotiation-service";

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
  await prisma.inventory.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.quotationLine.deleteMany();
  await prisma.quotation.deleteMany();
  console.log("  reset: transactional tables ready.");
}

async function main() {
  console.log("\n==========================================================");
  console.log("Seeding DealFlow360 Large, Connected Demo Dataset...");
  console.log("==========================================================\n");

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

  // 2. Seed Customers (12 accounts across all tiers)
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
    {
      name: "Vanguard Aerospace Corp",
      email: "procurement@vanguardaero.com",
      tier: CustomerTier.PLATINUM,
    },
    {
      name: "Stellar Dynamics LLC",
      email: "accounts@stellardynamics.io",
      tier: CustomerTier.GOLD,
    },
    {
      name: "OmniCorp International",
      email: "finance@omnicorpglobal.com",
      tier: CustomerTier.PLATINUM,
    },
    {
      name: "Meridian BioTech",
      email: "purchasing@meridianbio.com",
      tier: CustomerTier.SILVER,
    },
    {
      name: "Summit Financial Tech",
      email: "vendor-management@summitfintech.com",
      tier: CustomerTier.PLATINUM,
    },
    {
      name: "Quantum Robotics Labs",
      email: "supply-chain@quantumrobotics.ai",
      tier: CustomerTier.GOLD,
    },
    {
      name: "Cascade Media Networks",
      email: "accounts.payable@cascademedia.net",
      tier: CustomerTier.STANDARD,
    },
    {
      name: "Pacific Coast Distribution",
      email: "billing@pacificcoastdist.com",
      tier: CustomerTier.SILVER,
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

  // 3. Subscription Plans (6 Plans)
  const seedPlans = [
    { name: "CRM Enterprise", price: 240.0, billingInterval: BillingInterval.ANNUAL },
    { name: "Analytics Pro", price: 120.0, billingInterval: BillingInterval.MONTHLY },
    { name: "API Access", price: 650.0, billingInterval: BillingInterval.MONTHLY },
    { name: "Cloud Security Suite", price: 450.0, billingInterval: BillingInterval.MONTHLY },
    { name: "Cloud Backup Pro", price: 85.0, billingInterval: BillingInterval.MONTHLY },
    { name: "AI Insights Platform", price: 1200.0, billingInterval: BillingInterval.ANNUAL },
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

  // 4. Products Catalog (32 items)
  const seedProducts = [
    // Software / SaaS Subscriptions
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
      name: "Cloud Security Suite",
      sku: "SEC-ENT-004",
      category: "Software",
      price: 450.0,
      cost: 180.0,
      maxDiscountPercent: 25,
      isRecurring: true,
      subscriptionPlanId: planIdByName["Cloud Security Suite"],
    },
    {
      name: "Cloud Backup Pro",
      sku: "BKP-PRO-005",
      category: "Software",
      price: 85.0,
      cost: 30.0,
      maxDiscountPercent: 15,
      isRecurring: true,
      subscriptionPlanId: planIdByName["Cloud Backup Pro"],
    },
    {
      name: "DevOps Toolchain Cloud",
      sku: "DEV-OPS-006",
      category: "Software",
      price: 300.0,
      cost: 110.0,
      maxDiscountPercent: 20,
      isRecurring: true,
      subscriptionPlanId: planIdByName["API Access"],
    },
    {
      name: "AI Insights Platform",
      sku: "AI-INS-007",
      category: "Software",
      price: 1200.0,
      cost: 420.0,
      maxDiscountPercent: 30,
      isRecurring: true,
      subscriptionPlanId: planIdByName["AI Insights Platform"],
    },
    {
      name: "Pulse Observability Agent",
      sku: "OBS-MON-008",
      category: "Software",
      price: 95.0,
      cost: 35.0,
      maxDiscountPercent: 15,
      isRecurring: true,
      subscriptionPlanId: planIdByName["Cloud Backup Pro"],
    },

    // Hardware / Physical Devices
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
      name: "Cloud Sentinel Appliance",
      sku: "SENT-APP-051",
      category: "Hardware",
      price: 3500.0,
      cost: 2100.0,
      maxDiscountPercent: 10,
      isRecurring: false,
    },
    {
      name: "Industrial IoT Gateway",
      sku: "GW-IND-052",
      category: "Hardware",
      price: 1450.0,
      cost: 820.0,
      maxDiscountPercent: 10,
      isRecurring: false,
    },
    {
      name: "HyperEdge MicroServer",
      sku: "SRV-RACK-053",
      category: "Hardware",
      price: 4800.0,
      cost: 3100.0,
      maxDiscountPercent: 8,
      isRecurring: false,
    },
    {
      name: "Core 48-Port Fiber Switch",
      sku: "NET-SW-054",
      category: "Hardware",
      price: 2200.0,
      cost: 1350.0,
      maxDiscountPercent: 12,
      isRecurring: false,
    },
    {
      name: "Hardware Security Module",
      sku: "SEC-HSM-055",
      category: "Hardware",
      price: 5500.0,
      cost: 3600.0,
      maxDiscountPercent: 5,
      isRecurring: false,
    },
    {
      name: "Smart Rackmount UPS",
      sku: "PWR-UPS-056",
      category: "Hardware",
      price: 1100.0,
      cost: 680.0,
      maxDiscountPercent: 10,
      isRecurring: false,
    },
    {
      name: "High-Density AP Array",
      sku: "WIFI-AP-057",
      category: "Hardware",
      price: 750.0,
      cost: 420.0,
      maxDiscountPercent: 15,
      isRecurring: false,
    },
    {
      name: "FlashArray SAN Node",
      sku: "STG-SAN-058",
      category: "Hardware",
      price: 8900.0,
      cost: 5900.0,
      maxDiscountPercent: 8,
      isRecurring: false,
    },
    {
      name: "Environmental Telemetry Probe",
      sku: "SEN-ENV-059",
      category: "Hardware",
      price: 320.0,
      cost: 175.0,
      maxDiscountPercent: 20,
      isRecurring: false,
    },

    // Services
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
      name: "Cloud Architecture Review",
      sku: "ARC-REV-032",
      category: "Services",
      price: 4500.0,
      cost: 2700.0,
      maxDiscountPercent: 20,
      isRecurring: false,
    },
    {
      name: "Enterprise Security Audit",
      sku: "SEC-AUD-033",
      category: "Services",
      price: 12000.0,
      cost: 7500.0,
      maxDiscountPercent: 15,
      isRecurring: false,
    },
    {
      name: "Custom API Integration Pack",
      sku: "INT-DEV-034",
      category: "Services",
      price: 9500.0,
      cost: 6000.0,
      maxDiscountPercent: 15,
      isRecurring: false,
    },
    {
      name: "On-Site Engineering Workshop",
      sku: "TRN-ONS-035",
      category: "Services",
      price: 3500.0,
      cost: 1900.0,
      maxDiscountPercent: 25,
      isRecurring: false,
    },
    {
      name: "Performance Optimization Sprint",
      sku: "OPT-PER-036",
      category: "Services",
      price: 6000.0,
      cost: 3800.0,
      maxDiscountPercent: 15,
      isRecurring: false,
    },
    {
      name: "Custom Workflows Consulting",
      sku: "DEV-CUS-037",
      category: "Services",
      price: 7500.0,
      cost: 4500.0,
      maxDiscountPercent: 10,
      isRecurring: false,
    },

    // Support & Infrastructure
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
      name: "Gold 24/7 SLA Support",
      sku: "SUP-GLD-042",
      category: "Support",
      price: 3600.0,
      cost: 2400.0,
      maxDiscountPercent: 15,
      isRecurring: false,
    },
    {
      name: "Dedicated Technical Account Manager",
      sku: "SUP-TAM-043",
      category: "Support",
      price: 15000.0,
      cost: 9500.0,
      maxDiscountPercent: 10,
      isRecurring: false,
    },
    {
      name: "High-Speed Fiber Optic Pack",
      sku: "CAB-FBR-061",
      category: "Accessories",
      price: 180.0,
      cost: 75.0,
      maxDiscountPercent: 20,
      isRecurring: false,
    },
    {
      name: "10G SFP+ Optical Transceivers",
      sku: "TRN-SFP-062",
      category: "Accessories",
      price: 250.0,
      cost: 110.0,
      maxDiscountPercent: 15,
      isRecurring: false,
    },
    {
      name: "42U Server Rack Enclosure",
      sku: "ENC-RCK-063",
      category: "Infrastructure",
      price: 1950.0,
      cost: 1200.0,
      maxDiscountPercent: 10,
      isRecurring: false,
    },
    {
      name: "Field Deployment Accessory Kit",
      sku: "ACC-KIT-064",
      category: "Accessories",
      price: 340.0,
      cost: 160.0,
      maxDiscountPercent: 20,
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

  // 6. Multi-Warehouse Setup (6 Warehouses)
  const seedWarehouses = [
    { name: "Cincinnati Distribution Center", location: "Cincinnati, OH, USA" },
    { name: "Reno Logistics Hub", location: "Reno, NV, USA" },
    { name: "Dallas Logistics Hub", location: "Dallas, TX, USA" },
    { name: "Atlanta Distribution Center", location: "Atlanta, GA, USA" },
    { name: "Frankfurt European Gateway", location: "Frankfurt, Germany" },
    { name: "Singapore APAC Depot", location: "Singapore" },
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
  const dallasId = warehouseIdByName["Dallas Logistics Hub"];
  const atlantaId = warehouseIdByName["Atlanta Distribution Center"];
  const frankfurtId = warehouseIdByName["Frankfurt European Gateway"];
  const singaporeId = warehouseIdByName["Singapore APAC Depot"];

  // 7. Controlled Reset of Transactional Data
  await resetTransactionalData();

  // 8. Re-initialize authoritative Inventory across Warehouses
  const seedInventory: Array<{
    warehouseId: string;
    productId: string;
    quantity: number;
    reservedQuantity: number;
  }> = [];

  // Physical products that have warehouse inventory (appliances, network, storage, servers, hardware, accessories)
  // Note: pure SaaS cloud subscriptions and consulting services do not occupy warehouse shelf inventory
  const physicalSkus = new Set([
    "EDGE-DEV-021",
    "SENT-APP-051",
    "GW-IND-052",
    "SRV-RACK-053",
    "NET-SW-054",
    "SEC-HSM-055",
    "PWR-UPS-056",
    "WIFI-AP-057",
    "STG-SAN-058",
    "SEN-ENV-059",
    "CAB-FBR-061",
    "TRN-SFP-062",
    "ENC-RCK-063",
    "ACC-KIT-064",
    "MIG-SVC-031",
    "SUP-PLT-041",
    "SUP-GLD-042",
    "SUP-TAM-043",
  ]);

  for (const [sku, pId] of Object.entries(productIdBySku)) {
    if (!physicalSkus.has(sku)) continue;

    if (sku === "SENT-APP-051") {
      // Cloud Sentinel Appliance: constrained stock
      seedInventory.push(
        { warehouseId: cincinnatiId, productId: pId, quantity: 8, reservedQuantity: 0 },
        { warehouseId: renoId, productId: pId, quantity: 6, reservedQuantity: 0 }
      );
    } else if (sku === "SEC-HSM-055") {
      // Hardware Security Module: constrained stock in Dallas only
      seedInventory.push(
        { warehouseId: dallasId, productId: pId, quantity: 3, reservedQuantity: 0 }
      );
    } else if (sku === "EDGE-DEV-021") {
      // Beacon Edge Device: well-stocked across all facilities (>1,100 total units)
      seedInventory.push(
        { warehouseId: cincinnatiId, productId: pId, quantity: 350, reservedQuantity: 0 },
        { warehouseId: renoId, productId: pId, quantity: 250, reservedQuantity: 0 },
        { warehouseId: dallasId, productId: pId, quantity: 200, reservedQuantity: 0 },
        { warehouseId: atlantaId, productId: pId, quantity: 150, reservedQuantity: 0 },
        { warehouseId: frankfurtId, productId: pId, quantity: 120, reservedQuantity: 0 },
        { warehouseId: singaporeId, productId: pId, quantity: 100, reservedQuantity: 0 }
      );
    } else {
      // General catalog physical inventory
      seedInventory.push(
        { warehouseId: cincinnatiId, productId: pId, quantity: 150, reservedQuantity: 0 },
        { warehouseId: renoId, productId: pId, quantity: 120, reservedQuantity: 0 },
        { warehouseId: dallasId, productId: pId, quantity: 90, reservedQuantity: 0 },
        { warehouseId: atlantaId, productId: pId, quantity: 80, reservedQuantity: 0 }
      );
    }
  }

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
  console.log(`  inventory: configured ${seedInventory.length} inventory allocations across 6 warehouses`);

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
  const vanguardId = customerIdByEmail["procurement@vanguardaero.com"];
  const stellarId = customerIdByEmail["accounts@stellardynamics.io"];
  const omniId = customerIdByEmail["finance@omnicorpglobal.com"];
  const meridianId = customerIdByEmail["purchasing@meridianbio.com"];
  const summitId = customerIdByEmail["vendor-management@summitfintech.com"];
  const quantumId = customerIdByEmail["supply-chain@quantumrobotics.ai"];
  const cascadeId = customerIdByEmail["accounts.payable@cascademedia.net"];
  const pacificId = customerIdByEmail["billing@pacificcoastdist.com"];

  // Shorthands for product IDs
  const beaconId = productIdBySku["EDGE-DEV-021"];
  const sentinelId = productIdBySku["SENT-APP-051"];
  const crmId = productIdBySku["CRM-ENT-001"];
  const anlId = productIdBySku["ANL-PRO-002"];
  const secSuiteId = productIdBySku["SEC-ENT-004"];
  const bkpId = productIdBySku["BKP-PRO-005"];
  const devOpsId = productIdBySku["DEV-OPS-006"];
  const aiInsId = productIdBySku["AI-INS-007"];
  const obsId = productIdBySku["OBS-MON-008"];
  const iotGwId = productIdBySku["GW-IND-052"];
  const serverId = productIdBySku["SRV-RACK-053"];
  const switchId = productIdBySku["NET-SW-054"];
  const hsmId = productIdBySku["SEC-HSM-055"];
  const upsId = productIdBySku["PWR-UPS-056"];
  const apId = productIdBySku["WIFI-AP-057"];
  const sanId = productIdBySku["STG-SAN-058"];
  const probeId = productIdBySku["SEN-ENV-059"];
  const migId = productIdBySku["MIG-SVC-031"];
  const archId = productIdBySku["ARC-REV-032"];
  const secAudId = productIdBySku["SEC-AUD-033"];
  const intId = productIdBySku["INT-DEV-034"];
  const workshopId = productIdBySku["TRN-ONS-035"];
  const optId = productIdBySku["OPT-PER-036"];
  const consultingId = productIdBySku["DEV-CUS-037"];
  const titanId = productIdBySku["SUP-PLT-041"];
  const goldSupportId = productIdBySku["SUP-GLD-042"];
  const tamId = productIdBySku["SUP-TAM-043"];
  const fiberId = productIdBySku["CAB-FBR-061"];
  const sfpId = productIdBySku["TRN-SFP-062"];
  const rackId = productIdBySku["ENC-RCK-063"];
  const accId = productIdBySku["ACC-KIT-064"];

  console.log("\n  --- SEEDING CONNECTED REALISTIC QUOTATION PORTFOLIO (50 DEALS) ---");

  // =========================================================================
  // COHORT A: SALES REP DRAFTS & PIPELINE DEALS (8 Deals)
  // =========================================================================
  const q1 = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [
      { productId: beaconId, quantity: 2, unitPrice: 999, discountPercent: 0 },
      { productId: crmId, quantity: 1, unitPrice: 240, discountPercent: 0 },
      { productId: fiberId, quantity: 2, unitPrice: 180, discountPercent: 0 },
    ],
  });
  console.log(`  [DRAFT] ${q1.quotationNumber}: Bluepeak Draft (Target for AI Cross-Sell Recommendations)`);

  const q2 = await createQuotation({
    salesRepId: mayaId,
    customerId: apexId,
    lines: [
      { productId: switchId, quantity: 2, unitPrice: 2200, discountPercent: 5 },
      { productId: fiberId, quantity: 4, unitPrice: 180, discountPercent: 5 },
      { productId: sfpId, quantity: 4, unitPrice: 250, discountPercent: 5 },
    ],
  });
  console.log(`  [DRAFT] ${q2.quotationNumber}: Apex Global Network Core Draft`);

  const q3 = await createQuotation({
    salesRepId: mayaId,
    customerId: vanguardId,
    lines: [
      { productId: secSuiteId, quantity: 5, unitPrice: 450, discountPercent: 5 },
      { productId: migId, quantity: 1, unitPrice: 8000, discountPercent: 5 },
      { productId: bkpId, quantity: 5, unitPrice: 85, discountPercent: 5 },
    ],
  });
  console.log(`  [DRAFT] ${q3.quotationNumber}: Vanguard Cloud Security Draft`);

  const q4 = await createQuotation({
    salesRepId: mayaId,
    customerId: stellarId,
    lines: [
      { productId: iotGwId, quantity: 4, unitPrice: 1450, discountPercent: 5 },
      { productId: probeId, quantity: 10, unitPrice: 320, discountPercent: 5 },
      { productId: accId, quantity: 2, unitPrice: 340, discountPercent: 5 },
    ],
  });
  console.log(`  [DRAFT] ${q4.quotationNumber}: Stellar Dynamics IoT Edge Draft`);

  const q5 = await createQuotation({
    salesRepId: mayaId,
    customerId: omniId,
    lines: [
      { productId: serverId, quantity: 1, unitPrice: 4800, discountPercent: 4 },
      { productId: upsId, quantity: 2, unitPrice: 1100, discountPercent: 4 },
      { productId: rackId, quantity: 1, unitPrice: 1950, discountPercent: 4 },
    ],
  });
  console.log(`  [DRAFT] ${q5.quotationNumber}: OmniCorp MicroServer Stack Draft`);

  const q6 = await createQuotation({
    salesRepId: mayaId,
    customerId: meridianId,
    lines: [
      { productId: anlId, quantity: 10, unitPrice: 120, discountPercent: 8 },
      { productId: bkpId, quantity: 10, unitPrice: 85, discountPercent: 8 },
      { productId: obsId, quantity: 10, unitPrice: 95, discountPercent: 8 },
    ],
  });
  console.log(`  [DRAFT] ${q6.quotationNumber}: Meridian BioTech SaaS Draft`);

  const q7 = await createQuotation({
    salesRepId: mayaId,
    customerId: summitId,
    lines: [
      { productId: aiInsId, quantity: 2, unitPrice: 1200, discountPercent: 5 },
      { productId: tamId, quantity: 1, unitPrice: 15000, discountPercent: 5 },
      { productId: secAudId, quantity: 1, unitPrice: 12000, discountPercent: 5 },
    ],
  });
  console.log(`  [DRAFT] ${q7.quotationNumber}: Summit FinTech AI Enterprise Draft`);

  // Stagnant Draft (>15 days old to demonstrate STAGNANT_DRAFT anomaly)
  const q8 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: beaconId, quantity: 2, unitPrice: 999, discountPercent: 5 },
      { productId: titanId, quantity: 1, unitPrice: 1800, discountPercent: 5 },
      { productId: accId, quantity: 2, unitPrice: 340, discountPercent: 5 },
    ],
  });
  const eighteenDaysAgo = new Date();
  eighteenDaysAgo.setDate(eighteenDaysAgo.getDate() - 18);
  await prisma.quotation.update({
    where: { id: q8.id },
    data: { createdAt: eighteenDaysAgo, updatedAt: eighteenDaysAgo },
  });
  console.log(`  [DRAFT] ${q8.quotationNumber}: Northwind Traders Stagnant Draft (18d old -> STAGNANT_DRAFT anomaly)`);

  // =========================================================================
  // COHORT B: AUTO-APPROVED PROPOSALS (Discount <= 10%, Low Risk) (8 Deals)
  // =========================================================================
  const q9 = await createQuotation({
    salesRepId: mayaId,
    customerId: apexId,
    lines: [
      { productId: beaconId, quantity: 3, unitPrice: 999, discountPercent: 5 },
      { productId: accId, quantity: 3, unitPrice: 340, discountPercent: 5 },
    ],
  });
  await submitQuotation(q9.id, salesRepActor);

  const q10 = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [
      { productId: iotGwId, quantity: 2, unitPrice: 1450, discountPercent: 8 },
      { productId: probeId, quantity: 4, unitPrice: 320, discountPercent: 8 },
    ],
  });
  await submitQuotation(q10.id, salesRepActor);

  const q11 = await createQuotation({
    salesRepId: mayaId,
    customerId: vanguardId,
    lines: [
      { productId: switchId, quantity: 1, unitPrice: 2200, discountPercent: 6 },
      { productId: sfpId, quantity: 2, unitPrice: 250, discountPercent: 6 },
      { productId: fiberId, quantity: 4, unitPrice: 180, discountPercent: 6 },
    ],
  });
  await submitQuotation(q11.id, salesRepActor);

  const q12 = await createQuotation({
    salesRepId: mayaId,
    customerId: stellarId,
    lines: [
      { productId: crmId, quantity: 3, unitPrice: 240, discountPercent: 5 },
      { productId: bkpId, quantity: 3, unitPrice: 85, discountPercent: 5 },
    ],
  });
  await submitQuotation(q12.id, salesRepActor);

  const q13 = await createQuotation({
    salesRepId: mayaId,
    customerId: meridianId,
    lines: [
      { productId: archId, quantity: 1, unitPrice: 4500, discountPercent: 8 },
      { productId: workshopId, quantity: 1, unitPrice: 3500, discountPercent: 8 },
    ],
  });
  await submitQuotation(q13.id, salesRepActor);

  const q14 = await createQuotation({
    salesRepId: mayaId,
    customerId: cascadeId,
    lines: [
      { productId: serverId, quantity: 1, unitPrice: 4800, discountPercent: 4 },
      { productId: rackId, quantity: 1, unitPrice: 1950, discountPercent: 4 },
    ],
  });
  await submitQuotation(q14.id, salesRepActor);

  const q15 = await createQuotation({
    salesRepId: mayaId,
    customerId: pacificId,
    lines: [
      { productId: upsId, quantity: 4, unitPrice: 1100, discountPercent: 7 },
      { productId: accId, quantity: 4, unitPrice: 340, discountPercent: 7 },
    ],
  });
  await submitQuotation(q15.id, salesRepActor);

  const q16 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: crmId, quantity: 5, unitPrice: 240, discountPercent: 5 },
      { productId: anlId, quantity: 5, unitPrice: 120, discountPercent: 5 },
    ],
  });
  await submitQuotation(q16.id, salesRepActor);
  console.log(`  [APPROVED] ${q9.quotationNumber} .. ${q16.quotationNumber}: Auto-approved deals (LOW risk)`);

  // =========================================================================
  // COHORT C: SALES MANAGER PENDING & EVALUATED APPROVALS (8 Deals)
  // =========================================================================
  const q17 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: apId, quantity: 4, unitPrice: 750, discountPercent: 18 },
      { productId: fiberId, quantity: 6, unitPrice: 180, discountPercent: 18 },
    ],
  });
  await submitQuotation(q17.id, salesRepActor);

  const q18 = await createQuotation({
    salesRepId: mayaId,
    customerId: heliosId,
    lines: [
      { productId: titanId, quantity: 2, unitPrice: 1800, discountPercent: 20 },
      { productId: goldSupportId, quantity: 1, unitPrice: 3600, discountPercent: 20 },
    ],
  });
  await submitQuotation(q18.id, salesRepActor);
  const appQ18 = await prisma.approval.findFirst({ where: { quotationId: q18.id, level: "MANAGER" } });
  if (appQ18) await approveApproval(appQ18.id, managerActor);

  const q19 = await createQuotation({
    salesRepId: mayaId,
    customerId: omniId,
    lines: [
      { productId: sanId, quantity: 1, unitPrice: 8900, discountPercent: 15 },
      { productId: switchId, quantity: 1, unitPrice: 2200, discountPercent: 15 },
    ],
  });
  await submitQuotation(q19.id, salesRepActor);

  const q20 = await createQuotation({
    salesRepId: mayaId,
    customerId: summitId,
    lines: [
      { productId: secAudId, quantity: 1, unitPrice: 12000, discountPercent: 16 },
      { productId: intId, quantity: 1, unitPrice: 9500, discountPercent: 16 },
    ],
  });
  await submitQuotation(q20.id, salesRepActor);

  const q21 = await createQuotation({
    salesRepId: mayaId,
    customerId: quantumId,
    lines: [
      { productId: iotGwId, quantity: 3, unitPrice: 1450, discountPercent: 19 },
      { productId: probeId, quantity: 8, unitPrice: 320, discountPercent: 19 },
      { productId: accId, quantity: 3, unitPrice: 340, discountPercent: 19 },
    ],
  });
  await submitQuotation(q21.id, salesRepActor);

  const q22 = await createQuotation({
    salesRepId: mayaId,
    customerId: stellarId,
    lines: [
      { productId: serverId, quantity: 2, unitPrice: 4800, discountPercent: 14 },
      { productId: upsId, quantity: 2, unitPrice: 1100, discountPercent: 14 },
    ],
  });
  await submitQuotation(q22.id, salesRepActor);

  // Stalled Approval (>6 days old)
  const q23 = await createQuotation({
    salesRepId: mayaId,
    customerId: cascadeId,
    lines: [
      { productId: optId, quantity: 1, unitPrice: 6000, discountPercent: 18 },
      { productId: consultingId, quantity: 1, unitPrice: 7500, discountPercent: 18 },
    ],
  });
  await submitQuotation(q23.id, salesRepActor);
  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 7);
  const appQ23 = await prisma.approval.findFirst({ where: { quotationId: q23.id } });
  if (appQ23) {
    await prisma.approval.update({
      where: { id: appQ23.id },
      data: { createdAt: sixDaysAgo },
    });
  }

  // Manager Rejected
  const q24 = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [{ productId: secAudId, quantity: 1, unitPrice: 12000, discountPercent: 20 }],
  });
  await submitQuotation(q24.id, salesRepActor);
  const appQ24 = await prisma.approval.findFirst({ where: { quotationId: q24.id } });
  if (appQ24) {
    await rejectApproval(appQ24.id, managerActor, "Discount exceeds regional margin hurdle rate (38%). Restructure.");
  }
  console.log(`  [APPROVALS] ${q17.quotationNumber} .. ${q24.quotationNumber}: Manager pending approvals & rejection`);

  // =========================================================================
  // COHORT D: FINANCE PENDING & DEEP DISCOUNTS (6 Deals)
  // =========================================================================
  const q25 = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [
      { productId: titanId, quantity: 3, unitPrice: 1800, discountPercent: 35 },
      { productId: consultingId, quantity: 1, unitPrice: 7500, discountPercent: 35 },
    ],
  });
  await submitQuotation(q25.id, salesRepActor);
  const appQ25 = await prisma.approval.findFirst({ where: { quotationId: q25.id, level: "MANAGER" } });
  if (appQ25) await approveApproval(appQ25.id, managerActor);

  const q26 = await createQuotation({
    salesRepId: mayaId,
    customerId: vanguardId,
    lines: [
      { productId: tamId, quantity: 1, unitPrice: 15000, discountPercent: 30 },
      { productId: secAudId, quantity: 1, unitPrice: 12000, discountPercent: 30 },
    ],
  });
  await submitQuotation(q26.id, salesRepActor);
  const appQ26 = await prisma.approval.findFirst({ where: { quotationId: q26.id, level: "MANAGER" } });
  if (appQ26) {
    await approveApproval(appQ26.id, managerActor);
    const appQ26Fin = await prisma.approval.findFirst({ where: { quotationId: q26.id, level: "FINANCE" } });
    if (appQ26Fin) await approveApproval(appQ26Fin.id, financeActor);
  }

  const q27 = await createQuotation({
    salesRepId: mayaId,
    customerId: omniId,
    lines: [
      { productId: intId, quantity: 2, unitPrice: 9500, discountPercent: 42 },
      { productId: optId, quantity: 1, unitPrice: 6000, discountPercent: 42 },
    ],
  });
  await submitQuotation(q27.id, salesRepActor);
  const appQ27 = await prisma.approval.findFirst({ where: { quotationId: q27.id, level: "MANAGER" } });
  if (appQ27) await approveApproval(appQ27.id, managerActor);

  const q28 = await createQuotation({
    salesRepId: mayaId,
    customerId: meridianId,
    lines: [
      { productId: devOpsId, quantity: 10, unitPrice: 300, discountPercent: 40 },
      { productId: anlId, quantity: 10, unitPrice: 120, discountPercent: 40 },
    ],
  });
  await submitQuotation(q28.id, salesRepActor);
  const appQ28 = await prisma.approval.findFirst({ where: { quotationId: q28.id, level: "MANAGER" } });
  if (appQ28) {
    await approveApproval(appQ28.id, managerActor);
    const appQ28Fin = await prisma.approval.findFirst({ where: { quotationId: q28.id, level: "FINANCE" } });
    if (appQ28Fin) await approveApproval(appQ28Fin.id, financeActor);
  }

  // q27: Manager approved -> Finance approved
  const appQ27Fin = await prisma.approval.findFirst({ where: { quotationId: q27.id, level: "FINANCE" } });
  if (appQ27Fin) await approveApproval(appQ27Fin.id, financeActor);

  // Agent Target 1: HIGH-RISK QUOTATION (Sentinel 30% discount exceeds 10% limit)
  const q29 = await createQuotation({
    salesRepId: mayaId,
    customerId: heliosId,
    lines: [
      { productId: sentinelId, quantity: 3, unitPrice: 3500, discountPercent: 30 },
      { productId: titanId, quantity: 1, unitPrice: 1800, discountPercent: 30 },
    ],
  });
  await submitQuotation(q29.id, salesRepActor);
  const appQ29Mgr = await prisma.approval.findFirst({ where: { quotationId: q29.id, level: "MANAGER" } });
  if (appQ29Mgr) await approveApproval(appQ29Mgr.id, managerActor);
  console.log(`  [FINANCE/RISK] ${q29.quotationNumber}: High-Risk Deal (Sentinel 30% disc exceeds 10% limit -> PENDING_FINANCE)`);

  // Finance Rejected
  const q30 = await createQuotation({
    salesRepId: mayaId,
    customerId: pacificId,
    lines: [{ productId: hsmId, quantity: 1, unitPrice: 5500, discountPercent: 22 }],
  });
  await submitQuotation(q30.id, salesRepActor);
  const appQ30Mgr = await prisma.approval.findFirst({ where: { quotationId: q30.id, level: "MANAGER" } });
  if (appQ30Mgr) {
    await approveApproval(appQ30Mgr.id, managerActor);
    const appQ30Fin = await prisma.approval.findFirst({ where: { quotationId: q30.id, level: "FINANCE" } });
    if (appQ30Fin) {
      await rejectApproval(appQ30Fin.id, financeActor, "Payment terms unacceptable for high-discount margin.");
    }
  }

  // =========================================================================
  // COHORT E: OPERATIONS & MULTI-WAREHOUSE FULFILLMENT (7 Deals)
  // =========================================================================
  // Ready to allocate
  const q31 = await createQuotation({
    salesRepId: mayaId,
    customerId: apexId,
    lines: [
      { productId: beaconId, quantity: 10, unitPrice: 999, discountPercent: 5 },
      { productId: accId, quantity: 10, unitPrice: 340, discountPercent: 5 },
    ],
  });
  await submitQuotation(q31.id, salesRepActor);

  // Agent Target 2: FULFILLMENT PROBLEM (Exceeds stock -> multi-warehouse split & backorder)
  const q32 = await createQuotation({
    salesRepId: mayaId,
    customerId: heliosId,
    lines: [{ productId: sentinelId, quantity: 20, unitPrice: 3500, discountPercent: 0 }],
  });
  await submitQuotation(q32.id, salesRepActor);
  const f32 = await createFulfillment(q32.id, opsActor);
  await allocateFulfillment(f32.id, opsActor);
  console.log(`  [OPERATIONS] ${q32.quotationNumber}: Allocated with 6 backordered (Sentinel split across Cincy & Reno)`);

  // Allocated in Reno
  const q33 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: switchId, quantity: 4, unitPrice: 2200, discountPercent: 5 },
      { productId: fiberId, quantity: 8, unitPrice: 180, discountPercent: 5 },
    ],
  });
  await submitQuotation(q33.id, salesRepActor);
  const f33 = await createFulfillment(q33.id, opsActor);
  await allocateFulfillment(f33.id, opsActor);

  // Partially fulfilled
  const q34 = await createQuotation({
    salesRepId: mayaId,
    customerId: vanguardId,
    lines: [
      { productId: serverId, quantity: 2, unitPrice: 4800, discountPercent: 5 },
      { productId: rackId, quantity: 2, unitPrice: 1950, discountPercent: 5 },
    ],
  });
  await submitQuotation(q34.id, salesRepActor);
  const f34 = await createFulfillment(q34.id, opsActor);
  await allocateFulfillment(f34.id, opsActor);

  // Fully fulfilled and completed
  const q35 = await createQuotation({
    salesRepId: mayaId,
    customerId: stellarId,
    lines: [
      { productId: upsId, quantity: 6, unitPrice: 1100, discountPercent: 5 },
      { productId: accId, quantity: 6, unitPrice: 340, discountPercent: 5 },
    ],
  });
  await submitQuotation(q35.id, salesRepActor);
  const f35 = await createFulfillment(q35.id, opsActor);
  await allocateFulfillment(f35.id, opsActor);
  await fulfillFulfillment(f35.id, opsActor);

  const q36 = await createQuotation({
    salesRepId: mayaId,
    customerId: omniId,
    lines: [
      { productId: beaconId, quantity: 2, unitPrice: 999, discountPercent: 5 },
      { productId: titanId, quantity: 1, unitPrice: 1800, discountPercent: 5 },
    ],
  });
  await submitQuotation(q36.id, salesRepActor);
  const f36 = await createFulfillment(q36.id, opsActor);
  await allocateFulfillment(f36.id, opsActor);
  await fulfillFulfillment(f36.id, opsActor);

  // Single-warehouse constrained stock (Dallas HSM has 3 units, order 5 -> 2 backordered)
  const q37 = await createQuotation({
    salesRepId: mayaId,
    customerId: quantumId,
    lines: [{ productId: hsmId, quantity: 5, unitPrice: 5500, discountPercent: 0 }],
  });
  await submitQuotation(q37.id, salesRepActor);
  const f37 = await createFulfillment(q37.id, opsActor);
  await allocateFulfillment(f37.id, opsActor);

  // Additional multi-warehouse fulfillments across all approved quotations (bringing fulfillments to 20+)
  const quotesForOps = [q9, q10, q11, q12, q13, q14, q15, q16, q27, q28];
  for (const q of quotesForOps) {
    const f = await createFulfillment(q.id, opsActor);
    if (f.status === "PENDING_ALLOCATION") {
      await allocateFulfillment(f.id, opsActor);
    }
  }

  // =========================================================================
  // COHORT F: FINANCE INVOICING, COLLECTIONS & SUBSCRIPTIONS (7 Deals)
  // =========================================================================
  // Partially paid invoice (40% wire)
  const q38 = await createQuotation({
    salesRepId: mayaId,
    customerId: heliosId,
    lines: [
      { productId: beaconId, quantity: 2, unitPrice: 999, discountPercent: 5 },
      { productId: anlId, quantity: 1, unitPrice: 120, discountPercent: 10 },
    ],
  });
  await submitQuotation(q38.id, salesRepActor);
  const bill38 = await createBillingFromQuotation(q38.id, financeActor);
  if (bill38.oneTimeInvoice) {
    await issueInvoice(bill38.oneTimeInvoice.id, financeActor);
    const partialAmount = round2(new Prisma.Decimal(bill38.oneTimeInvoice.total.toString()).times("0.4"));
    await recordPayment(bill38.oneTimeInvoice.id, financeActor, {
      amount: partialAmount.toString(),
      method: "BANK_TRANSFER",
      reference: `Wire transfer initial payment for ${bill38.oneTimeInvoice.invoiceNumber}`,
    });
  }

  // Agent Target 3: BILLING PROBLEM (Overdue invoice with failed payment attempt)
  const q39 = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [{ productId: beaconId, quantity: 3, unitPrice: 999, discountPercent: 5 }],
  });
  await submitQuotation(q39.id, salesRepActor);
  const bill39 = await createBillingFromQuotation(q39.id, financeActor);
  if (bill39.oneTimeInvoice) {
    await issueInvoice(bill39.oneTimeInvoice.id, financeActor);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    await prisma.invoice.update({
      where: { id: bill39.oneTimeInvoice.id },
      data: {
        issueDate: thirtyDaysAgo,
        dueDate: fifteenDaysAgo,
        status: "OVERDUE",
      },
    });

    await prisma.payment.create({
      data: {
        invoiceId: bill39.oneTimeInvoice.id,
        amount: bill39.oneTimeInvoice.total,
        status: "FAILED",
        method: "CREDIT_CARD",
        reference: "DECLINED_CARD_EXPIRED",
        paidAt: new Date(),
      },
    });
    console.log(`  [FINANCE] ${bill39.oneTimeInvoice.invoiceNumber}: OVERDUE with FAILED electronic payment attempt`);
  }

  // Active Subscription with Paid Period 1 and Scheduled Period 2
  const q40 = await createQuotation({
    salesRepId: mayaId,
    customerId: bluepeakId,
    lines: [{ productId: crmId, quantity: 1, unitPrice: 240, discountPercent: 10 }],
  });
  await submitQuotation(q40.id, salesRepActor);
  const bill40 = await createBillingFromQuotation(q40.id, financeActor);
  if (bill40.subscriptions[0]) {
    const sub = bill40.subscriptions[0];
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
  }

  // Active Multi-Period Paid Subscription
  const q41 = await createQuotation({
    salesRepId: mayaId,
    customerId: vanguardId,
    lines: [{ productId: secSuiteId, quantity: 2, unitPrice: 450, discountPercent: 10 }],
  });
  await submitQuotation(q41.id, salesRepActor);
  const bill41 = await createBillingFromQuotation(q41.id, financeActor);
  if (bill41.subscriptions[0]) {
    const sub = bill41.subscriptions[0];
    const firstInvoice = sub.schedules[0]?.invoice;
    if (firstInvoice) {
      await issueInvoice(firstInvoice.id, financeActor);
      const invTotal = await prisma.invoice.findUniqueOrThrow({
        where: { id: firstInvoice.id },
        select: { total: true },
      });
      await recordPayment(firstInvoice.id, financeActor, {
        amount: invTotal.total.toString(),
        method: "WIRE",
        reference: `Security suite monthly fee for ${firstInvoice.invoiceNumber}`,
      });
    }
    await billSubscription(sub.id, financeActor);
  }

  // Customer Portal Invoice (Northwind issued invoice)
  const q42 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: beaconId, quantity: 1, unitPrice: 999, discountPercent: 5 },
      { productId: accId, quantity: 1, unitPrice: 340, discountPercent: 5 },
    ],
  });
  await submitQuotation(q42.id, salesRepActor);
  const bill42 = await createBillingFromQuotation(q42.id, financeActor);
  if (bill42.oneTimeInvoice) {
    await issueInvoice(bill42.oneTimeInvoice.id, financeActor);
    console.log(`  [FINANCE] ${bill42.oneTimeInvoice.invoiceNumber}: ISSUED invoice for Northwind Traders (portal visible)`);
  }

  // Fully Paid Invoice
  const q43 = await createQuotation({
    salesRepId: mayaId,
    customerId: summitId,
    lines: [
      { productId: secSuiteId, quantity: 1, unitPrice: 450, discountPercent: 5 },
      { productId: obsId, quantity: 2, unitPrice: 95, discountPercent: 5 },
    ],
  });
  await submitQuotation(q43.id, salesRepActor);
  const bill43 = await createBillingFromQuotation(q43.id, financeActor);
  if (bill43.oneTimeInvoice) {
    await issueInvoice(bill43.oneTimeInvoice.id, financeActor);
    await recordPayment(bill43.oneTimeInvoice.id, financeActor, {
      amount: bill43.oneTimeInvoice.total.toString(),
      method: "CREDIT_CARD",
      reference: "CC_AUTH_948271",
    });
  }

  // Issued One-Time Invoice
  const q44 = await createQuotation({
    salesRepId: mayaId,
    customerId: stellarId,
    lines: [{ productId: archId, quantity: 1, unitPrice: 4500, discountPercent: 5 }],
  });
  await submitQuotation(q44.id, salesRepActor);
  const bill44 = await createBillingFromQuotation(q44.id, financeActor);
  if (bill44.oneTimeInvoice) {
    await issueInvoice(bill44.oneTimeInvoice.id, financeActor);
  }

  // Invoicing and billing for additional approved deals (bringing invoices to 25+, payments to 20+, subs to 10+, schedules to 20+)
  const billedQuotes = [q9, q10, q11, q12, q13, q14, q15, q16, q27, q28, q35, q36];
  let subCounter = 0;
  for (const q of billedQuotes) {
    const b = await createBillingFromQuotation(q.id, financeActor);
    if (b.oneTimeInvoice) {
      await issueInvoice(b.oneTimeInvoice.id, financeActor);
      await recordPayment(b.oneTimeInvoice.id, financeActor, {
        amount: b.oneTimeInvoice.total.toString(),
        method: "ACH",
        reference: `Automated settlement for ${b.oneTimeInvoice.invoiceNumber}`,
      });
    }
    if (b.subscriptions && b.subscriptions.length > 0) {
      for (const sub of b.subscriptions) {
        subCounter++;
        const inv = sub.schedules[0]?.invoice;
        if (inv) {
          await issueInvoice(inv.id, financeActor);
          const invData = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id }, select: { total: true } });
          await recordPayment(inv.id, financeActor, {
            amount: invData.total.toString(),
            method: "WIRE",
            reference: `Recurring period fee for ${inv.invoiceNumber}`,
          });
        }
        const nextBilled = await billSubscription(sub.id, financeActor);
        // Settle the second period on the first 4 subscriptions to generate multi-period paid history
        if (subCounter <= 4 && nextBilled.invoiceId) {
          await issueInvoice(nextBilled.invoiceId, financeActor);
          const nextInv = await prisma.invoice.findUniqueOrThrow({ where: { id: nextBilled.invoiceId }, select: { total: true } });
          await recordPayment(nextBilled.invoiceId, financeActor, {
            amount: nextInv.total.toString(),
            method: "ACH",
            reference: `Renewal settlement for ${nextBilled.invoiceId.slice(0, 8)}`,
          });
          await billSubscription(sub.id, financeActor);
        }
      }
    }
  }

  // Extra fulfillments on remaining billed deals to ensure operations records >= 20
  const extraFulfillQuotes = [q38, q40, q41, q42, q43, q44];
  for (const eq of extraFulfillQuotes) {
    const f = await createFulfillment(eq.id, opsActor);
    if (f.status === "PENDING_ALLOCATION") {
      await allocateFulfillment(f.id, opsActor);
    }
  }

  // =========================================================================
  // COHORT G: CUSTOMER PORTAL & NEGOTIATIONS (6 Deals)
  // =========================================================================
  // Interactive negotiation (Maya Chen COUNTERED, Jordan Lee has pending action in portal)
  const q45 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: beaconId, quantity: 2, unitPrice: 999, discountPercent: 5 },
      { productId: titanId, quantity: 1, unitPrice: 1800, discountPercent: 5 },
    ],
  });
  await submitQuotation(q45.id, salesRepActor);
  const neg45 = await submitCustomerNegotiation(q45.id, northwindId, jordanId, {
    message: "We need 6 units for our logistics expansion. Could you offer 20% discount?",
    targetTotal: 4800,
    proposedLines: [{ productId: beaconId, requestedQuantity: 6, requestedDiscountPercent: 20 }],
  });
  await counterNegotiation(neg45.id, salesRepActor, {
    message: "We can commit to 6 units at a 12% commercial discount, plus include standard warranty.",
  });
  console.log(`  [CUSTOMER/PORTAL] ${q45.quotationNumber}: Counter-offered by Maya Chen (awaiting Jordan Lee)`);

  // Agent Target 4: NEGOTIATION PROBLEM (Customer submitted proposal pending sales rep review)
  const q46 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: migId, quantity: 1, unitPrice: 8000, discountPercent: 10 },
      { productId: workshopId, quantity: 1, unitPrice: 3500, discountPercent: 10 },
    ],
  });
  await submitQuotation(q46.id, salesRepActor);
  await submitCustomerNegotiation(q46.id, northwindId, jordanId, {
    message: "Can we bundle data migration with on-site deployment assistance at no extra charge?",
    targetTotal: 7200,
  });
  console.log(`  [CUSTOMER/PORTAL] ${q46.quotationNumber}: Under Negotiation (Customer proposal pending sales review)`);

  // Stalled Negotiation (>7 days old)
  const q47 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: archId, quantity: 1, unitPrice: 4500, discountPercent: 10 },
      { productId: optId, quantity: 1, unitPrice: 6000, discountPercent: 10 },
    ],
  });
  await submitQuotation(q47.id, salesRepActor);
  const neg47 = await submitCustomerNegotiation(q47.id, northwindId, jordanId, {
    message: "Can we get accelerated deliverables within 10 business days for $3800?",
    targetTotal: 3800,
  });
  const eightDaysAgo = new Date();
  eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
  await prisma.quotationNegotiation.update({
    where: { id: neg47.id },
    data: { createdAt: eightDaysAgo },
  });

  // Approved and Ready for Jordan to click "Accept Quotation" in Customer Portal
  const q48 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: crmId, quantity: 2, unitPrice: 240, discountPercent: 10 },
      { productId: anlId, quantity: 2, unitPrice: 120, discountPercent: 10 },
    ],
  });
  await submitQuotation(q48.id, salesRepActor);
  console.log(`  [CUSTOMER/PORTAL] ${q48.quotationNumber}: Clean Approved Deal (Jordan Lee has 'Accept Quotation' button)`);

  // Accepted Historical Negotiation
  const q49 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    lines: [
      { productId: apId, quantity: 2, unitPrice: 750, discountPercent: 5 },
      { productId: fiberId, quantity: 4, unitPrice: 180, discountPercent: 5 },
    ],
  });
  await submitQuotation(q49.id, salesRepActor);
  const neg49 = await submitCustomerNegotiation(q49.id, northwindId, jordanId, {
    message: "If we increase to 4 access points, can you do 8% discount?",
    targetTotal: 2760,
    proposedLines: [{ productId: apId, requestedQuantity: 4, requestedDiscountPercent: 8 }],
  });
  await acceptNegotiation(neg49.id, salesRepActor, {
    message: "Accepted. Order updated to 4 access points at 8% commercial discount.",
  });

  // Agent Target 6: EXPIRING DEAL (validUntil expiring in 24 hours)
  const in24Hours = new Date();
  in24Hours.setHours(in24Hours.getHours() + 24);
  const q50 = await createQuotation({
    salesRepId: mayaId,
    customerId: northwindId,
    validUntil: in24Hours,
    lines: [
      { productId: beaconId, quantity: 4, unitPrice: 999, discountPercent: 25 },
      { productId: accId, quantity: 4, unitPrice: 340, discountPercent: 25 },
    ],
  });
  await submitQuotation(q50.id, salesRepActor);
  const appQ50Mgr = await prisma.approval.findFirst({ where: { quotationId: q50.id, level: "MANAGER" } });
  if (appQ50Mgr) await approveApproval(appQ50Mgr.id, managerActor);
  console.log(`  [EXPIRING/AGENT] ${q50.quotationNumber}: Expiring in 24h & 25% disc in PENDING_FINANCE (Target for Agent)`);

  // Extra customer negotiations to reach 15+ negotiations across accounts
  const extraNegDeals = [
    { quote: q17, cust: northwindId, msg: "Can we get 22% discount for bundling cables?", target: 3600 },
    { quote: q18, cust: heliosId, msg: "Requesting net-60 payment terms on support contract", target: 6000 },
    { quote: q19, cust: omniId, msg: "Can we include complimentary installation services?", target: 10000 },
    { quote: q20, cust: summitId, msg: "Requesting phased delivery across two financial quarters", target: 19000 },
    { quote: q21, cust: quantumId, msg: "Requesting additional test units before full deployment", target: 6500 },
    { quote: q22, cust: stellarId, msg: "Can we get expedited shipment within 48 hours?", target: 10500 },
    { quote: q23, cust: cascadeId, msg: "Looking for 25% educational discount for non-profit affiliate", target: 11000 },
    { quote: q31, cust: apexId, msg: "Can we lock in this unit pricing for annual replenishment?", target: 12500 },
    { quote: q33, cust: northwindId, msg: "Requesting weekend deployment support from local engineering", target: 9500 },
    { quote: q34, cust: vanguardId, msg: "Can we get redundant power supplies included in base price?", target: 12000 },
    { quote: q37, cust: quantumId, msg: "Requesting priority factory allocation for hardware security modules", target: 26000 },
    { quote: q11, cust: vanguardId, msg: "Can we include complimentary fiber patch cords?", target: 3200 },
    { quote: q14, cust: cascadeId, msg: "Requesting delayed billing until Q4 budget release", target: 6500 },
  ];

  for (const n of extraNegDeals) {
    await prisma.quotationNegotiation.create({
      data: {
        quotationId: n.quote.id,
        customerId: n.cust,
        status: "PENDING",
        message: n.msg,
        proposedChanges: { targetTotal: n.target },
        createdById: jordanId,
      },
    });
  }

  // =========================================================================
  // 9. VERIFICATION & COMPREHENSIVE SEED SUMMARY
  // =========================================================================
  const [
    userCount,
    customerCount,
    productCount,
    warehouseCount,
    inventoryCount,
    quotationCount,
    lineCount,
    approvalCount,
    fulfillmentCount,
    allocationCount,
    invoiceCount,
    paymentCount,
    subscriptionCount,
    scheduleCount,
    negotiationCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.customer.count(),
    prisma.product.count(),
    prisma.warehouse.count(),
    prisma.inventory.count(),
    prisma.quotation.count(),
    prisma.quotationLine.count(),
    prisma.approval.count(),
    prisma.fulfillment.count(),
    prisma.fulfillmentAllocation.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.subscription.count(),
    prisma.billingSchedule.count(),
    prisma.quotationNegotiation.count(),
  ]);

  console.log("\n==========================================================");
  console.log("Realistic Large Demo Dataset Generation Complete!");
  console.log("==========================================================");
  console.log(`  • Users               : ${userCount}`);
  console.log(`  • Customers           : ${customerCount} (Across all 4 tiers)`);
  console.log(`  • Products            : ${productCount} (Software, Hardware, Services, Support)`);
  console.log(`  • Warehouses          : ${warehouseCount}`);
  console.log(`  • Inventory Rows      : ${inventoryCount}`);
  console.log(`  • Quotations          : ${quotationCount} (DRAFT, APPROVED, PENDING, REJECTED, NEGOTIATION, COMPLETED)`);
  console.log(`  • Quotation Lines     : ${lineCount}`);
  console.log(`  • Approval Records    : ${approvalCount} (Manager, Finance, Approved, Rejected, Stalled)`);
  console.log(`  • Fulfillments        : ${fulfillmentCount} (Allocated, Partially Allocated, Completed)`);
  console.log(`  • Allocations         : ${allocationCount}`);
  console.log(`  • Invoices            : ${invoiceCount} (Draft, Issued, Partially Paid, Paid, Overdue)`);
  console.log(`  • Payments            : ${paymentCount} (ACH, Wire, Credit Card, Failed)`);
  console.log(`  • Subscriptions       : ${subscriptionCount} (Annual & Monthly)`);
  console.log(`  • Billing Schedules   : ${scheduleCount}`);
  console.log(`  • Negotiations        : ${negotiationCount} (Pending, Countered, Accepted, Stalled)`);
  console.log("==========================================================");
  console.log("Pre-Staged Agentic AI Demo Scenarios:");
  console.log(`  1. High-Risk Deal         : ${q29.quotationNumber} (Sentinel 25% discount exceeds product limit)`);
  console.log(`  2. Fulfillment Problem    : ${q32.quotationNumber} (Multi-warehouse split, 6 backordered)`);
  console.log(`  3. Billing Problem        : ${q39.quotationNumber} (Overdue 15d, electronic payment failed)`);
  console.log(`  4. Negotiation Problem    : ${q46.quotationNumber} (Customer submitted terms, needs review)`);
  console.log(`  5. Healthy Deal           : ${q16.quotationNumber} (Clean approved deal ready for next actions)`);
  console.log(`  6. Expiring Deal          : ${q50.quotationNumber} (Validity ends in 24 hours)`);
  console.log(`  7. Product Opportunity    : ${q1.quotationNumber} (Draft quote ready for upsell recommendations)`);
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