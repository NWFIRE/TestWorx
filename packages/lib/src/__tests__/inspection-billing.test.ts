import { reportStatuses } from "@testworx/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => ({
  prismaMock: {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    inspection: { findFirst: vi.fn() },
    customerCompany: { findFirst: vi.fn() },
    billingPayerAccount: { findFirst: vi.fn() },
    billingContractProfile: { findFirst: vi.fn() },
    providerContractProfile: { findFirst: vi.fn() },
    workOrderProviderContext: { findFirst: vi.fn() },
    providerContractRate: { findMany: vi.fn() },
    billingResolutionSnapshot: { findFirst: vi.fn(), create: vi.fn() },
    site: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    serviceFeeRule: { findMany: vi.fn() },
    minimumTicketRule: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    complianceReportingFeeRule: { findFirst: vi.fn(), findMany: vi.fn() },
    billingItemCatalogMatch: { findUnique: vi.fn(), upsert: vi.fn() },
    quickBooksCatalogItem: { findFirst: vi.fn(), findMany: vi.fn() },
    quickBooksCatalogItemAlias: { findMany: vi.fn(), upsert: vi.fn() },
    workOrderLineItem: { findMany: vi.fn(), updateMany: vi.fn() },
    inspectionBillingSummary: { findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() }
  },
  txMock: {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn(),
    inspection: { findFirst: vi.fn() },
    customerCompany: { findFirst: vi.fn() },
    billingPayerAccount: { findFirst: vi.fn() },
    billingContractProfile: { findFirst: vi.fn() },
    providerContractProfile: { findFirst: vi.fn() },
    providerContractRate: { findMany: vi.fn() },
    billingResolutionSnapshot: { findFirst: vi.fn(), create: vi.fn() },
    site: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    serviceFeeRule: { findMany: vi.fn() },
    minimumTicketRule: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    complianceReportingFeeRule: { findFirst: vi.fn(), findMany: vi.fn() },
    quickBooksCatalogItem: { findFirst: vi.fn(), findMany: vi.fn() },
    workOrderLineItem: { findMany: vi.fn(), updateMany: vi.fn() }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../quickbooks", () => ({
  saveQuickBooksItemMappingForCode: vi.fn().mockResolvedValue(undefined)
}));

import {
  addBillingSummaryManualLine,
  calculateInvoiceTotalsFromItems,
  clearBillingSummaryItemCatalogLink,
  extractBillableItemsFromDraft,
  extractBillableItemsFromFinalizedReport,
  getAdminBillingSummaryDetail,
  getAdminBillingSummaries,
  groupBillableItems,
  groupBillingReviewItems,
  linkBillingSummaryItemCatalog,
  linkBillingSummaryItemGroupCatalog,
  mergeBillingItems,
  refreshCompletedInspectionComplianceFees,
  searchBillingSummaryItemCatalogMatches,
  syncInspectionBillingSummaryTx,
  updateBillingSummaryItem,
  updateBillingSummaryItemGroup,
  updateBillingSummaryNotes
} from "../inspection-billing";
import { buildInitialReportDraft } from "../report-engine";
import { mapInspectionTypeToComplianceReportingDivision } from "../compliance-reporting-fees";
import { buildMinimumTicketResolution, resolveMinimumTicketRuleTx, selectMinimumTicketRule } from "../minimum-ticket-pricing";
import { resolveInspectionServiceFeeTx, resolveServiceFeeForLocationTx } from "../service-fees";
import { snapshotInvoiceLines } from "../billing-tax";

describe("invoice totals", () => {
  it("splits taxable and non-taxable subtotals and taxes only taxable lines", () => {
    const totals = calculateInvoiceTotalsFromItems([
      {
        id: "taxable_line",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "report_1",
        reportType: "fire_alarm",
        category: "labor",
        description: "Fire alarm labor",
        quantity: 2,
        unitPrice: 115,
        amount: 230,
        taxable: true,
        taxableSource: "quickbooks",
        quickBooksTaxableStatus: "taxable",
        quickBooksTaxCodeRef: "TAX"
      },
      {
        id: "non_taxable_line",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "report_1",
        reportType: "fire_alarm",
        category: "fee",
        description: "Service fee",
        quantity: 1,
        unitPrice: 65,
        amount: 65,
        taxable: false,
        taxableSource: "quickbooks",
        quickBooksTaxableStatus: "non_taxable",
        quickBooksTaxCodeRef: "NON"
      }
    ], { defaultTaxRate: 0.0825, defaultTaxCodeId: "TAX" });

    expect(totals.taxableSubtotal).toBe(230);
    expect(totals.nonTaxableSubtotal).toBe(65);
    expect(totals.subtotalBeforeTax).toBe(295);
    expect(totals.taxTotal).toBe(18.98);
    expect(totals.totalDue).toBe(313.98);
  });

  it("does not tax non-taxable invoices", () => {
    const totals = calculateInvoiceTotalsFromItems([
      {
        id: "non_taxable_line",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "report_1",
        reportType: "fire_extinguisher",
        category: "service",
        description: "Annual inspection",
        quantity: 3,
        unitPrice: 25,
        amount: 75,
        taxable: false,
        taxableSource: "quickbooks",
        quickBooksTaxableStatus: "non_taxable",
        quickBooksTaxCodeRef: "NON"
      }
    ], { defaultTaxRate: 0.0825 });

    expect(totals.taxableSubtotal).toBe(0);
    expect(totals.nonTaxableSubtotal).toBe(75);
    expect(totals.taxTotal).toBe(0);
    expect(totals.totalDue).toBe(75);
  });

  it("uses the configured default tax rate when a taxable line has a stale zero tax rate", () => {
    const totals = calculateInvoiceTotalsFromItems([
      {
        id: "taxable_part",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "report_1",
        reportType: "fire_extinguisher",
        category: "material",
        description: "Recharge parts",
        quantity: 2,
        unitPrice: 50,
        amount: 100,
        taxable: true,
        taxableSource: "quickbooks",
        quickBooksTaxableStatus: "taxable",
        quickBooksTaxCodeRef: "TAX",
        taxRate: 0,
        taxAmount: 0
      }
    ], { defaultTaxRate: 0.0825, defaultTaxCodeId: "TAX" });

    expect(totals.taxableSubtotal).toBe(100);
    expect(totals.nonTaxableSubtotal).toBe(0);
    expect(totals.taxTotal).toBe(8.25);
    expect(totals.totalDue).toBe(108.25);
    expect(totals.taxRate).toBe(0.0825);
    expect(totals.taxCodeId).toBe("TAX");
  });

  it("includes taxable minimum ticket adjustments before calculating tax", () => {
    const totals = calculateInvoiceTotalsFromItems([
      {
        id: "service_line",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "inspection_1",
        reportType: "inspection",
        category: "service",
        description: "Walk-in extinguisher inspection",
        quantity: 1,
        unitPrice: 10,
        amount: 10,
        taxable: false,
        taxableSource: "manual",
        quickBooksTaxableStatus: null
      },
      {
        id: "minimum_adjustment",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "inspection_1",
        reportType: "inspection",
        category: "fee",
        code: "MINIMUM_TICKET_ADJUSTMENT",
        description: "Minimum Service Ticket Adjustment - Walk-In Minimum",
        quantity: 1,
        unitPrice: 15,
        amount: 15,
        taxable: true,
        taxableSource: "quickbooks",
        quickBooksTaxableStatus: "taxable",
        quickBooksTaxCodeRef: "TAX"
      }
    ], { defaultTaxRate: 0.1, defaultTaxCodeId: "TAX" });

    expect(totals.taxableSubtotal).toBe(15);
    expect(totals.nonTaxableSubtotal).toBe(10);
    expect(totals.subtotalBeforeTax).toBe(25);
    expect(totals.taxTotal).toBe(1.5);
    expect(totals.totalDue).toBe(26.5);
  });

  it("preserves taxable item status while charging zero tax for tax exempt customers", () => {
    const items = [
      {
        id: "taxable_part",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "report_1",
        reportType: "fire_extinguisher",
        category: "material",
        description: "Recharge parts",
        quantity: 2,
        unitPrice: 50,
        amount: 100,
        taxable: true,
        taxableSource: "quickbooks",
        quickBooksTaxableStatus: "taxable",
        quickBooksTaxCodeRef: "TAX"
      }
    ];
    const totals = calculateInvoiceTotalsFromItems(items, { defaultTaxRate: 0.0825, defaultTaxCodeId: "TAX", taxExempt: true });
    const [snapshottedLine] = snapshotInvoiceLines(items, { defaultTaxRate: 0.0825, defaultTaxCodeId: "TAX", taxExempt: true });

    expect(snapshottedLine?.taxable).toBe(true);
    expect(snapshottedLine?.taxCodeId).toBe("NON");
    expect(snapshottedLine?.metadata.invoiceLineSnapshot).toEqual(expect.objectContaining({
      taxable: true,
      effectiveTaxable: false,
      taxExempt: true
    }));
    expect(totals.taxableSubtotal).toBe(100);
    expect(totals.nonTaxableSubtotal).toBe(0);
    expect(totals.taxTotal).toBe(0);
    expect(totals.totalDue).toBe(100);
  });
});

function buildKitchenDraftForManufacturer(manufacturer: string) {
  const draft = buildInitialReportDraft({
    inspectionType: "kitchen_suppression",
    siteName: "Pinecrest Tower",
    customerName: "Pinecrest Property Management",
    scheduledDate: "2026-03-20T15:00:00.000Z",
    assetCount: 1,
    assets: [
      {
        id: "asset_1",
        name: "Kitchen hood system",
        assetTag: "KIT-400",
        metadata: {
          location: "Ground floor commercial kitchen",
          protectedArea: "Line cook hood",
          pullStationLocation: "South egress by prep sink",
          tankType: "Wet chemical",
          applianceCount: 5
        }
      }
    ]
  });

  draft.sections["system-details"]!.fields.numberOfCylinders = 2;
  draft.sections["system-details"]!.fields.systemLocation = "Ground floor commercial kitchen";
  draft.sections["system-details"]!.fields.manufacturer = manufacturer;
  draft.sections["system-details"]!.fields.billingManufacturer = manufacturer;
  draft.sections["tank-and-service"]!.fields.fusibleLinksUsed = [
    { temperature: "286°F", quantity: "6" }
  ];
  draft.sections["tank-and-service"]!.fields.capsUsed = [
    { type: "Rubber", quantity: "4" }
  ];
  draft.sections["tank-and-service"]!.fields.cartridgesUsed = [
    { type: "PK-2 cartridge", quantity: "1" }
  ];

  return draft;
}

function buildKitchenDraft() {
  return buildKitchenDraftForManufacturer("Ansul");
}

function buildFireAlarmDraft() {
  const draft = buildInitialReportDraft({
    inspectionType: "fire_alarm",
    siteName: "Pinecrest Tower",
    customerName: "Pinecrest Property Management",
    scheduledDate: "2026-03-20T15:00:00.000Z",
    assetCount: 0,
    assets: []
  });

  draft.sections["system-summary"]!.fields.laborHours = 3.5;

  return draft;
}

function buildFireExtinguisherDraft() {
  const draft = buildInitialReportDraft({
    inspectionType: "fire_extinguisher",
    siteName: "Pinecrest Tower",
    customerName: "Pinecrest Property Management",
    scheduledDate: "2026-03-20T15:00:00.000Z",
    assetCount: 0,
    assets: []
  });

  draft.sections["inventory"]!.fields.extinguishers = [
    {
      assetTag: "EXT-100",
      location: "Lobby",
      extinguisherType: "5 lb ABC",
      servicePerformed: "Annual Inspection"
    },
    {
      assetTag: "EXT-101",
      location: "Warehouse",
      extinguisherType: "10 lb ABC",
      servicePerformed: "Recharge"
    },
    {
      assetTag: "EXT-102",
      location: "Kitchen",
      extinguisherType: "20 lb CO2",
      servicePerformed: "Annual Inspection|Hydro Test"
    },
    {
      assetTag: "EXT-103",
      location: "Dock",
      extinguisherType: "",
      billingExtinguisherType: "",
      servicePerformed: "other",
      servicePerformedOther: "Special teardown"
    }
  ];

  return draft;
}

function buildEmergencyLightingDraft() {
  const draft = buildInitialReportDraft({
    inspectionType: "emergency_exit_lighting",
    siteName: "Summit Distribution Hub",
    customerName: "Summit Logistics",
    scheduledDate: "2026-03-20T15:00:00.000Z",
    assetCount: 0,
    assets: []
  });

  draft.sections["fixture-inventory"]!.fields.fixtureGroups = [
    {
      location: "Warehouse aisle A",
      fixtureType: "Emergency Light",
      status: "pass",
      notes: "",
      batteryQuantity: "2",
      batterySize: "NiCad",
      batterySizeOther: "",
      billingBatterySize: "NiCad",
      newUnit: false
    },
    {
      location: "Shipping exit",
      fixtureType: "Combo Exit / Emergency",
      status: "pass",
      notes: "",
      batteryQuantity: "1",
      batterySize: "other",
      batterySizeOther: "8V custom",
      billingBatterySize: "8V custom",
      newUnit: true
    }
  ];

  return draft;
}

