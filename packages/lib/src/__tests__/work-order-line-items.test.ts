import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $queryRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
    inspection: {
      findFirst: vi.fn()
    },
    quickBooksCatalogItem: {
      findMany: vi.fn()
    },
    workOrderLaborType: {
      upsert: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn()
    }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

import { getWorkOrderCatalogItems, getWorkOrderLaborTypes } from "../work-order-line-items";

describe("work order catalog selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ exists: true }]);
    prismaMock.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations));
    prismaMock.workOrderLaborType.upsert.mockImplementation(async (input: { create: unknown }) => input.create);
    prismaMock.workOrderLaborType.count.mockResolvedValue(9);
    prismaMock.workOrderLaborType.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      assignedTechnicianId: "tech_1",
      technicianAssignments: [],
      tasks: [{ inspectionType: "work_order" }]
    });
  });

  it("exposes the full active synced products and services catalog to technicians", async () => {
    prismaMock.quickBooksCatalogItem.findMany.mockResolvedValue([
      {
        id: "catalog_service_annual",
        quickbooksItemId: "qb_service_annual",
        name: "Fire extinguisher annual inspection",
        sku: "FE-ANNUAL",
        itemType: "Service",
        rawJson: { Description: "Annual portable extinguisher inspection" },
        unitPrice: 7.7,
        taxable: false
      },
      {
        id: "catalog_monthly_tags",
        quickbooksItemId: "qb_monthly_tags",
        name: "Monthly inspection tags",
        sku: "TAG-MONTHLY",
        itemType: "NonInventory",
        rawJson: { SalesDesc: "Monthly inspection tags" },
        unitPrice: 1.25,
        taxable: true
      },
      {
        id: "catalog_fee",
        quickbooksItemId: "qb_fee",
        name: "Compliance upload fee",
        sku: "COMPLIANCE",
        itemType: "Service",
        rawJson: {},
        unitPrice: 15,
        taxable: false
      }
    ]);

    const items = await getWorkOrderCatalogItems(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(prismaMock.quickBooksCatalogItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: "tenant_1",
        active: true
      }
    }));
    expect(items).toEqual([
      expect.objectContaining({
        id: "catalog_service_annual",
        name: "Fire extinguisher annual inspection",
        itemType: "Service",
        description: "Annual portable extinguisher inspection",
        unitPrice: 7.7,
        taxable: false,
        quickbooksItemId: "qb_service_annual"
      }),
      expect.objectContaining({
        id: "catalog_monthly_tags",
        name: "Monthly inspection tags",
        itemType: "NonInventory",
        description: "Monthly inspection tags",
        unitPrice: 1.25,
        taxable: true,
        quickbooksItemId: "qb_monthly_tags"
      }),
      expect.objectContaining({
        id: "catalog_fee",
        name: "Compliance upload fee",
        itemType: "Service",
        unitPrice: 15,
        taxable: false,
        quickbooksItemId: "qb_fee"
      })
    ]);
  });

  it("reactivates default labor types when a tenant has no active labor options", async () => {
    prismaMock.workOrderLaborType.count.mockResolvedValue(0);
    prismaMock.workOrderLaborType.findMany.mockResolvedValue([
      {
        id: "labor_general",
        name: "General Service",
        code: "general_service",
        description: null,
        rate: 0,
        taxable: false,
        active: true,
        quickBooksItemId: null,
        catalogItemId: null,
        sortOrder: 80,
        catalogItem: null
      }
    ]);

    const laborTypes = await getWorkOrderLaborTypes(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(prismaMock.workOrderLaborType.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant_1",
        code: {
          in: [
            "fire_alarm",
            "kitchen_suppression",
            "fire_sprinkler",
            "fire_extinguishers",
            "emergency_light",
            "industrial_dry_chemical",
            "backflow",
            "general_service",
            "other"
          ]
        }
      },
      data: {
        active: true
      }
    });
    expect(laborTypes).toEqual([
      expect.objectContaining({
        id: "labor_general",
        name: "General Service",
        active: true
      })
    ]);
  });
});
