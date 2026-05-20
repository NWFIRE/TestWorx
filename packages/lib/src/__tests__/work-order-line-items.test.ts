import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    inspection: {
      findFirst: vi.fn()
    },
    quickBooksCatalogItem: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

import { getWorkOrderCatalogItems } from "../work-order-line-items";

describe("work order catalog selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