describe("minimum ticket pricing", () => {
  const rules = [
    {
      id: "minimum_walk_in",
      name: "Walk-In Minimum",
      ruleType: "walk_in" as const,
      amount: 25,
      currency: "USD",
      appliesTo: "walk_in" as const,
      locationMode: "manual" as const,
      city: null,
      state: null,
      priority: 100,
      source: "database" as const
    },
    {
      id: "minimum_enid",
      name: "Enid Local Minimum",
      ruleType: "local_service" as const,
      amount: 59,
      currency: "USD",
      appliesTo: "all" as const,
      locationMode: "city" as const,
      city: "Enid",
      state: "OK",
      priority: 50,
      source: "database" as const
    },
    {
      id: "minimum_standard",
      name: "Standard Service Minimum",
      ruleType: "standard_service" as const,
      amount: 79,
      currency: "USD",
      appliesTo: "all" as const,
      locationMode: "manual" as const,
      city: null,
      state: null,
      priority: 0,
      source: "database" as const
    }
  ];

  it("applies the Enid local minimum when subtotal is below 59", () => {
    const rule = selectMinimumTicketRule({
      rules,
      serviceContext: "inspection",
      location: { city: "Enid", state: "OK", postalCode: "73701" }
    });
    const resolution = buildMinimumTicketResolution({
      rule,
      subtotalBeforeMinimum: 42,
      serviceContext: "inspection",
      location: { city: "Enid", state: "OK", postalCode: "73701" }
    });

    expect(resolution.applies).toBe(true);
    expect(resolution.minimumAmount).toBe(59);
    expect(resolution.adjustmentAmount).toBe(17);
  });

  it("does not add an Enid minimum adjustment when subtotal already meets the minimum", () => {
    const rule = selectMinimumTicketRule({
      rules,
      serviceContext: "inspection",
      location: { city: "Enid", state: "OK", postalCode: "73701" }
    });
    const resolution = buildMinimumTicketResolution({
      rule,
      subtotalBeforeMinimum: 85,
      serviceContext: "inspection",
      location: { city: "Enid", state: "OK", postalCode: "73701" }
    });

    expect(resolution.applies).toBe(false);
    expect(resolution.adjustmentAmount).toBe(0);
  });

  it("uses the standard minimum outside Enid", () => {
    const rule = selectMinimumTicketRule({
      rules,
      serviceContext: "inspection",
      location: { city: "Ringwood", state: "OK", postalCode: "73768" }
    });
    const resolution = buildMinimumTicketResolution({
      rule,
      subtotalBeforeMinimum: 50,
      serviceContext: "inspection",
      location: { city: "Ringwood", state: "OK", postalCode: "73768" }
    });

    expect(rule?.name).toBe("Standard Service Minimum");
    expect(resolution.minimumAmount).toBe(79);
    expect(resolution.adjustmentAmount).toBe(29);
  });

  it("uses the walk-in minimum before location rules", () => {
    const rule = selectMinimumTicketRule({
      rules,
      serviceContext: "walk_in",
      location: { city: "Ringwood", state: "OK", postalCode: "73768" }
    });
    const resolution = buildMinimumTicketResolution({
      rule,
      subtotalBeforeMinimum: 10,
      serviceContext: "walk_in",
      location: { city: "Ringwood", state: "OK", postalCode: "73768" }
    });

    expect(rule?.name).toBe("Walk-In Minimum");
    expect(resolution.minimumAmount).toBe(25);
    expect(resolution.adjustmentAmount).toBe(15);
  });

  it("falls back to built-in minimums while the minimum ticket table is missing", async () => {
    txMock.site.findFirst.mockResolvedValue({ city: "Enid", state: "OK", postalCode: "73701" });
    txMock.customerCompany.findFirst.mockResolvedValue(null);
    txMock.minimumTicketRule.findMany.mockRejectedValue(
      Object.assign(new Error("The table `public.MinimumTicketRule` does not exist in the current database."), {
        code: "P2021"
      })
    );

    const resolution = await resolveMinimumTicketRuleTx(txMock as never, {
      tenantId: "tenant_1",
      customerCompanyId: null,
      siteId: "site_1",
      serviceContext: "inspection",
      subtotalBeforeMinimum: 42
    });

    expect(resolution.rule?.name).toBe("Enid Local Minimum");
    expect(resolution.applies).toBe(true);
    expect(resolution.adjustmentAmount).toBe(17);
  });
});

describe("inspection billing extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMock.inspection.findFirst.mockReset();
    txMock.customerCompany.findFirst.mockReset();
    txMock.billingPayerAccount.findFirst.mockReset();
    txMock.billingContractProfile.findFirst.mockReset();
    prismaMock.workOrderProviderContext.findFirst.mockReset();
    txMock.providerContractProfile.findFirst.mockReset();
    txMock.providerContractRate.findMany.mockReset();
    txMock.billingResolutionSnapshot.findFirst.mockReset();
    txMock.billingResolutionSnapshot.create.mockReset();
    txMock.site.findFirst.mockReset();
    txMock.tenant.findUnique.mockReset();
    txMock.serviceFeeRule.findMany.mockReset();
    txMock.minimumTicketRule.findMany.mockReset();
    txMock.complianceReportingFeeRule.findFirst.mockReset();
    txMock.complianceReportingFeeRule.findMany.mockReset();
    txMock.quickBooksCatalogItem.findFirst.mockReset();
    txMock.quickBooksCatalogItem.findMany.mockReset();
    txMock.$queryRawUnsafe.mockResolvedValue([{ exists: true }]);
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ exists: true }]);
    txMock.workOrderLineItem.findMany.mockReset();
    prismaMock.billingItemCatalogMatch.findUnique.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.quickBooksCatalogItemAlias.findMany.mockResolvedValue([]);
    prismaMock.workOrderLineItem.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock as never));
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);
    prismaMock.inspectionBillingSummary.findFirst.mockResolvedValue(null);
    prismaMock.auditLog.create.mockResolvedValue(undefined);
    prismaMock.quickBooksCatalogItemAlias.upsert.mockResolvedValue(undefined);
    prismaMock.billingItemCatalogMatch.upsert.mockResolvedValue(undefined);
    prismaMock.billingResolutionSnapshot.findFirst.mockResolvedValue(null);
    prismaMock.billingResolutionSnapshot.create.mockResolvedValue({ id: "billing_resolution_1" });
    txMock.providerContractRate.findMany.mockResolvedValue([]);
    txMock.billingResolutionSnapshot.findFirst.mockResolvedValue(null);
    txMock.billingResolutionSnapshot.create.mockResolvedValue({ id: "billing_resolution_1" });
    txMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Pinecrest Property Management",
      quickbooksCustomerId: "qb_customer_1",
      billingEmail: "billing@pinecrest.test"
    });
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Chicago",
        state: "IL",
        postalCode: "60601"
      }
    });
    txMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Pinecrest Property Management",
      quickbooksCustomerId: "qb_customer_1",
      billingType: "standard",
      billToAccountId: null,
      contractProfileId: null,
      invoiceDeliverySettings: { method: "payer_email" },
      autoBillingEnabled: false,
      requiredBillingReferences: {}
    });
    txMock.billingPayerAccount.findFirst.mockResolvedValue(null);
    txMock.billingContractProfile.findFirst.mockResolvedValue(null);
    prismaMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    prismaMock.serviceFeeRule.findMany.mockResolvedValue([]);
    prismaMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    prismaMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
  });

  it("extracts kitchen suppression material items from structured fields", () => {
    const items = extractBillableItemsFromDraft({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "kitchen_suppression",
      draft: buildKitchenDraft()
    });

    expect(items.map((item) => [item.category, item.description, item.quantity, item.code])).toEqual([
      ["service", "Kitchen Suppression System Inspection", 1, "KS-INSPECTION"],
      ["material", "Fusible links used (286°F)", 6, "KS-FUSIBLE-LINK"],
      ["material", "Caps used (Rubber)", 4, "KS-CAP"],
      ["material", "Cartridges used (PK-2 cartridge)", 1, "KS-CARTRIDGE"]
    ]);
    expect(items[0]?.metadata?.numberOfCylinders).toBe(2);
    expect(items[0]?.metadata?.billingManufacturer).toBe("Ansul");
  });

  it("extracts on-site labor from fire alarm only", () => {
    const items = extractBillableItemsFromDraft({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "fire_alarm",
      draft: buildFireAlarmDraft()
    });

    expect(items.map((item) => [item.category, item.description, item.quantity, item.code])).toEqual([
      ["labor", "On-site labor", 3.5, "ON_SITE_LABOR"]
    ]);
  });

  it("extracts emergency light batteries and new units into billing review", () => {
    const items = extractBillableItemsFromDraft({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "emergency_exit_lighting",
      draft: buildEmergencyLightingDraft()
    });

    expect(items.map((item) => [item.category, item.description, item.quantity, item.code])).toEqual([
      ["service", "Emergency Light Annual Inspection", 1, "EL-ANNUAL"],
      ["material", "Emergency light battery (NiCad) - Emergency Light at Warehouse aisle A", 2, "EL-BATTERY"],
      ["material", "Emergency light battery (8V custom) - Combo Exit / Emergency at Shipping exit", 1, "EL-BATTERY"],
      ["material", "New emergency light unit - Combo Exit / Emergency at Shipping exit", 1, "EL-NEW-UNIT"]
    ]);
  });

  it("ignores zero-value or false kitchen suppression billables", () => {
    const draft = buildKitchenDraft();
    draft.sections["tank-and-service"]!.fields.fusibleLinksUsed = [{ temperature: "286°F", quantity: "0" }];
    draft.sections["tank-and-service"]!.fields.capsUsed = [{ type: "Rubber", quantity: "0" }];
    draft.sections["tank-and-service"]!.fields.cartridgesUsed = [{ type: "PK-2 cartridge", quantity: "0" }];

    const items = extractBillableItemsFromDraft({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "kitchen_suppression",
      draft
    });

    expect(items.map((item) => [item.description, item.code, item.quantity])).toEqual([
      ["Kitchen Suppression System Inspection", "KS-INSPECTION", 1]
    ]);
  });

  it("uses the lower-rate inspection code for Guardian kitchen systems", () => {
    const items = extractBillableItemsFromDraft({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "kitchen_suppression",
      draft: buildKitchenDraftForManufacturer("Guardian")
    });

    expect(items[0]?.code).toBe("KS-INSPECTION-GUARDIAN/DENLAR");
    expect(items[0]?.metadata?.billingManufacturer).toBe("Guardian");
  });

  it("uses the lower-rate inspection code for Denlar kitchen systems", () => {
    const items = extractBillableItemsFromDraft({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "kitchen_suppression",
      draft: buildKitchenDraftForManufacturer("Denlar")
    });

    expect(items[0]?.code).toBe("KS-INSPECTION-GUARDIAN/DENLAR");
    expect(items[0]?.metadata?.billingManufacturer).toBe("Denlar");
  });

  it("uses the higher-rate inspection code for CaptiveAire kitchen systems", () => {
    const items = extractBillableItemsFromDraft({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "kitchen_suppression",
      draft: buildKitchenDraftForManufacturer("CaptiveAire")
    });

    expect(items[0]?.code).toBe("KS-INSPECTION-CAPTIVEAIRE");
    expect(items[0]?.metadata?.billingManufacturer).toBe("CaptiveAire");
  });

  it("extracts fire extinguisher annual and size-dependent services into billing review", () => {
    const draft = buildFireExtinguisherDraft();

    const items = extractBillableItemsFromFinalizedReport({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "fire_extinguisher",
      contentJson: draft as unknown as object
    });

    expect(items.map((item) => [item.description, item.code, item.quantity]).sort()).toEqual([
      ["Annual Inspection", "FE-ANNUAL", 1],
      ["Annual Inspection", "FE-ANNUAL", 1],
      ["Annual Inspection", "FE-ANNUAL", 1],
      ["Annual Inspection", "FE-ANNUAL", 1],
      ["Recharge (10 lb ABC)", "FE-RECHARGE-10_LB_ABC", 1],
      ["Hydro Test (20 lb CO2)", "FE-HYDRO-20_LB_CO2", 1],
      ["Special teardown (Not recorded)", "FE-OTHER-NOT_RECORDED", 1]
    ].sort());
  });

  it("excludes non-billable carried-forward extinguisher rows and bills only visit activity", () => {
    const draft = buildFireExtinguisherDraft();
    draft.sections["inventory"]!.fields.extinguishers = [
      {
        assetTag: "EXT-100",
        location: "Lobby",
        extinguisherType: "5 lb ABC",
        servicePerformed: "Annual Inspection",
        sourceReportId: "report_prior_1",
        sourceReportItemId: "prior-row-1",
        carryForwardStatus: "carried_forward",
        visitStatus: "not_reviewed",
        billableStatus: "not_billable"
      },
      {
        assetTag: "EXT-101",
        location: "Warehouse",
        extinguisherType: "10 lb ABC",
        servicePerformed: "Recharge",
        sourceReportId: "report_prior_1",
        sourceReportItemId: "prior-row-2",
        carryForwardStatus: "carried_forward",
        visitStatus: "serviced",
        billableStatus: "billable_service"
      },
      {
        assetTag: "EXT-102",
        location: "Kitchen",
        extinguisherType: "2.5 lb ABC",
        servicePerformed: "New",
        visitStatus: "new",
        billableStatus: "billable_new"
      }
    ];

    const items = extractBillableItemsFromFinalizedReport({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "fire_extinguisher",
      contentJson: draft as unknown as object
    });

    expect(items.map((item) => [item.description, item.code, item.quantity]).sort()).toEqual([
      ["Annual Inspection", "FE-ANNUAL", 1],
      ["New (2.5 lb ABC)", "FE-NEW-2_5_LB_ABC", 1],
      ["Recharge (10 lb ABC)", "FE-RECHARGE-10_LB_ABC", 1]
    ].sort());
    const recharge = items.find((item) => item.description.startsWith("Recharge"));
    expect(recharge?.metadata).toMatchObject({
      sourceReportId: "report_prior_1",
      sourceReportItemId: "prior-row-2",
      visitStatus: "serviced",
      billableStatus: "billable_service",
      billingSourceLabel: "Service performed"
    });
  });

  it("groups billables by category and preserves edited pricing during refresh", () => {
    const extracted = extractBillableItemsFromDraft({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "kitchen_suppression",
      draft: buildKitchenDraft()
    });

    const merged = mergeBillingItems(
      [
        {
          ...extracted[0]!,
          quantity: 3,
          unitPrice: 125,
          amount: 375,
          metadata: { sourceQuantity: 2.5 }
        }
      ],
      extracted
    );

    const grouped = groupBillableItems(merged);
    expect(grouped.fee).toHaveLength(0);
    expect(grouped.material).toHaveLength(3);
    expect(grouped.service).toHaveLength(1);
    expect(grouped.labor).toHaveLength(0);
  });

  it("preserves edited pricing during fire alarm labor refresh", () => {
    const extracted = extractBillableItemsFromDraft({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "fire_alarm",
      draft: buildFireAlarmDraft()
    });

    const merged = mergeBillingItems(
      [
        {
          ...extracted[0]!,
          quantity: 4,
          unitPrice: 125,
          amount: 500,
          metadata: { sourceQuantity: 3.5 }
        }
      ],
      extracted
    );

    const grouped = groupBillableItems(merged);
    expect(grouped.labor[0]?.quantity).toBe(4);
    expect(grouped.labor[0]?.unitPrice).toBe(125);
  });

  it("preserves admin manual billing lines during summary refresh", () => {
    const extracted = extractBillableItemsFromDraft({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      reportId: "report_1",
      reportType: "fire_alarm",
      draft: buildFireAlarmDraft()
    });

    const merged = mergeBillingItems(
      [
        {
          id: "manual_line_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          reportId: "inspection_1",
          reportType: "inspection",
          sourceSection: "manual-billing",
          sourceField: "admin-added",
          category: "service",
          description: "Extra diagnostic service",
          quantity: 1,
          unitPrice: 85,
          amount: 85,
          metadata: { manualBillingLine: true }
        }
      ],
      extracted
    );

    expect(merged.some((item) => item.id === "manual_line_1")).toBe(true);
  });

  it("groups identical review rows into one consolidated billing line", () => {
    const grouped = groupBillingReviewItems([
      {
        id: "line_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "report_1",
        reportType: "fire_extinguisher",
        category: "service",
        description: "Annual Inspection",
        quantity: 1,
        unitPrice: 45,
        linkedCatalogItemId: "catalog_1",
        linkedCatalogItemName: "Annual Inspection - Fire Extinguisher",
        linkedQuickBooksItemId: "qb_1"
      },
      {
        id: "line_2",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "report_2",
        reportType: "fire_extinguisher",
        category: "service",
        description: "Annual Inspection",
        quantity: 1,
        unitPrice: 45,
        linkedCatalogItemId: "catalog_1",
        linkedCatalogItemName: "Annual Inspection - Fire Extinguisher",
        linkedQuickBooksItemId: "qb_1"
      }
    ]);

    expect(grouped.service).toHaveLength(1);
    expect(grouped.service[0]).toEqual(
      expect.objectContaining({
        quantity: 2,
        sourceItemCount: 2,
        itemIds: ["line_1", "line_2"],
        subtotal: 90
      })
    );
  });

  it("does not merge grouped review rows with different taxability", () => {
    const grouped = groupBillingReviewItems([
      {
        id: "taxable_part_line",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "report_1",
        reportType: "fire_extinguisher",
        category: "material",
        description: "ABC extinguisher",
        quantity: 1,
        unitPrice: 95,
        linkedCatalogItemId: "catalog_1",
        linkedCatalogItemName: "ABC extinguisher",
        linkedQuickBooksItemId: "qb_1",
        taxable: true
      },
      {
        id: "non_taxable_part_line",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        reportId: "report_2",
        reportType: "fire_extinguisher",
        category: "material",
        description: "ABC extinguisher",
        quantity: 1,
        unitPrice: 95,
        linkedCatalogItemId: "catalog_1",
        linkedCatalogItemName: "ABC extinguisher",
        linkedQuickBooksItemId: "qb_1",
        taxable: false
      }
    ]);

    expect(grouped.material).toHaveLength(2);
    expect(grouped.material.some((group) => group.taxable === true && group.itemIds.includes("taxable_part_line"))).toBe(true);
    expect(grouped.material.some((group) => group.taxable === false && group.itemIds.includes("non_taxable_part_line"))).toBe(true);
  });
});

