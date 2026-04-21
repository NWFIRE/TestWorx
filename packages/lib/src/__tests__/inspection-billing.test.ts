import { reportStatuses } from "@testworx/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => ({
  prismaMock: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
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
    complianceReportingFeeRule: { findFirst: vi.fn() },
    billingItemCatalogMatch: { findUnique: vi.fn(), upsert: vi.fn() },
    quickBooksCatalogItem: { findFirst: vi.fn(), findMany: vi.fn() },
    quickBooksCatalogItemAlias: { findMany: vi.fn(), upsert: vi.fn() },
    inspectionBillingSummary: { update: vi.fn() },
    auditLog: { create: vi.fn() }
  },
  txMock: {
    $queryRaw: vi.fn(),
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
    complianceReportingFeeRule: { findFirst: vi.fn() }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../quickbooks", () => ({
  saveQuickBooksItemMappingForCode: vi.fn().mockResolvedValue(undefined)
}));

import {
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
  searchBillingSummaryItemCatalogMatches,
  syncInspectionBillingSummaryTx,
  updateBillingSummaryItem,
  updateBillingSummaryItemGroup,
  updateBillingSummaryNotes
} from "../inspection-billing";
import { buildInitialReportDraft } from "../report-engine";
import { mapInspectionTypeToComplianceReportingDivision } from "../compliance-reporting-fees";
import { resolveInspectionServiceFeeTx } from "../service-fees";

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

describe("inspection billing extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMock.inspection.findFirst.mockReset();
    txMock.customerCompany.findFirst.mockReset();
    txMock.billingPayerAccount.findFirst.mockReset();
    txMock.billingContractProfile.findFirst.mockReset();
    txMock.providerContractProfile.findFirst.mockReset();
    txMock.providerContractRate.findMany.mockReset();
    txMock.billingResolutionSnapshot.findFirst.mockReset();
    txMock.billingResolutionSnapshot.create.mockReset();
    txMock.site.findFirst.mockReset();
    txMock.tenant.findUnique.mockReset();
    txMock.serviceFeeRule.findMany.mockReset();
    txMock.complianceReportingFeeRule.findFirst.mockReset();
    prismaMock.billingItemCatalogMatch.findUnique.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.quickBooksCatalogItemAlias.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock as never));
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);
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
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);
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

    expect(items.map((item) => [item.category, item.description, item.quantity])).toEqual([
      ["labor", "On-site labor", 3.5]
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
});

describe("inspection billing persistence and admin review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockReset();
    prismaMock.$executeRaw.mockReset();
    prismaMock.billingItemCatalogMatch.findUnique.mockReset();
    prismaMock.quickBooksCatalogItem.findFirst.mockReset();
    prismaMock.quickBooksCatalogItem.findMany.mockReset();
    prismaMock.quickBooksCatalogItemAlias.findMany.mockReset();
    txMock.$queryRaw.mockReset();
    txMock.$executeRaw.mockReset();
    txMock.inspection.findFirst.mockReset();
    txMock.customerCompany.findFirst.mockReset();
    txMock.billingPayerAccount.findFirst.mockReset();
    txMock.billingContractProfile.findFirst.mockReset();
    txMock.site.findFirst.mockReset();
    txMock.tenant.findUnique.mockReset();
    txMock.serviceFeeRule.findMany.mockReset();
    txMock.complianceReportingFeeRule.findFirst.mockReset();
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
    prismaMock.billingPayerAccount.findFirst.mockResolvedValue(null);
    prismaMock.billingContractProfile.findFirst.mockResolvedValue(null);
    prismaMock.tenant.findUnique.mockResolvedValue({
      defaultServiceFeeCode: "SERVICE_FEE",
      defaultServiceFeeUnitPrice: 95
    });
    prismaMock.serviceFeeRule.findMany.mockResolvedValue([]);
    prismaMock.site.findFirst.mockResolvedValue({
      city: "Chicago",
      state: "IL"
    });
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);
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
    txMock.complianceReportingFeeRule.findFirst.mockResolvedValue({
      id: "compliance_rule_1",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      feeAmount: 22.5
    });

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

  it("snapshots contract-provider billing resolution during summary sync", async () => {
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
    txMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);
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
    txMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);
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
        workOrderLevelOverride: true
      })
    );
    expect(summary?.deliverySnapshot).toEqual(
      expect.objectContaining({
        warningCodes: ["provider_context_override_direct"]
      })
    );
  });

  it("falls back to non-contract pricing with a warning when a provider has no active contract", async () => {
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
    txMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);
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

  it("marks provider billing blocked when the snapped contract is expired", async () => {
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
    txMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);
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
    txMock.complianceReportingFeeRule.findFirst.mockResolvedValue({
      id: "compliance_rule_sprinkler",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      feeAmount: 30
    });

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

  it("maps only supported inspection types into compliance reporting divisions", () => {
    expect(mapInspectionTypeToComplianceReportingDivision("fire_extinguisher")).toBe("fire_extinguishers");
    expect(mapInspectionTypeToComplianceReportingDivision("fire_alarm")).toBe("fire_alarm");
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
    txMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);
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
          subtotal: 0,
          notes: null,
          items: extractBillableItemsFromDraft({
            tenantId: "tenant_1",
            inspectionId: "inspection_1",
            reportId: "report_1",
            reportType: "kitchen_suppression",
            draft: buildKitchenDraft()
          })
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
    expect(summaries[0]?.metrics.materialItemCount).toBe(3);

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
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);

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
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue({
      id: "compliance_rule_1",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      feeAmount: 22.5
    });

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
      unitPrice: 45
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
    expect(prismaMock.billingItemCatalogMatch.upsert).toHaveBeenCalled();
    expect(prismaMock.quickBooksCatalogItemAlias.upsert).toHaveBeenCalled();
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
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValueOnce({
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

    const updateCall = prismaMock.$executeRaw.mock.calls.at(-1)?.[0];
    const executeRawText = String(updateCall);
    expect(executeRawText).toContain("\"unitPrice\":32.5");
    expect(executeRawText).toContain("\"amount\":65");
    expect(executeRawText).toContain("\"amount\":162.5");
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




