import { reportStatuses } from "@testworx/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => ({
  prismaMock: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    inspection: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    serviceFeeRule: { findMany: vi.fn() },
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
    tenant: { findUnique: vi.fn() },
    serviceFeeRule: { findMany: vi.fn() }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
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
  mergeBillingItems,
  searchBillingSummaryItemCatalogMatches,
  syncInspectionBillingSummaryTx,
  updateBillingSummaryItem,
  updateBillingSummaryItemGroup,
  updateBillingSummaryNotes
} from "../inspection-billing";
import { buildInitialReportDraft } from "../report-engine";
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
    txMock.tenant.findUnique.mockReset();
    txMock.serviceFeeRule.findMany.mockReset();
    prismaMock.billingItemCatalogMatch.findUnique.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findFirst.mockResolvedValue(null);
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([]);
    prismaMock.quickBooksCatalogItemAlias.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock as never));
    prismaMock.inspectionBillingSummary.update.mockResolvedValue(undefined);
    prismaMock.auditLog.create.mockResolvedValue(undefined);
    prismaMock.quickBooksCatalogItemAlias.upsert.mockResolvedValue(undefined);
    prismaMock.billingItemCatalogMatch.upsert.mockResolvedValue(undefined);
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
      ["service", "Kitchen Suppression System Inspection", 1, "KS-INSPECTION-STANDARD"],
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
      ["Kitchen Suppression System Inspection", "KS-INSPECTION-STANDARD", 1]
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

    expect(items[0]?.code).toBe("KS-INSPECTION-LOW-RATE");
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

    expect(items[0]?.code).toBe("KS-INSPECTION-LOW-RATE");
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

    expect(items[0]?.code).toBe("KS-INSPECTION-HIGH-RATE");
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
    txMock.tenant.findUnique.mockReset();
    txMock.serviceFeeRule.findMany.mockReset();
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
    expect(summary?.items).toHaveLength(5);
    expect(summary?.items.find((item) => item.description === "Service Fee")?.unitPrice).toBe(95);
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
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
    prismaMock.$queryRaw.mockResolvedValueOnce([
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

  it("fills missing unit price from the linked catalog item without overwriting existing manual pricing", async () => {
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
        unitPrice: 125,
        amount: 125,
        linkedCatalogItemId: "catalog_2"
      })
    );
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
});