describe("inspection billing persistence and admin review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRawUnsafe.mockReset();
    prismaMock.$executeRaw.mockReset();
    prismaMock.billingItemCatalogMatch.findUnique.mockReset();
    prismaMock.quickBooksCatalogItem.findFirst.mockReset();
    prismaMock.quickBooksCatalogItem.findMany.mockReset();
    prismaMock.quickBooksCatalogItemAlias.findMany.mockReset();
    prismaMock.providerContractProfile.findFirst.mockReset();
    prismaMock.providerContractRate.findMany.mockReset();
    prismaMock.billingResolutionSnapshot.findFirst.mockReset();
    prismaMock.billingResolutionSnapshot.create.mockReset();
    prismaMock.minimumTicketRule.findMany.mockReset();
    prismaMock.auditLog.create.mockReset();
    txMock.$queryRaw.mockReset();
    txMock.$queryRawUnsafe.mockReset();
    txMock.$executeRaw.mockReset();
    txMock.inspection.findFirst.mockReset();
    txMock.customerCompany.findFirst.mockReset();
    txMock.billingPayerAccount.findFirst.mockReset();
    txMock.billingContractProfile.findFirst.mockReset();
    txMock.providerContractProfile.findFirst.mockReset();
    txMock.providerContractRate.findMany.mockReset();
    txMock.site.findFirst.mockReset();
    txMock.tenant.findUnique.mockReset();
    txMock.serviceFeeRule.findMany.mockReset();
    txMock.minimumTicketRule.findMany.mockReset();
    txMock.complianceReportingFeeRule.findFirst.mockReset();
    txMock.complianceReportingFeeRule.findMany.mockReset();
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Chicago",
        state: "IL",
        postalCode: "60601"
      }
    });
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Pinecrest Property Management",
      quickbooksCustomerId: "qb_customer_1",
      billingType: "standard",
      billToAccountId: null,
      contractProfileId: null,
      invoiceDeliverySettings: { method: "payer_email" },
      autoBillingEnabled: false,
      requiredBillingReferences: {}
    });
    txMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Pinecrest Property Management",
      quickbooksCustomerId: "qb_customer_1",
      billingType: "standard",
      billToAccountId: null,
      contractProfileId: null,
      invoiceDeliverySettings: { method: "payer_email" },
      autoBillingEnabled: false,
      requiredBillingReferences: {}
    });
    prismaMock.billingPayerAccount.findFirst.mockResolvedValue(null);
    prismaMock.billingContractProfile.findFirst.mockResolvedValue(null);
    prismaMock.workOrderProviderContext.findFirst.mockResolvedValue(null);
    prismaMock.providerContractProfile.findFirst.mockResolvedValue(null);
    prismaMock.providerContractRate.findMany.mockResolvedValue([]);
    prismaMock.billingResolutionSnapshot.findFirst.mockResolvedValue(null);
    prismaMock.billingResolutionSnapshot.create.mockResolvedValue({ id: "billing_resolution_1" });
    prismaMock.auditLog.create.mockResolvedValue({ id: "audit_1" });
    txMock.billingPayerAccount.findFirst.mockResolvedValue(null);
    txMock.billingContractProfile.findFirst.mockResolvedValue(null);
    txMock.providerContractProfile.findFirst.mockResolvedValue(null);
    txMock.providerContractRate.findMany.mockResolvedValue([]);
    txMock.billingResolutionSnapshot.findFirst.mockResolvedValue(null);
    txMock.billingResolutionSnapshot.create.mockResolvedValue({ id: "billing_resolution_1" });
    txMock.$queryRawUnsafe.mockResolvedValue([{ exists: true }]);
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ exists: true }]);
    txMock.workOrderLineItem.findMany.mockResolvedValue([]);
    prismaMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    prismaMock.serviceFeeRule.findMany.mockResolvedValue([]);
    prismaMock.minimumTicketRule.findMany.mockResolvedValue([]);
    prismaMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    prismaMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    txMock.minimumTicketRule.findMany.mockResolvedValue([]);
    txMock.quickBooksCatalogItem.findFirst.mockResolvedValue(null);
    txMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.billingItemCatalogMatch.findUnique.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.quickBooksCatalogItemAlias.findMany.mockResolvedValue([]);
  });

  it("resolves site and zip service fee rules ahead of the tenant default", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Chicago",
        state: "IL",
        postalCode: "60601"
      }
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([
      {
        id: "zip_rule",
        customerCompanyId: null,
        siteId: null,
        city: null,
        state: null,
        zipCode: "60601",
        feeCode: "SERVICE_FEE_DOWNTOWN",
        unitPrice: 135,
        priority: 5
      },
      {
        id: "site_rule",
        customerCompanyId: null,
        siteId: "site_1",
        city: null,
        state: null,
        zipCode: null,
        feeCode: "SERVICE_FEE_SITE",
        unitPrice: 185,
        priority: 1
      }
    ]);

    const resolved = await resolveInspectionServiceFeeTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(resolved).toEqual({
      code: "SERVICE_FEE_SITE",
      unitPrice: 185,
      source: "site_override",
      ruleId: "site_rule",
      priority: 1
    });
  });

  it("uses customer service address when a generic site location would miss a city service fee rule", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Unknown",
        state: "Unknown",
        postalCode: ""
      },
      customerCompany: {
        serviceCity: "Enid",
        serviceState: "OK",
        servicePostalCode: "73701",
        billingCity: null,
        billingState: null,
        billingPostalCode: null
      }
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 65
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([
      {
        id: "enid_rule",
        customerCompanyId: null,
        siteId: null,
        city: "Enid",
        state: "OK",
        zipCode: null,
        feeCode: "SERVICE_FEE_ENID",
        unitPrice: 95,
        priority: 10
      }
    ]);

    const resolved = await resolveInspectionServiceFeeTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(resolved).toEqual({
      code: "SERVICE_FEE_ENID",
      unitPrice: 95,
      source: "city_state_rule",
      ruleId: "enid_rule",
      priority: 10
    });
  });

  it("ignores no-fixed-site placeholders before matching Enid customer service fee rules", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Unknown Unknown Unknown",
        state: "No fixed service address",
        postalCode: "Not recorded"
      },
      customerCompany: {
        serviceCity: "Enid",
        serviceState: "OK",
        servicePostalCode: "73701",
        billingCity: null,
        billingState: null,
        billingPostalCode: null
      }
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 65
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([
      {
        id: "enid_rule",
        customerCompanyId: null,
        siteId: null,
        city: "Enid",
        state: "OK",
        zipCode: null,
        feeCode: "SERVICE_FEE",
        unitPrice: 35,
        priority: 1
      }
    ]);

    const resolved = await resolveInspectionServiceFeeTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(resolved).toEqual({
      code: "SERVICE_FEE",
      unitPrice: 35,
      source: "city_state_rule",
      ruleId: "enid_rule",
      priority: 1
    });
  });

  it("matches Enid service fee rules when location city is stored as Enid, OK", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Enid, OK",
        state: "",
        postalCode: "73701"
      },
      customerCompany: {
        serviceCity: null,
        serviceState: null,
        servicePostalCode: null,
        billingCity: null,
        billingState: null,
        billingPostalCode: null
      }
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 65
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([
      {
        id: "enid_rule",
        customerCompanyId: null,
        siteId: null,
        city: "Enid",
        state: "OK",
        zipCode: null,
        feeCode: "SERVICE_FEE",
        unitPrice: 35,
        priority: 1
      }
    ]);

    const resolved = await resolveInspectionServiceFeeTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(resolved).toMatchObject({
      unitPrice: 35,
      source: "city_state_rule",
      ruleId: "enid_rule"
    });
  });

  it("uses a matching city and state service fee rule ahead of a ZIP-only rule for market pricing", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Unknown",
        state: "Unknown",
        postalCode: ""
      },
      customerCompany: {
        serviceCity: "Enid",
        serviceState: "OK",
        servicePostalCode: "73701",
        billingCity: null,
        billingState: null,
        billingPostalCode: null
      }
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 65
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([
      {
        id: "zip_rule",
        customerCompanyId: null,
        siteId: null,
        city: null,
        state: null,
        zipCode: "73701",
        feeCode: "SERVICE_FEE",
        unitPrice: 65,
        priority: 0
      },
      {
        id: "enid_rule",
        customerCompanyId: null,
        siteId: null,
        city: "Enid",
        state: "OK",
        zipCode: null,
        feeCode: "SERVICE_FEE",
        unitPrice: 35,
        priority: 0
      }
    ]);

    const resolved = await resolveInspectionServiceFeeTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(resolved).toEqual({
      code: "SERVICE_FEE",
      unitPrice: 35,
      source: "city_state_rule",
      ruleId: "enid_rule",
      priority: 0
    });
  });

  it("uses customer service address for quote and direct-invoice fee resolution when location input is empty", async () => {
    txMock.customerCompany.findFirst.mockResolvedValue({
      serviceCity: "Enid",
      serviceState: "OK",
      servicePostalCode: "73701",
      billingCity: null,
      billingState: null,
      billingPostalCode: null
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 65
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([
      {
        id: "enid_rule",
        customerCompanyId: null,
        siteId: null,
        city: "Enid",
        state: "OK",
        zipCode: null,
        feeCode: "SERVICE_FEE_ENID",
        unitPrice: 95,
        priority: 10
      }
    ]);

    const resolved = await resolveServiceFeeForLocationTx(txMock as never, {
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: null,
      location: {
        city: "",
        state: "",
        postalCode: ""
      }
    });

    expect(resolved).toMatchObject({
      code: "SERVICE_FEE_ENID",
      unitPrice: 95,
      source: "city_state_rule",
      ruleId: "enid_rule"
    });
  });

  it("creates or refreshes one tenant-scoped billing summary for a finalized inspection", async () => {
    const kitchenDraft = buildKitchenDraft();

    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Chicago",
        state: "IL",
        postalCode: "60601"
      }
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([{
      id: "compliance_rule_1",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      zipCode: null,
      normalizedCity: "CHICAGO",
      normalizedCounty: "",
      normalizedState: "IL",
      normalizedZipCode: "",
      feeAmount: 22.5
    }]);

    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: kitchenDraft,
          inspectionType: "kitchen_suppression"
        }
      ])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(summary?.inspectionId).toBe("inspection_1");
    expect(summary?.items).toHaveLength(6);
    expect(summary?.items.find((item) => item.description === "Service Fee")?.unitPrice).toBe(95);
    expect(summary?.items.find((item) => item.description === "Compliance Reporting Fee")).toEqual(
      expect.objectContaining({
        code: "COMPLIANCE_REPORTING_FEE_KITCHEN_SUPPRESSION",
        unitPrice: 22.5
      })
    );
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("hydrates catalog match prices before saving ready-to-bill summary totals", async () => {
    const fireAlarmDraft = buildFireAlarmDraft();
    fireAlarmDraft.sections["system-summary"]!.fields.laborHours = 2;

    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Chicago",
        state: "IL",
        postalCode: "60601",
        customerCompany: {
          serviceCity: null,
          serviceState: null,
          servicePostalCode: null,
          billingCity: null,
          billingState: null,
          billingPostalCode: null
        }
      }
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 0
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    prismaMock.billingItemCatalogMatch.findUnique.mockResolvedValue({
      sourceKey: "laborHours:ON_SITE_LABOR",
      catalogItemId: "catalog_labor",
      confidence: 1,
      matchMethod: "source_mapping",
      catalogItem: {
        id: "catalog_labor",
        quickbooksItemId: "qb_labor",
        name: "Fire Alarm - Annual Inspection",
        sku: null,
        itemType: "service",
        rawJson: null,
        unitPrice: 115,
        taxable: false
      }
    });

    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1", inspectionClassification: "standard" }])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: fireAlarmDraft,
          inspectionType: "fire_alarm"
        }
      ])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    const laborLine = summary?.items.find((item) => item.category === "labor");
    expect(laborLine).toEqual(expect.objectContaining({
      quantity: 2,
      unitPrice: 115,
      amount: 230,
      linkedCatalogItemId: "catalog_labor",
      taxable: true,
      quickBooksTaxableStatus: "taxable"
    }));
    expect(laborLine?.metadata?.invoiceLineSnapshot).toEqual(expect.objectContaining({
      taxable: true,
      effectiveTaxable: true
    }));
    expect(summary?.subtotal).toBe(230);
  });

  it("includes billable work order line items in auto billing summaries", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      inspectionClassification: "standard"
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    txMock.workOrderLineItem.findMany.mockResolvedValue([
      {
        id: "work_line_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        catalogItemId: "catalog_part_1",
        itemType: "part",
        name: "2.5 lb ABC extinguisher",
        description: "New 2.5 lb ABC extinguisher",
        quantity: 2,
        unitPrice: 51.95,
        totalPrice: 103.9,
        taxable: true,
        billableStatus: "billable",
        technicianNotes: "Customer requested replacement units.",
        source: "technician_selected",
        quickBooksItemId: "qb_part_1",
        invoicedAt: null,
        catalogItem: {
          id: "catalog_part_1",
          name: "2.5 lb ABC extinguisher",
          quickbooksItemId: "qb_part_1",
          taxable: true,
          unitPrice: 51.95,
          rawJson: { SalesTaxCodeRef: { value: "TAX" } }
        }
      }
    ]);

    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1", inspectionClassification: "standard" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    const workOrderLine = summary?.items.find((item) => item.metadata?.workOrderLineItemId === "work_line_1");
    expect(workOrderLine).toEqual(expect.objectContaining({
      reportType: "work_order",
      category: "material",
      description: "New 2.5 lb ABC extinguisher",
      quantity: 2,
      unitPrice: 51.95,
      amount: 103.9,
      linkedCatalogItemId: "catalog_part_1",
      linkedQuickBooksItemId: "qb_part_1",
      taxable: true
    }));
  });

  it("includes technician-selected service catalog items and quantities in work order auto billing", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      inspectionClassification: "standard"
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 0
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Enid",
      state: "OK"
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    txMock.workOrderLineItem.findMany.mockResolvedValue([
      {
        id: "work_line_annual_extinguisher",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        catalogItemId: "catalog_service_annual",
        itemType: "service",
        name: "Fire extinguisher annual inspection",
        description: "Annual portable extinguisher inspection",
        quantity: 2,
        unitPrice: 7.7,
        totalPrice: 15.4,
        taxable: false,
        billableStatus: "billable",
        technicianNotes: "Inspected two extinguishers.",
        source: "technician_selected",
        quickBooksItemId: "qb_service_annual",
        invoicedAt: null,
        catalogItem: {
          id: "catalog_service_annual",
          name: "Fire extinguisher annual inspection",
          quickbooksItemId: "qb_service_annual",
          taxable: false,
          unitPrice: 7.7,
          rawJson: { SalesTaxCodeRef: { value: "NON" } }
        }
      }
    ]);

    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1", inspectionClassification: "standard" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    const serviceLine = summary?.items.find((item) => item.metadata?.workOrderLineItemId === "work_line_annual_extinguisher");
    expect(serviceLine).toEqual(expect.objectContaining({
      reportType: "work_order",
      category: "service",
      description: "Annual portable extinguisher inspection",
      quantity: 2,
      unit: "each",
      unitPrice: 7.7,
      amount: 15.4,
      linkedCatalogItemId: "catalog_service_annual",
      linkedQuickBooksItemId: "qb_service_annual",
      taxable: true
    }));
    expect(serviceLine?.metadata).toEqual(expect.objectContaining({
      source: "technician_selected",
      technicianNotes: "Inspected two extinguishers.",
      sourceQuantity: 2
    }));
  });

  it("includes configured work order labor type charges in auto billing summaries", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      sourceType: "direct",
      inspectionClassification: null,
      customerCompany: {
        id: "customer_1",
        name: "Acme",
        quickbooksCustomerId: null,
        billingEmail: null
      },
      providerContextRecord: null
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 0
    });
    txMock.site.findFirst.mockResolvedValue({ city: "Enid", state: "OK" });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    txMock.workOrderLineItem.findMany.mockResolvedValue([
      {
        id: "labor_line_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        catalogItemId: "catalog_labor_1",
        itemType: "labor",
        name: "Fire Alarm Labor",
        description: "Fire alarm labor",
        quantity: 2,
        unitPrice: 125,
        totalPrice: 250,
        taxable: false,
        billableStatus: "billable",
        technicianNotes: "Panel troubleshooting",
        source: "technician_selected",
        quickBooksItemId: "qb_labor_fire_alarm",
        laborTypeId: "labor_type_fire_alarm",
        laborTypeName: "Fire Alarm",
        laborHours: 2,
        laborRate: 125,
        laborTotal: 250,
        invoicedAt: null,
        catalogItem: {
          id: "catalog_labor_1",
          name: "Fire Alarm Labor",
          quickbooksItemId: "qb_labor_fire_alarm",
          taxable: false,
          unitPrice: 125,
          rawJson: { SalesTaxCodeRef: { value: "NON" } }
        }
      }
    ]);

    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1", inspectionClassification: "standard" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    const laborLine = summary?.items.find((item) => item.metadata?.workOrderLineItemId === "labor_line_1");
    expect(laborLine).toEqual(expect.objectContaining({
      reportType: "work_order",
      category: "labor",
      description: "Fire alarm labor",
      quantity: 2,
      unit: "hour",
      unitPrice: 125,
      amount: 250,
      linkedCatalogItemId: "catalog_labor_1",
      linkedQuickBooksItemId: "qb_labor_fire_alarm",
      taxable: true
    }));
    expect(laborLine?.metadata).toEqual(expect.objectContaining({
      laborTypeId: "labor_type_fire_alarm",
      laborTypeName: "Fire Alarm",
      laborHours: 2,
      laborRate: 125,
      laborTotal: 250,
      sourceQuantity: 2
    }));
  });

  it("uses work order labor hour snapshots when generic quantity and price fields are stale", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      sourceType: "direct",
      inspectionClassification: null,
      customerCompany: {
        id: "customer_1",
        name: "Pinecrest Property Management",
        quickbooksCustomerId: "qb_customer_1",
        billingEmail: null
      },
      providerContextRecord: null
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 0
    });
    txMock.site.findFirst.mockResolvedValue({ city: "Enid", state: "OK" });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    txMock.workOrderLineItem.findMany.mockResolvedValue([
      {
        id: "labor_line_snapshot",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        catalogItemId: "catalog_labor_1",
        itemType: "labor",
        name: "Kitchen Suppression Labor",
        description: "Kitchen suppression labor",
        quantity: 1,
        unitPrice: null,
        totalPrice: null,
        taxable: false,
        billableStatus: "billable",
        technicianNotes: null,
        source: "technician_selected",
        quickBooksItemId: "qb_labor_kitchen",
        laborTypeId: "labor_type_kitchen",
        laborTypeName: "Kitchen Suppression",
        laborHours: 2.5,
        laborRate: 125,
        laborTotal: 312.5,
        invoicedAt: null,
        catalogItem: {
          id: "catalog_labor_1",
          name: "Kitchen Suppression Labor",
          quickbooksItemId: "qb_labor_kitchen",
          taxable: false,
          unitPrice: null,
          rawJson: { SalesTaxCodeRef: { value: "NON" } }
        }
      }
    ]);

    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1", inspectionClassification: "standard" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    const laborLine = summary?.items.find((item) => item.metadata?.workOrderLineItemId === "labor_line_snapshot");
    expect(laborLine).toEqual(expect.objectContaining({
      reportType: "work_order",
      category: "labor",
      quantity: 2.5,
      unit: "hour",
      unitPrice: 125,
      amount: 312.5,
      linkedCatalogItemId: "catalog_labor_1",
      linkedQuickBooksItemId: "qb_labor_kitchen"
    }));
    expect(laborLine?.metadata).toEqual(expect.objectContaining({
      laborTypeId: "labor_type_kitchen",
      laborTypeName: "Kitchen Suppression",
      laborHours: 2.5,
      laborRate: 125,
      laborTotal: 312.5,
      sourceQuantity: 2.5
    }));
  });

  it.skip("snapshots contract-provider billing resolution during summary sync", async () => {
    const kitchenDraft = buildKitchenDraft();

    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      sourceType: "third_party_provider",
      inspectionClassification: null,
      customerCompany: {
        id: "customer_1",
        name: "Pinecrest Property Management",
        quickbooksCustomerId: "qb_customer_1",
        billingEmail: "billing@pinecrest.test"
      },
      providerContextRecord: {
        id: "provider_context_1",
        providerAccountId: "provider_1",
        providerContractProfileId: "provider_contract_1",
        siteProviderAssignmentId: "site_assignment_1",
        providerWorkOrderNumber: "CF-1001",
        providerReferenceNumber: "REF-22",
        sourceType: "third_party_provider",
        providerAccount: {
          id: "provider_1",
          name: "Commercial Fire",
          status: "active"
        },
        providerContractProfile: {
          id: "provider_contract_1",
          name: "Commercial Fire Annual",
          status: "active",
          invoiceGroupingMode: "per_work_order",
          requireProviderWorkOrderNumber: true,
          requireSiteReferenceNumber: true,
          effectiveStartDate: new Date("2026-01-01T00:00:00.000Z"),
          effectiveEndDate: null
        },
        siteProviderAssignment: {
          id: "site_assignment_1",
          providerContractProfileId: "provider_contract_1",
          externalAccountName: "Pinecrest Tower",
          externalAccountNumber: "ACCT-77",
          externalLocationCode: "LOC-19"
        }
      }
    });
    txMock.providerContractRate.findMany.mockResolvedValue([
      {
        id: "provider_rate_1",
        inspectionType: "kitchen_suppression",
        reportType: "kitchen_suppression",
        assetCategory: null,
        pricingMethod: "flat_rate",
        unitRate: null,
        flatRate: 140,
        minimumCharge: null,
        effectiveStartDate: new Date("2026-01-01T00:00:00.000Z"),
        effectiveEndDate: null,
        priority: 10
      }
    ]);
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: kitchenDraft,
          inspectionType: "kitchen_suppression"
        }
      ])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(summary?.billingType).toBe("third_party");
    expect(summary?.payerType).toBe("provider");
    expect(summary?.payerProviderAccountId).toBe("provider_1");
    expect(summary?.billToName).toBe("Commercial Fire");
    expect(summary?.contractProfileName).toBe("Commercial Fire Annual");
    expect(summary?.pricingSnapshot).toEqual(
      expect.objectContaining({
        source: "provider_contract_rate",
        sourceReferenceId: "provider_rate_1"
      })
    );
    expect(summary?.deliverySnapshot).toEqual(
      expect.objectContaining({
        method: "manual"
      })
    );
    expect(summary?.referenceSnapshot).toEqual(
      expect.objectContaining({
        requirePo: true,
        requireCustomerReference: true,
        labels: ["Provider work order number", "Site reference number"]
      })
    );
    expect(summary?.routingSnapshot).toEqual(
      expect.objectContaining({
        billToName: "Commercial Fire",
        providerWorkOrderNumber: "CF-1001",
        providerReferenceNumber: "REF-22",
        autoBillingEnabled: true
      })
    );
    expect(summary?.billingResolutionSnapshotId).toBe("billing_resolution_1");
    expect(txMock.billingResolutionSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resolvedMode: "contract_provider",
          payerProviderAccountId: "provider_1",
          pricingSource: "provider_contract_rate",
          pricingSourceReferenceId: "provider_rate_1"
        }),
        select: { id: true }
      })
    );
  });

  it("falls back to direct customer billing when a work order is overridden to direct", async () => {
    const kitchenDraft = buildKitchenDraft();

    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      inspectionClassification: "standard",
      sourceType: "direct",
      providerContextRecord: {
        id: "provider_context_1",
        providerAccountId: "provider_1",
        providerContractProfileId: "provider_contract_1",
        siteProviderAssignmentId: "site_assignment_1",
        providerWorkOrderNumber: "CF-1001",
        providerReferenceNumber: "REF-22",
        sourceType: "third_party_provider",
        providerAccount: {
          id: "provider_1",
          name: "Commercial Fire",
          status: "active"
        },
        providerContractProfile: {
          id: "provider_contract_1",
          name: "Commercial Fire Annual",
          status: "active",
          invoiceGroupingMode: "per_work_order",
          requireProviderWorkOrderNumber: true,
          requireSiteReferenceNumber: true,
          effectiveStartDate: new Date("2026-01-01T00:00:00.000Z"),
          effectiveEndDate: null
        },
        siteProviderAssignment: {
          id: "site_assignment_1",
          providerContractProfileId: "provider_contract_1",
          externalAccountName: "Pinecrest Tower",
          externalAccountNumber: "ACCT-77",
          externalLocationCode: "LOC-19"
        }
      },
      providerContextSnapshot: null
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: kitchenDraft,
          inspectionType: "kitchen_suppression"
        }
      ])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(summary?.billingType).toBe("standard");
    expect(summary?.payerType).toBe("customer");
    expect(summary?.routingSnapshot).toEqual(
      expect.objectContaining({
        sourceType: "direct",
        workOrderLevelOverride: false
      })
    );
    expect(summary?.deliverySnapshot).toEqual(
      expect.objectContaining({
        warningCodes: []
      })
    );
  });

  it.skip("falls back to non-contract pricing with a warning when a provider has no active contract", async () => {
    const kitchenDraft = buildKitchenDraft();

    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      inspectionClassification: "standard",
      sourceType: "third_party_provider",
      providerContextRecord: {
        id: "provider_context_1",
        providerAccountId: "provider_1",
        providerContractProfileId: null,
        siteProviderAssignmentId: "site_assignment_1",
        providerWorkOrderNumber: "CF-1001",
        providerReferenceNumber: "REF-22",
        sourceType: "third_party_provider",
        providerAccount: {
          id: "provider_1",
          name: "Commercial Fire",
          status: "active"
        },
        providerContractProfile: null,
        siteProviderAssignment: {
          id: "site_assignment_1",
          providerContractProfileId: null,
          externalAccountName: "Pinecrest Tower",
          externalAccountNumber: "ACCT-77",
          externalLocationCode: "LOC-19"
        }
      },
      providerContextSnapshot: null
    });
    txMock.providerContractProfile.findFirst.mockResolvedValue({
      id: "provider_contract_1",
      name: "Commercial Fire Annual",
      status: "expired",
      invoiceGroupingMode: "per_work_order",
      requireProviderWorkOrderNumber: true,
      requireSiteReferenceNumber: true,
      effectiveStartDate: new Date("2025-01-01T00:00:00.000Z"),
      effectiveEndDate: new Date("2025-12-31T00:00:00.000Z")
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: kitchenDraft,
          inspectionType: "kitchen_suppression"
        }
      ])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(summary?.billingType).toBe("third_party");
    expect(summary?.pricingSnapshot).toEqual(
      expect.objectContaining({
        source: "default_pricing",
        contractResolutionStatus: "missing"
      })
    );
    expect(summary?.deliverySnapshot).toEqual(
      expect.objectContaining({
        blockingIssueCode: null,
        warningCodes: expect.arrayContaining(["provider_contract_missing", "provider_rate_missing"])
      })
    );
  });

  it.skip("marks provider billing blocked when the snapped contract is expired", async () => {
    const kitchenDraft = buildKitchenDraft();

    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      inspectionClassification: "standard",
      sourceType: "third_party_provider",
      providerContextRecord: {
        id: "provider_context_1",
        providerAccountId: "provider_1",
        providerContractProfileId: "provider_contract_1",
        siteProviderAssignmentId: "site_assignment_1",
        providerWorkOrderNumber: "CF-1001",
        providerReferenceNumber: "REF-22",
        sourceType: "third_party_provider",
        providerAccount: {
          id: "provider_1",
          name: "Commercial Fire",
          status: "active"
        },
        providerContractProfile: {
          id: "provider_contract_1",
          name: "Commercial Fire Annual",
          status: "expired",
          invoiceGroupingMode: "per_work_order",
          requireProviderWorkOrderNumber: true,
          requireSiteReferenceNumber: true,
          effectiveStartDate: new Date("2025-01-01T00:00:00.000Z"),
          effectiveEndDate: new Date("2025-12-31T00:00:00.000Z")
        },
        siteProviderAssignment: {
          id: "site_assignment_1",
          providerContractProfileId: "provider_contract_1",
          externalAccountName: "Pinecrest Tower",
          externalAccountNumber: "ACCT-77",
          externalLocationCode: "LOC-19"
        }
      },
      providerContextSnapshot: null
    });
    txMock.providerContractProfile.findFirst.mockResolvedValue(null);
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: kitchenDraft,
          inspectionType: "kitchen_suppression"
        }
      ])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(summary?.billingType).toBe("third_party");
    expect(summary?.deliverySnapshot).toEqual(
      expect.objectContaining({
        blockingIssueCode: "provider_contract_expired",
        contractResolutionStatus: "expired"
      })
    );
  });

  it("does not duplicate compliance reporting fees when multiple sprinkler report types are finalized together", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Chicago",
        state: "IL",
        postalCode: "60601"
      }
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([{
      id: "compliance_rule_sprinkler",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      zipCode: null,
      normalizedCity: "CHICAGO",
      normalizedCounty: "",
      normalizedState: "IL",
      normalizedZipCode: "",
      feeAmount: 30
    }]);

    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: {},
          inspectionType: "wet_fire_sprinkler"
        },
        {
          id: "report_2",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: {},
          inspectionType: "dry_fire_sprinkler"
        }
      ])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    const complianceFees = summary?.items.filter((item) => item.description === "Compliance Reporting Fee") ?? [];
    expect(complianceFees).toHaveLength(1);
    expect(complianceFees[0]?.code).toBe("COMPLIANCE_REPORTING_FEE_FIRE_SPRINKLER");
  });

  it("uses the customer service address for compliance fees when the site is a generic placeholder", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Unknown",
        state: "Unknown",
        postalCode: ""
      },
      customerCompany: {
        serviceCity: "Enid",
        serviceState: "OK",
        servicePostalCode: "73701",
        billingCity: null,
        billingState: null,
        billingPostalCode: null
      }
    });
    txMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Enid Customer",
      quickbooksCustomerId: "qb_customer_1",
      billingType: "standard",
      billToAccountId: null,
      contractProfileId: null,
      invoiceDeliverySettings: { method: "payer_email" },
      autoBillingEnabled: false,
      requiredBillingReferences: {},
      serviceCity: "Enid",
      serviceState: "OK",
      servicePostalCode: "73701",
      billingCity: null,
      billingState: null,
      billingPostalCode: null
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.minimumTicketRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Unknown",
      state: "Unknown",
      postalCode: ""
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([{
      id: "compliance_rule_enid",
      city: "Enid",
      county: null,
      state: "OK",
      zipCode: "73701",
      normalizedCity: "ENID",
      normalizedCounty: "",
      normalizedState: "OK",
      normalizedZipCode: "73701",
      feeAmount: 35
    }]);

    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }])
      .mockResolvedValueOnce([{
        id: "report_1",
        inspectionId: "inspection_1",
        tenantId: "tenant_1",
        contentJson: {},
        inspectionType: "fire_alarm"
      }])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    const complianceFee = summary?.items.find((item) => item.description === "Compliance Reporting Fee");
    expect(complianceFee).toEqual(expect.objectContaining({
      unitPrice: 35,
      amount: 35
    }));
    expect(complianceFee?.metadata).toEqual(expect.objectContaining({
      complianceJurisdictionCity: "Enid",
      complianceJurisdictionState: "OK",
      complianceJurisdictionZipCode: "73701",
      complianceResolutionSource: "zip"
    }));
  });

  it("maps only supported inspection types into compliance reporting divisions", () => {
    expect(mapInspectionTypeToComplianceReportingDivision("fire_extinguisher")).toBe("fire_extinguishers");
    expect(mapInspectionTypeToComplianceReportingDivision("fire_alarm")).toBe("fire_alarm");
    expect(mapInspectionTypeToComplianceReportingDivision("joint_commission_fire_alarm")).toBe("fire_alarm");
    expect(mapInspectionTypeToComplianceReportingDivision("wet_fire_sprinkler")).toBe("fire_sprinkler");
    expect(mapInspectionTypeToComplianceReportingDivision("joint_commission_fire_sprinkler")).toBe("fire_sprinkler");
    expect(mapInspectionTypeToComplianceReportingDivision("kitchen_suppression")).toBe("kitchen_suppression");
    expect(mapInspectionTypeToComplianceReportingDivision("industrial_suppression")).toBeNull();
  });

  it("hydrates missing unit price from a stored catalog mapping during billing summary sync", async () => {
    const extinguisherDraft = buildFireExtinguisherDraft();

    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      site: {
        city: "Chicago",
        state: "IL",
        postalCode: "60601"
      }
    });
    txMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: null,
      defaultServiceFeeUnitPrice: null
    });
    txMock.serviceFeeRule.findMany.mockResolvedValue([]);
    txMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    txMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);
    prismaMock.billingItemCatalogMatch.findUnique.mockResolvedValue({
      sourceKey: "service|fire_extinguisher|inventory|servicePerformed||annual inspection",
      catalogItemId: "catalog_annual",
      confidence: 1,
      matchMethod: "source_mapping",
      catalogItem: {
        id: "catalog_annual",
        quickbooksItemId: "qb_annual",
        name: "Annual Inspection - Fire Extinguisher",
        sku: "FE-ANNUAL",
        itemType: "Service",
        unitPrice: 45
      }
    });

    txMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: extinguisherDraft,
          inspectionType: "fire_extinguisher"
        }
      ])
      .mockResolvedValueOnce([]);

    const summary = await syncInspectionBillingSummaryTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    const annualInspectionLine = summary?.items.find((item) => item.description === "Annual Inspection");
    expect(annualInspectionLine).toEqual(
      expect.objectContaining({
        unitPrice: 45,
        amount: 45,
        linkedCatalogItemId: "catalog_annual",
        linkedQuickBooksItemId: "qb_annual"
      })
    );
  });

  it("returns billing summaries and detail views only for admin roles", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          inspectionId: "inspection_1",
          customerCompanyId: "customer_1",
          customerName: "Pinecrest Property Management",
          siteId: "site_1",
          siteName: "Pinecrest Tower",
          inspectionDate: new Date("2026-03-20T15:00:00.000Z"),
          technicianName: "Alex Turner",
          status: "draft",
          pricingSnapshot: null,
          subtotal: 0,
          notes: null,
          items: [
            {
              id: "taxable_line",
              tenantId: "tenant_1",
              inspectionId: "inspection_1",
              reportId: "report_1",
              reportType: "kitchen_suppression",
              category: "material",
              description: "Wet chemical agent",
              quantity: 1,
              unitPrice: 100,
              taxable: true
            },
            ...extractBillableItemsFromDraft({
              tenantId: "tenant_1",
              inspectionId: "inspection_1",
              reportId: "report_1",
              reportType: "kitchen_suppression",
              draft: buildKitchenDraft()
            })
          ]
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          inspectionId: "inspection_1",
          customerCompanyId: "customer_1",
          customerName: "Pinecrest Property Management",
          siteId: "site_1",
          siteName: "Pinecrest Tower",
          inspectionDate: new Date("2026-03-20T15:00:00.000Z"),
          technicianName: "Alex Turner",
          status: "draft",
          pricingSnapshot: null,
          subtotal: 0,
          notes: "Review pricing",
          items: extractBillableItemsFromDraft({
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "kitchen_suppression",
            draft: buildKitchenDraft()
          })
        }
      ]);

    await expect(
      getAdminBillingSummaries({ userId: "tech_1", role: "technician", tenantId: "tenant_1" })
    ).rejects.toThrow(/only administrators/i);

    const summaries = await getAdminBillingSummaries({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" });
    expect(summaries[0]?.metrics.materialItemCount).toBe(4);
    expect(summaries[0]?.invoiceTotals.taxableSubtotal).toBe(100);
    expect(summaries[0]?.invoiceTotals.taxTotal).toBe(8.25);
    expect(summaries[0]?.invoiceTotals.totalDue).toBeGreaterThan(summaries[0]?.invoiceTotals.subtotalBeforeTax ?? 0);

    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          status: "draft"
        }
      ])
      .mockResolvedValueOnce([
        { inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }
      ])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: buildKitchenDraft(),
          inspectionType: "kitchen_suppression"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          customerCompanyId: "customer_1",
          siteId: "site_1",
          status: "draft",
          items: extractBillableItemsFromDraft({
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "kitchen_suppression",
            draft: buildKitchenDraft()
          }),
          subtotal: 0,
          notes: "Review pricing",
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z")
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          inspectionId: "inspection_1",
          customerCompanyId: "customer_1",
          customerName: "Pinecrest Property Management",
          siteId: "site_1",
          siteName: "Pinecrest Tower",
          inspectionDate: new Date("2026-03-20T15:00:00.000Z"),
          technicianName: "Alex Turner",
          status: "draft",
          quickbooksSyncStatus: null,
          quickbooksInvoiceId: null,
          quickbooksInvoiceNumber: null,
          quickbooksConnectionMode: null,
          quickbooksSyncedAt: null,
          quickbooksSendStatus: null,
          quickbooksSentAt: null,
          quickbooksSyncError: null,
          quickbooksSendError: null,
          subtotal: 0,
          notes: "Review pricing",
          items: extractBillableItemsFromDraft({
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "kitchen_suppression",
            draft: buildKitchenDraft()
          })
        }
      ]);

    const detail = await getAdminBillingSummaryDetail({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" }, "inspection_1");
    expect(detail?.groupedItems.material).toHaveLength(3);
    expect(detail?.notes).toBe("Review pricing");
  });

  it("uses detail-page catalog pricing resolution for billing summary totals", async () => {
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValue({
      id: "catalog_labor",
      quickbooksItemId: "qb_labor",
      name: "Fire Alarm - Annual Inspection",
      sku: null,
      itemType: "service",
      rawJson: null,
      unitPrice: 115,
      taxable: true
    });
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        inspectionId: "inspection_1",
        customerCompanyId: "customer_1",
        customerName: "Willow View Church - Enid",
        siteId: "site_1",
        siteName: "Willow View Church",
        inspectionDate: new Date("2026-04-15T16:30:00.000Z"),
        inspectionClassification: "standard",
        technicianName: "Paul Sanders",
        status: "invoiced",
        billingType: "standard",
        billToAccountId: null,
        billToName: null,
        contractProfileId: null,
        contractProfileName: null,
        routingSnapshot: null,
        pricingSnapshot: null,
        groupingSnapshot: null,
        attachmentSnapshot: null,
        deliverySnapshot: null,
        referenceSnapshot: null,
        quickbooksSyncStatus: "synced",
        quickbooksInvoiceId: "qb_invoice_1",
        quickbooksInvoiceNumber: "TW2026-1001",
        quickbooksConnectionMode: "live",
        quickbooksSyncedAt: new Date("2026-05-06T19:00:00.000Z"),
        quickbooksSendStatus: "not_sent",
        quickbooksSentAt: null,
        quickbooksSyncError: null,
        quickbooksSendError: null,
        subtotal: 80,
        notes: null,
        items: [
          {
            id: "labor_line",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_alarm",
            category: "labor",
            description: "On-site labor",
            quantity: 2,
            unitPrice: null,
            linkedCatalogItemId: "catalog_labor",
            linkedQuickBooksItemId: "qb_labor",
            taxable: true
          }
        ]
      }
    ]);

    const summaries = await getAdminBillingSummaries({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" });

    expect(summaries[0]?.subtotal).toBe(80);
    expect(summaries[0]?.items[0]?.unitPrice).toBe(115);
    expect(summaries[0]?.invoiceTotals.subtotalBeforeTax).toBe(230);
    expect(summaries[0]?.invoiceTotals.taxTotal).toBe(18.98);
    expect(summaries[0]?.invoiceTotals.totalDue).toBe(248.98);
  });

  it("sorts billing summaries alphabetically and then by earliest inspection date", async () => {
    const buildSummaryRow = (
      id: string,
      customerName: string,
      inspectionDate: Date
    ) => ({
      id,
      inspectionId: `${id}_inspection`,
      customerCompanyId: `${id}_customer`,
      customerName,
      customerIsTaxExempt: false,
      siteId: `${id}_site`,
      siteName: "Main",
      inspectionDate,
      inspectionClassification: "standard",
      technicianName: null,
      status: "invoiced",
      billingType: "standard",
      billToAccountId: null,
      billToName: null,
      contractProfileId: null,
      contractProfileName: null,
      routingSnapshot: null,
      pricingSnapshot: null,
      groupingSnapshot: null,
      attachmentSnapshot: null,
      deliverySnapshot: null,
      referenceSnapshot: null,
      quickbooksSyncStatus: "synced",
      quickbooksInvoiceId: null,
      quickbooksInvoiceNumber: null,
      quickbooksConnectionMode: null,
      quickbooksSyncedAt: null,
      quickbooksSendStatus: "not_sent",
      quickbooksSentAt: null,
      quickbooksSyncError: null,
      quickbooksSendError: null,
      subtotal: 0,
      notes: null,
      items: []
    });

    prismaMock.$queryRaw.mockResolvedValueOnce([
      buildSummaryRow("summary_z", "Zenith Fire", new Date("2026-05-01T09:00:00.000Z")),
      buildSummaryRow("summary_a_late", "Acme Fire", new Date("2026-05-20T09:00:00.000Z")),
      buildSummaryRow("summary_a_early", "Acme Fire", new Date("2026-05-01T09:00:00.000Z"))
    ]);

    const summaries = await getAdminBillingSummaries({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" });

    expect(summaries.map((summary) => summary.id)).toEqual(["summary_a_early", "summary_a_late", "summary_z"]);
  });

  it("locks invoiced billing summaries from note and line edits", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          status: "invoiced",
          subtotal: 125,
          notes: "Sent to accounting",
          items: [
            {
              id: "line_1",
              tenantId: "tenant_1",
              inspectionId: "inspection_1",
              reportId: "report_1",
              reportType: "fire_extinguisher",
              category: "service",
              description: "Annual Inspection",
              quantity: 1
            }
          ]
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          status: "invoiced",
          subtotal: 125,
          notes: "Sent to accounting",
          items: [
            {
              id: "line_1",
              tenantId: "tenant_1",
              inspectionId: "inspection_1",
              reportId: "report_1",
              reportType: "fire_extinguisher",
              category: "service",
              description: "Annual Inspection",
              quantity: 1
            }
          ]
        }
      ]);

    await expect(
      updateBillingSummaryNotes({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" }, "summary_1", "Edited after invoice")
    ).rejects.toThrow(/moved back to review/i);

    await expect(
      updateBillingSummaryItem({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" }, "summary_1", "line_1", 2, 99)
    ).rejects.toThrow(/moved back to review/i);
  });

  it("does not expose catalog matches for service fee lines in admin review", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          status: "draft"
        }
      ])
      .mockResolvedValueOnce([
        { inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
      {
        id: "summary_1",
        inspectionId: "inspection_1",
        customerCompanyId: "customer_1",
        customerName: "Pinecrest Property Management",
        siteId: "site_1",
        siteName: "Pinecrest Tower",
        inspectionDate: new Date("2026-03-20T15:00:00.000Z"),
        technicianName: "Alex Turner",
        status: "draft",
        quickbooksSyncStatus: null,
        quickbooksInvoiceId: null,
        quickbooksInvoiceNumber: null,
        quickbooksConnectionMode: null,
        quickbooksSyncedAt: null,
        quickbooksSyncError: null,
        subtotal: 95,
        notes: null,
        items: [
          {
            id: "inspection_1:service-fee",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "inspection_1",
            reportType: "inspection",
            sourceSection: "service-fee",
            sourceField: "serviceFee",
            category: "fee",
            code: "SERVICE_FEE",
            description: "Service Fee",
            quantity: 1,
            unitPrice: 95,
            metadata: {
              resolutionSource: "default"
            }
          }
        ]
      }
    ]);
    prismaMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    prismaMock.serviceFeeRule.findMany.mockResolvedValue([]);
    prismaMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    prismaMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);

    const detail = await getAdminBillingSummaryDetail(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(detail?.items[0]?.currentCatalogMatch).toBeNull();
    expect(detail?.items[0]?.suggestedCatalogMatches).toEqual([]);
    expect(prismaMock.quickBooksCatalogItem.findMany).not.toHaveBeenCalled();
  });

  it("resyncs non-invoiced billing detail so compliance reporting fees reflect current rules", async () => {
    const kitchenDraft = buildKitchenDraft();

    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          status: "draft"
        }
      ])
      .mockResolvedValueOnce([
        { inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }
      ])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: kitchenDraft,
          inspectionType: "kitchen_suppression"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          customerCompanyId: "customer_1",
          siteId: "site_1",
          status: "draft",
          items: [],
          subtotal: 0,
          notes: null,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z")
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          inspectionId: "inspection_1",
          customerCompanyId: "customer_1",
          customerName: "Pinecrest Property Management",
          siteId: "site_1",
          siteName: "Pinecrest Tower",
          inspectionDate: new Date("2026-03-20T15:00:00.000Z"),
          technicianName: "Alex Turner",
          status: "draft",
          quickbooksSyncStatus: null,
          quickbooksInvoiceId: null,
          quickbooksInvoiceNumber: null,
          quickbooksConnectionMode: null,
          quickbooksSyncedAt: null,
          quickbooksSendStatus: null,
          quickbooksSentAt: null,
          quickbooksSyncError: null,
          quickbooksSendError: null,
          subtotal: 117.5,
          notes: null,
          items: [
            {
              id: "inspection_1:service-fee",
              tenantId: "tenant_1",
              inspectionId: "inspection_1",
              reportId: "inspection_1",
              reportType: "inspection",
              sourceSection: "service-fee",
              sourceField: "serviceFee",
              category: "fee",
              code: "SERVICE_FEE",
              description: "Service Fee",
              quantity: 1,
              unitPrice: 95,
              amount: 95
            },
            {
              id: "inspection_1:compliance-fee:kitchen_suppression",
              tenantId: "tenant_1",
              inspectionId: "inspection_1",
              reportId: "inspection_1",
              reportType: "compliance_reporting",
              sourceSection: "compliance-reporting-fee",
              sourceField: "kitchen_suppression",
              category: "fee",
              code: "COMPLIANCE_REPORTING_FEE_KITCHEN_SUPPRESSION",
              description: "Compliance Reporting Fee",
              quantity: 1,
              unitPrice: 22.5,
              amount: 22.5,
              metadata: {
                feeType: "compliance_reporting",
                complianceDivision: "kitchen_suppression",
                complianceRuleId: "compliance_rule_1",
                complianceJurisdictionCity: "Chicago",
                complianceJurisdictionCounty: "Cook",
                complianceJurisdictionState: "IL",
                complianceResolutionSource: "city"
              }
            }
          ]
        }
      ]);

    prismaMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    prismaMock.serviceFeeRule.findMany.mockResolvedValue([]);
    prismaMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    prismaMock.complianceReportingFeeRule.findMany.mockResolvedValue([{
      id: "compliance_rule_1",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      zipCode: null,
      normalizedCity: "CHICAGO",
      normalizedCounty: "",
      normalizedState: "IL",
      normalizedZipCode: "",
      feeAmount: 22.5
    }]);

    const detail = await getAdminBillingSummaryDetail(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(prismaMock.$executeRaw).toHaveBeenCalled();
    expect(detail?.items.find((item) => item.code === "COMPLIANCE_REPORTING_FEE_KITCHEN_SUPPRESSION")).toEqual(
      expect.objectContaining({
        description: "Compliance Reporting Fee",
        unitPrice: 22.5
      })
    );
  });

  it("refreshes historical completed non-invoiced inspections for current compliance fee rules", async () => {
    const kitchenDraft = buildKitchenDraft();

    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ inspectionId: "inspection_1" }])
      .mockResolvedValueOnce([
        {
          inspectionId: "inspection_1",
          customerCompanyId: "customer_1",
          siteId: "site_1",
          inspectionClassification: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "report_1",
          inspectionId: "inspection_1",
          tenantId: "tenant_1",
          contentJson: kitchenDraft,
          inspectionType: "kitchen_suppression"
        }
      ])
      .mockResolvedValueOnce([]);

    prismaMock.billingResolutionSnapshot.findFirst.mockResolvedValue(null);
    prismaMock.billingResolutionSnapshot.create.mockResolvedValue({ id: "billing_resolution_1" });
    prismaMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL",
      postalCode: "60601"
    });
    prismaMock.customerCompany.findFirst.mockResolvedValue({
      id: "customer_1",
      name: "Pinecrest Property Management",
      quickbooksCustomerId: "qb_customer_1",
      billingType: "standard",
      billToAccountId: null,
      contractProfileId: null,
      invoiceDeliverySettings: { method: "payer_email" },
      autoBillingEnabled: false,
      requiredBillingReferences: {},
      serviceCity: null,
      serviceState: null,
      servicePostalCode: null,
      billingCity: null,
      billingState: null,
      billingPostalCode: null
    });
    prismaMock.complianceReportingFeeRule.findMany.mockResolvedValue([{
      id: "compliance_rule_1",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      zipCode: null,
      normalizedCity: "CHICAGO",
      normalizedCounty: "",
      normalizedState: "IL",
      normalizedZipCode: "",
      feeAmount: 22.5
    }]);
    prismaMock.auditLog.create.mockResolvedValue({ id: "audit_1" });

    const result = await refreshCompletedInspectionComplianceFees({
      userId: "office_1",
      role: "office_admin",
      tenantId: "tenant_1"
    });

    expect(result).toEqual({
      inspectedCount: 1,
      refreshedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      failures: []
    });
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "billing.compliance_fees_refreshed",
        metadata: expect.objectContaining({
          refreshedCount: 1
        })
      })
    }));
  });

  it("updates grouped billing rows while preserving underlying items", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 90,
        notes: null,
        quickbooksSyncStatus: "not_synced",
        quickbooksInvoiceId: null,
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "service",
            description: "Annual Inspection",
            quantity: 1,
            unitPrice: 45,
            linkedCatalogItemId: "catalog_1",
            linkedCatalogItemName: "Annual Inspection - Fire Extinguisher",
            linkedQuickBooksItemId: "qb_1"
          },
          {
            id: "line_2",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_2",
            reportType: "fire_extinguisher",
            category: "service",
            description: "Annual Inspection",
            quantity: 1,
            unitPrice: 45,
            linkedCatalogItemId: "catalog_1",
            linkedCatalogItemName: "Annual Inspection - Fire Extinguisher",
            linkedQuickBooksItemId: "qb_1"
          }
        ]
      }
    ]);

    await updateBillingSummaryItemGroup(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "summary_1",
      ["line_1", "line_2"],
      7,
      50
    );

    const executeRawText = prismaMock.$executeRaw.mock.calls
      .flat()
      .find((entry) => typeof entry === "string" && entry.includes("\"line_1\""));

    expect(executeRawText).toContain("\"unitPrice\":50");
    expect(executeRawText).toContain("\"id\":\"line_1\"");
    expect(executeRawText).toContain("\"id\":\"line_2\"");
  });

  it("preserves taxable overrides when billing summaries are refreshed from extracted report items", () => {
    const merged = mergeBillingItems(
      [
        {
          id: "line_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          reportId: "report_1",
          reportType: "kitchen_suppression",
          category: "material",
          code: "FUSIBLE_LINK_360",
          description: "Fusible links used (360°F)",
          quantity: 3,
          unitPrice: 15,
          amount: 45,
          taxable: true,
          taxableSource: "override",
          quickBooksTaxableStatus: "taxable",
          taxCodeId: "TAX",
          taxRate: 0.0825,
          taxAmount: 3.71,
          lineTotal: 48.71,
          linkedCatalogItemId: "catalog_link",
          linkedCatalogItemName: "Fusible Link - 360°",
          linkedQuickBooksItemId: "qb_link"
        }
      ],
      [
        {
          id: "line_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          reportId: "report_1",
          reportType: "kitchen_suppression",
          category: "material",
          code: "FUSIBLE_LINK_360",
          description: "Fusible links used (360°F)",
          quantity: 3,
          unitPrice: 15,
          amount: 45,
          taxable: false,
          taxableSource: "quickbooks",
          quickBooksTaxableStatus: "non_taxable",
          taxCodeId: "NON",
          taxRate: 0,
          linkedCatalogItemId: "catalog_link",
          linkedCatalogItemName: "Fusible Link - 360°",
          linkedQuickBooksItemId: "qb_link"
        }
      ]
    );

    expect(merged[0]).toEqual(expect.objectContaining({
      taxable: true,
      taxableSource: "override",
      quickBooksTaxableStatus: "taxable",
      taxCodeId: "TAX",
      taxRate: 0.0825,
      taxAmount: null,
      lineTotal: null
    }));
    expect(calculateInvoiceTotalsFromItems(merged).taxTotal).toBe(3.71);
    expect(calculateInvoiceTotalsFromItems(merged).totalDue).toBe(48.71);
  });

  it("preserves manual catalog matches when billing summaries are refreshed from extracted report items", () => {
    const merged = mergeBillingItems(
      [
        {
          id: "line_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          reportId: "report_1",
          reportType: "fire_alarm",
          category: "labor",
          code: "ON_SITE_LABOR",
          description: "On-site labor",
          quantity: 2,
          unitPrice: 115,
          amount: 230,
          linkedCatalogItemId: "catalog_fire_alarm_labor",
          linkedCatalogItemName: "Fire Alarm Labor",
          linkedQuickBooksItemId: "qb_fire_alarm_labor",
          linkedMatchMethod: "manual",
          linkedMatchConfidence: 1,
          taxable: true
        }
      ],
      [
        {
          id: "line_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          reportId: "report_1",
          reportType: "fire_alarm",
          category: "labor",
          code: "ON_SITE_LABOR",
          description: "On-site labor",
          quantity: 2,
          unitPrice: 115,
          amount: 230,
          linkedCatalogItemId: null,
          linkedCatalogItemName: null,
          linkedQuickBooksItemId: null,
          linkedMatchMethod: null,
          linkedMatchConfidence: null,
          taxable: false
        }
      ]
    );

    expect(merged[0]).toEqual(expect.objectContaining({
      linkedCatalogItemId: "catalog_fire_alarm_labor",
      linkedCatalogItemName: "Fire Alarm Labor",
      linkedQuickBooksItemId: "qb_fire_alarm_labor",
      linkedMatchMethod: "manual",
      linkedMatchConfidence: 1
    }));
  });

  it("persists taxable overrides across every underlying item in a grouped billing row", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          status: "draft",
          subtotal: 45,
          notes: null,
          quickbooksSyncStatus: "not_synced",
          quickbooksInvoiceId: null,
          items: [
            {
              id: "line_1",
              tenantId: "tenant_1",
              inspectionId: "inspection_1",
              reportId: "report_1",
              reportType: "kitchen_suppression",
              sourceSection: "tank and service",
              sourceField: "quantity",
              category: "material",
              code: "FUSIBLE_LINK_360",
              description: "Fusible links used (360°F)",
              quantity: 1,
              unitPrice: 15,
              amount: 15,
              taxable: false,
              taxableSource: "quickbooks",
              quickBooksTaxableStatus: "non_taxable",
              taxCodeId: "NON",
              taxRate: 0,
              linkedCatalogItemId: "catalog_link",
              linkedCatalogItemName: "Fusible Link - 360°",
              linkedQuickBooksItemId: "qb_link"
            },
            {
              id: "line_2",
              tenantId: "tenant_1",
              inspectionId: "inspection_1",
              reportId: "report_1",
              reportType: "kitchen_suppression",
              sourceSection: "tank and service",
              sourceField: "quantity",
              category: "material",
              code: "FUSIBLE_LINK_360",
              description: "Fusible links used (360°F)",
              quantity: 2,
              unitPrice: 15,
              amount: 30,
              taxable: false,
              taxableSource: "quickbooks",
              quickBooksTaxableStatus: "non_taxable",
              taxCodeId: "NON",
              taxRate: 0,
              linkedCatalogItemId: "catalog_link",
              linkedCatalogItemName: "Fusible Link - 360°",
              linkedQuickBooksItemId: "qb_link"
            }
          ]
        }
      ])
      .mockResolvedValueOnce([
        { inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }
      ]);

    await updateBillingSummaryItemGroup(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "summary_1",
      ["line_1", "line_2"],
      3,
      15,
      true
    );

    const updateCall = prismaMock.$executeRaw.mock.calls.at(-1);
    const persistedItems = JSON.parse(String(updateCall?.[1] ?? "[]"));
    const persistedSourceItems = persistedItems.filter((item: { id?: string }) => item.id === "line_1" || item.id === "line_2");

    expect(persistedSourceItems).toHaveLength(2);
    expect(persistedSourceItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "line_1",
        taxable: true,
        taxableSource: "override",
        quickBooksTaxableStatus: "taxable",
        taxCodeId: "TAX",
        taxRate: 0.0825,
        taxAmount: 1.24,
        lineTotal: 16.24
      }),
      expect.objectContaining({
        id: "line_2",
        taxable: true,
        taxableSource: "override",
        quickBooksTaxableStatus: "taxable",
        taxCodeId: "TAX",
        taxRate: 0.0825,
        taxAmount: 2.48,
        lineTotal: 32.48
      })
    ]));
  });

  it("persists non-taxable overrides for grouped rows that were previously taxable", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          status: "draft",
          subtotal: 45,
          notes: null,
          quickbooksSyncStatus: "not_synced",
          quickbooksInvoiceId: null,
          items: [
            {
              id: "line_1",
              tenantId: "tenant_1",
              inspectionId: "inspection_1",
              reportId: "report_1",
              reportType: "kitchen_suppression",
              sourceSection: "tank and service",
              sourceField: "quantity",
              category: "material",
              code: "FUSIBLE_LINK_360",
              description: "Fusible links used (360°F)",
              quantity: 3,
              unitPrice: 15,
              amount: 45,
              taxable: true,
              taxableSource: "quickbooks",
              quickBooksTaxableStatus: "taxable",
              taxCodeId: "TAX",
              taxRate: 0.0825,
              linkedCatalogItemId: "catalog_link",
              linkedCatalogItemName: "Fusible Link - 360°",
              linkedQuickBooksItemId: "qb_link"
            }
          ]
        }
      ])
      .mockResolvedValueOnce([
        { inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }
      ]);

    await updateBillingSummaryItemGroup(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "summary_1",
      ["line_1"],
      3,
      15,
      false
    );

    const updateCall = prismaMock.$executeRaw.mock.calls.at(-1);
    const persistedItems = JSON.parse(String(updateCall?.[1] ?? "[]"));

    expect(persistedItems[0]).toEqual(expect.objectContaining({
      taxable: false,
      taxableSource: "override",
      quickBooksTaxableStatus: "non_taxable",
      taxCodeId: "NON",
      taxRate: 0,
      taxAmount: 0,
      lineTotal: 45
    }));
  });

  it("suggests normalized and alias-based catalog matches without forcing manual renames", async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          status: "draft"
        }
      ])
      .mockResolvedValueOnce([
        { inspectionId: "inspection_1", customerCompanyId: "customer_1", siteId: "site_1" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "summary_1",
          tenantId: "tenant_1",
          inspectionId: "inspection_1",
          customerCompanyId: "customer_1",
          siteId: "site_1",
          status: "draft",
          items: [],
          subtotal: 0,
          notes: null,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T00:00:00.000Z")
        }
      ])
      .mockResolvedValueOnce([
      {
        id: "summary_1",
        inspectionId: "inspection_1",
        customerCompanyId: "customer_1",
        customerName: "Pinecrest Property Management",
        siteId: "site_1",
        siteName: "Pinecrest Tower",
        inspectionDate: new Date("2026-03-20T15:00:00.000Z"),
        technicianName: "Alex Turner",
        status: "draft",
        quickbooksSyncStatus: null,
        quickbooksInvoiceId: null,
        quickbooksInvoiceNumber: null,
        quickbooksConnectionMode: null,
        quickbooksSyncedAt: null,
        quickbooksSyncError: null,
        subtotal: 0,
        notes: null,
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "service",
            description: "Fire Extinguisher Inspection - Annual",
            quantity: 1
          }
        ]
      }
    ]);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        id: "catalog_exact",
        quickbooksItemId: "qb_1",
        name: "Annual Inspection",
        sku: "FE-ANNUAL",
        itemType: "Service",
        unitPrice: 45
      }
    ]);
    prismaMock.quickBooksCatalogItemAlias.findMany.mockResolvedValue([
      {
        alias: "Annual extinguisher inspection",
        catalogItem: {
          id: "catalog_alias",
          quickbooksItemId: "qb_2",
          name: "Annual Inspection",
          sku: "FE-ANNUAL",
          itemType: "Service",
          unitPrice: 45
        }
      }
    ]);

    const detail = await getAdminBillingSummaryDetail(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(detail?.items[0]?.currentCatalogMatch).toBeNull();
    expect(detail?.items[0]?.suggestedCatalogMatches[0]).toEqual(
      expect.objectContaining({
        name: "Annual Inspection",
        unitPrice: 45
      })
    );
  });

  it("returns conservative search results for ambiguous billing item names", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 125,
        notes: "Review pricing",
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "service",
            description: "Inspection",
            quantity: 1
          }
        ]
      }
    ]);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      { id: "catalog_1", quickbooksItemId: "qb_1", name: "Annual Inspection", sku: null, itemType: "Service", unitPrice: 45 },
      { id: "catalog_2", quickbooksItemId: "qb_2", name: "Six Year Inspection", sku: null, itemType: "Service", unitPrice: 95 }
    ]);

    const result = await searchBillingSummaryItemCatalogMatches(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { summaryId: "summary_1", itemId: "line_1", query: "Inspection" }
    );

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]?.autoMatchEligible).toBe(false);
  });

  it("matches typed search text against catalog items even when the billing line description is unrelated", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 125,
        notes: "Review pricing",
        quickbooksSyncStatus: null,
        quickbooksInvoiceId: null,
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "emergency_exit_lighting",
            category: "material",
            description: "Emergency Light Annual Inspection",
            quantity: 1
          }
        ]
      }
    ]);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        id: "catalog_cap_metal",
        quickbooksItemId: "qb_cap_metal",
        name: "Metal Caps",
        sku: "CAP-METAL",
        itemType: "NonInventory",
        unitPrice: 1.25
      },
      {
        id: "catalog_cap_rubber",
        quickbooksItemId: "qb_cap_rubber",
        name: "Rubber Cap",
        sku: "CAP-RUBBER",
        itemType: "NonInventory",
        unitPrice: 0.95
      }
    ]);
    prismaMock.quickBooksCatalogItemAlias.findMany.mockResolvedValue([]);

    const result = await searchBillingSummaryItemCatalogMatches(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { summaryId: "summary_1", itemId: "line_1", query: "cap" }
    );

    expect(result.results.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining(["Metal Caps", "Rubber Cap"])
    );
  });

  it("returns broad manual search matches for short terms like new without weakening automatic suggestions", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 125,
        notes: "Review pricing",
        quickbooksSyncStatus: null,
        quickbooksInvoiceId: null,
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "material",
            description: "Annual Inspection",
            quantity: 1
          }
        ]
      }
    ]);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        id: "catalog_new_install",
        quickbooksItemId: "qb_new_install",
        name: "New Install - Fire Extinguisher",
        sku: "NEW-INSTALL-FE",
        itemType: "Service",
        unitPrice: 120
      },
      {
        id: "catalog_new_cabinet",
        quickbooksItemId: "qb_new_cabinet",
        name: "New Cabinet",
        sku: "NEW-CAB",
        itemType: "NonInventory",
        unitPrice: 35
      }
    ]);
    prismaMock.quickBooksCatalogItemAlias.findMany.mockResolvedValue([]);

    const result = await searchBillingSummaryItemCatalogMatches(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { summaryId: "summary_1", itemId: "line_1", query: "New" }
    );

    expect(result.results.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining(["New Install - Fire Extinguisher", "New Cabinet"])
    );
  });

  it("matches invoice items with common weight shorthand and broad catalog search", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 125,
        notes: "Review pricing",
        quickbooksSyncStatus: null,
        quickbooksInvoiceId: null,
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "material",
            description: "Recharge (5 lb ABC)",
            quantity: 1
          }
        ]
      }
    ]);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        id: "catalog_recharge",
        quickbooksItemId: "qb_recharge",
        name: "Recharge - 5# ABC Fire Extinguisher",
        sku: "RECHG-5ABC",
        itemType: "Service",
        unitPrice: 33.5
      }
    ]);
    prismaMock.quickBooksCatalogItemAlias.findMany.mockResolvedValue([]);

    const result = await searchBillingSummaryItemCatalogMatches(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { summaryId: "summary_1", itemId: "line_1", query: "Recharge (5 lb ABC)" }
    );

    expect(prismaMock.quickBooksCatalogItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ OR: expect.any(Array) })
      })
    );
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        name: "Recharge - 5# ABC Fire Extinguisher",
        unitPrice: 33.5
      })
    );
  });

  it("matches manual catalog searches by description and QuickBooks item id", async () => {
    const summaryRow = [
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 0,
        notes: null,
        quickbooksSyncStatus: "not_synced",
        quickbooksInvoiceId: null,
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_alarm",
            category: "service",
            description: "Miscellaneous service",
            quantity: 1,
            unitPrice: null
          }
        ]
      }
    ];
    prismaMock.$queryRaw.mockImplementation(async () => summaryRow);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        id: "catalog_monitoring",
        quickbooksItemId: "QBO-SVC-42",
        name: "Central Station Signal Test",
        sku: "FA-SIGNAL",
        itemType: "Service",
        rawJson: {
          Description: "Fire alarm monitoring verification and dispatch signal confirmation"
        },
        unitPrice: 85
      }
    ]);
    prismaMock.quickBooksCatalogItemAlias.findMany.mockResolvedValue([]);

    const byDescription = await searchBillingSummaryItemCatalogMatches(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { summaryId: "summary_1", itemId: "line_1", query: "dispatch signal" }
    );
    const byQuickBooksId = await searchBillingSummaryItemCatalogMatches(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { summaryId: "summary_1", itemId: "line_1", query: "QBO-SVC-42" }
    );

    expect(byDescription.results[0]).toEqual(expect.objectContaining({
      catalogItemId: "catalog_monitoring",
      description: "Fire alarm monitoring verification and dispatch signal confirmation"
    }));
    expect(byQuickBooksId.results[0]?.catalogItemId).toBe("catalog_monitoring");
  });

  it("blocks manual catalog searching for service fee lines", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 95,
        notes: null,
        items: [
          {
            id: "inspection_1:service-fee",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "inspection_1",
            reportType: "inspection",
            category: "fee",
            description: "Service Fee",
            quantity: 1,
            unitPrice: 95
          }
        ]
      }
    ]);

    await expect(
      searchBillingSummaryItemCatalogMatches(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        { summaryId: "summary_1", itemId: "inspection_1:service-fee", query: "service fee" }
      )
    ).rejects.toThrow(/automatic fee pricing is controlled by fee rules/i);
  });

  it("persists a manual billing item link and reusable mapping", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 125,
        notes: "Review pricing",
        quickbooksSyncStatus: "not_synced",
        quickbooksInvoiceId: null,
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "service",
            sourceSection: "inventory",
            sourceField: "servicePerformed",
            description: "Annual Inspection",
            quantity: 1,
            unitPrice: 45
          }
        ]
      }
    ]);
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValue({
      id: "catalog_1",
      quickbooksItemId: "qb_1",
      name: "Annual Inspection",
      sku: "FE-ANNUAL",
      unitPrice: 45,
      taxable: true,
      rawJson: { SalesTaxCodeRef: { value: "TAX" } }
    });

    await linkBillingSummaryItemCatalog(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        summaryId: "summary_1",
        itemId: "line_1",
        catalogItemId: "catalog_1",
        saveMapping: true,
        alias: "Fire Extinguisher Inspection - Annual"
      }
    );

    expect(prismaMock.inspectionBillingSummary.update).toHaveBeenCalled();
    const updateInput = prismaMock.inspectionBillingSummary.update.mock.calls[0]?.[0];
    const updatedItems = Array.isArray(updateInput?.data?.items) ? updateInput.data.items : [];
    expect(updatedItems.find((item) => item.id === "line_1")).toEqual(
      expect.objectContaining({
        taxable: true,
        taxableSource: "quickbooks",
        quickBooksTaxableStatus: "taxable",
        quickBooksTaxCodeRef: "TAX"
      })
    );
    expect(prismaMock.billingItemCatalogMatch.upsert).toHaveBeenCalled();
    expect(prismaMock.quickBooksCatalogItemAlias.upsert).toHaveBeenCalled();
  });

  it("adds an admin manual billing line from the products and services catalog", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        customerCompanyId: "customer_1",
        siteId: "site_1",
        inspectionClassification: "standard",
        status: "reviewed",
        billingType: "standard",
        billToAccountId: null,
        billToName: null,
        contractProfileId: null,
        contractProfileName: null,
        routingSnapshot: null,
        pricingSnapshot: null,
        groupingSnapshot: null,
        attachmentSnapshot: null,
        deliverySnapshot: null,
        referenceSnapshot: null,
        subtotal: 125,
        notes: "Ready",
        quickbooksSyncStatus: "not_synced",
        quickbooksInvoiceId: null,
        quickbooksSendStatus: "not_sent",
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_alarm",
            category: "service",
            description: "Annual inspection",
            quantity: 1,
            unitPrice: 125
          }
        ]
      }
    ]);
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValue({
      id: "catalog_labor",
      quickbooksItemId: "qb_labor",
      name: "Additional fire alarm labor",
      sku: "LAB-FA",
      itemType: "Labor",
      unitPrice: 115,
      taxable: false,
      rawJson: { Description: "Extra labor", SalesTaxCodeRef: { value: "NON" } }
    });
    prismaMock.minimumTicketRule.findMany.mockResolvedValue([]);

    await addBillingSummaryManualLine(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        summaryId: "summary_1",
        catalogItemId: "catalog_labor",
        description: "After-hours troubleshooting",
        quantity: 2,
        unitPrice: 115
      }
    );

    expect(prismaMock.inspectionBillingSummary.update).toHaveBeenCalled();
    const updateInput = prismaMock.inspectionBillingSummary.update.mock.calls[0]?.[0];
    const updatedItems = Array.isArray(updateInput?.data?.items) ? updateInput.data.items : [];
    expect(updatedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reportType: "inspection",
          sourceSection: "manual-billing",
          sourceField: "admin-added",
          category: "labor",
          description: "After-hours troubleshooting",
          quantity: 2,
          unitPrice: 115,
          amount: 230,
          linkedCatalogItemId: "catalog_labor",
          linkedQuickBooksItemId: "qb_labor",
          taxable: true
        })
      ])
    );
    expect(updateInput?.data?.subtotal).toBe(355);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "billing.manual_line_added"
      })
    }));
  });

  it("applies the linked catalog price to billing lines", async () => {
    const summaryRow = [
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 125,
        notes: "Review pricing",
        quickbooksSyncStatus: "not_synced",
        quickbooksInvoiceId: null,
        items: [
          {
            id: "line_missing",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "service",
            description: "Annual Inspection",
            quantity: 2,
            unitPrice: null
          },
          {
            id: "line_priced",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "service",
            description: "Six Year Inspection",
            quantity: 1,
            unitPrice: 125
          }
        ]
      }
    ];
    prismaMock.$queryRaw.mockImplementation(async () => summaryRow);
    prismaMock.quickBooksCatalogItem.findFirst
      .mockResolvedValueOnce({
        id: "catalog_1",
        quickbooksItemId: "qb_1",
        name: "Annual Inspection",
        sku: "FE-ANNUAL",
        unitPrice: 45
      })
      .mockResolvedValueOnce({
        id: "catalog_2",
        quickbooksItemId: "qb_2",
        name: "Six Year Inspection",
        sku: "FE-6YR",
        unitPrice: 65
      });

    await linkBillingSummaryItemCatalog(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        summaryId: "summary_1",
        itemId: "line_missing",
        catalogItemId: "catalog_1",
        saveMapping: false
      }
    );

    await linkBillingSummaryItemCatalog(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        summaryId: "summary_1",
        itemId: "line_priced",
        catalogItemId: "catalog_2",
        saveMapping: false
      }
    );

    const firstUpdate = prismaMock.inspectionBillingSummary.update.mock.calls[0]?.[0];
    const secondUpdate = prismaMock.inspectionBillingSummary.update.mock.calls[1]?.[0];
    const firstItems = Array.isArray(firstUpdate?.data?.items) ? firstUpdate.data.items : [];
    const secondItems = Array.isArray(secondUpdate?.data?.items) ? secondUpdate.data.items : [];

    expect(firstItems.find((item) => item.id === "line_missing")).toEqual(
      expect.objectContaining({
        unitPrice: 45,
        amount: 90,
        linkedCatalogItemId: "catalog_1"
      })
    );
    expect(secondItems.find((item) => item.id === "line_priced")).toEqual(
      expect.objectContaining({
        unitPrice: 65,
        amount: 65,
        linkedCatalogItemId: "catalog_2"
      })
    );
  });

  it("applies the linked catalog price across grouped billing rows", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 40,
        notes: "Review pricing",
        quickbooksSyncStatus: "not_synced",
        quickbooksInvoiceId: null,
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "material",
            description: "Cabinet decal",
            quantity: 1,
            unitPrice: 10
          },
          {
            id: "line_2",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "material",
            description: "Cabinet decal",
            quantity: 3,
            unitPrice: 10
          }
        ]
      }
    ]);
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValueOnce({
      id: "catalog_group",
      quickbooksItemId: "qb_group",
      name: "Cabinet decal",
      sku: "DECAL",
      unitPrice: 18
    });

    await linkBillingSummaryItemGroupCatalog(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        summaryId: "summary_1",
        itemIds: ["line_1", "line_2"],
        catalogItemId: "catalog_group",
        saveMapping: false
      }
    );

    const updateCall = prismaMock.inspectionBillingSummary.update.mock.calls.at(-1)?.[0];
    const updatedItems = Array.isArray(updateCall?.data?.items) ? updateCall.data.items : [];

    expect(updatedItems.find((item) => item.id === "line_1")).toEqual(
      expect.objectContaining({
        unitPrice: 18,
        amount: 18,
        linkedCatalogItemId: "catalog_group"
      })
    );
    expect(updatedItems.find((item) => item.id === "line_2")).toEqual(
      expect.objectContaining({
        unitPrice: 18,
        amount: 54,
        linkedCatalogItemId: "catalog_group"
      })
    );
  });

  it("preserves matched catalog pricing when saving a grouped row with a blank unit price", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 0,
        notes: null,
        quickbooksSyncStatus: "not_synced",
        quickbooksInvoiceId: null,
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "material",
            description: "New (2.5 lb ABC)",
            quantity: 2,
            unitPrice: null,
            linkedCatalogItemId: "catalog_1",
            linkedCatalogItemName: "New 2.5 ABC Fire Extinguisher",
            linkedQuickBooksItemId: "qb_1",
            linkedMatchMethod: "manual",
            linkedMatchConfidence: 1
          },
          {
            id: "line_2",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "material",
            description: "New (2.5 lb ABC)",
            quantity: 5,
            unitPrice: null,
            linkedCatalogItemId: "catalog_1",
            linkedCatalogItemName: "New 2.5 ABC Fire Extinguisher",
            linkedQuickBooksItemId: "qb_1",
            linkedMatchMethod: "manual",
            linkedMatchConfidence: 1
          }
        ]
      }
    ]);
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValue({
      id: "catalog_1",
      quickbooksItemId: "qb_1",
      name: "New 2.5 ABC Fire Extinguisher",
      sku: "FE-2.5-ABC",
      itemType: "Inventory",
      unitPrice: 32.5
    });

    await updateBillingSummaryItemGroup(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "summary_1",
      ["line_1", "line_2"],
      7,
      null
    );

    const updateCall = prismaMock.$executeRaw.mock.calls.at(-1);
    const persistedItems = JSON.parse(String(updateCall?.[1] ?? "[]"));
    expect(persistedItems[0]).toEqual(expect.objectContaining({ unitPrice: 32.5, amount: 65 }));
    expect(persistedItems[1]).toEqual(expect.objectContaining({ unitPrice: 32.5, amount: 162.5 }));
  });

  it("clears a manual billing item link without breaking pricing", async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 125,
        notes: "Review pricing",
        quickbooksSyncStatus: "not_synced",
        quickbooksInvoiceId: null,
        items: [
          {
            id: "line_1",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "fire_extinguisher",
            category: "service",
            description: "Annual Inspection",
            quantity: 1,
            unitPrice: 45,
            linkedCatalogItemId: "catalog_1",
            linkedCatalogItemName: "Annual Inspection",
            linkedQuickBooksItemId: "qb_1"
          }
        ]
      }
    ]);

    await clearBillingSummaryItemCatalogLink(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { summaryId: "summary_1", itemId: "line_1" }
    );

    expect(prismaMock.inspectionBillingSummary.update).toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("blocks manual catalog linking and clearing for service fee lines", async () => {
    const summaryRow = [
      {
        id: "summary_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        status: "draft",
        subtotal: 95,
        notes: null,
        quickbooksSyncStatus: "not_synced",
        quickbooksInvoiceId: null,
        items: [
          {
            id: "inspection_1:service-fee",
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "inspection_1",
            reportType: "inspection",
            category: "fee",
            description: "Service Fee",
            quantity: 1,
            unitPrice: 95
          }
        ]
      }
    ];
    prismaMock.$queryRaw.mockImplementation(async () => summaryRow);

    await expect(
      linkBillingSummaryItemCatalog(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        {
          summaryId: "summary_1",
          itemId: "inspection_1:service-fee",
          catalogItemId: "catalog_fee"
        }
      )
    ).rejects.toThrow(/automatic fee pricing is controlled by fee rules/i);

    await expect(
      clearBillingSummaryItemCatalogLink(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        { summaryId: "summary_1", itemId: "inspection_1:service-fee" }
      )
    ).rejects.toThrow(/automatic fee pricing is controlled by fee rules/i);
  });
});




