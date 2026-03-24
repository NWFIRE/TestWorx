import { reportStatuses } from "@testworx/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => ({
  prismaMock: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    inspection: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    serviceFeeRule: { findMany: vi.fn() }
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
  extractBillableItemsFromDraft,
  extractBillableItemsFromFinalizedReport,
  getAdminBillingSummaryDetail,
  getAdminBillingSummaries,
  groupBillableItems,
  mergeBillingItems,
  syncInspectionBillingSummaryTx
} from "../inspection-billing";
import { buildInitialReportDraft } from "../report-engine";
import { resolveInspectionServiceFeeTx } from "../service-fees";

function buildKitchenDraft() {
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
  draft.sections["system-details"]!.fields.manufacturer = "Ansul";
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
      ["service", "Kitchen Suppression System Inspection", 1, "KS-INSPECTION-GROUP-A"],
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
      ["Kitchen Suppression System Inspection", "KS-INSPECTION-GROUP-A", 1]
    ]);
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
    expect(grouped.service).toHaveLength(0);
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
});

describe("inspection billing persistence and admin review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw.mockReset();
    prismaMock.$executeRaw.mockReset();
    txMock.$queryRaw.mockReset();
    txMock.$executeRaw.mockReset();
    txMock.inspection.findFirst.mockReset();
    txMock.tenant.findUnique.mockReset();
    txMock.serviceFeeRule.findMany.mockReset();
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
    expect(summary?.items).toHaveLength(4);
    expect(summary?.items.find((item) => item.description === "Service Fee")?.unitPrice).toBe(95);
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
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
});




