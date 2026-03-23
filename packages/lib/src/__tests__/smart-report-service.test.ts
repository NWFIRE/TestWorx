import { InspectionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    inspectionReport: {
      findFirst: vi.fn()
    },
    asset: {
      count: vi.fn(),
      findMany: vi.fn()
    }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

import { getInspectionReportDraft } from "../report-service";

describe("smart report service tenant scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps asset and prior-report prefills tenant scoped", async () => {
    prismaMock.inspectionReport.findFirst
      .mockResolvedValueOnce({
        id: "report_1",
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        inspectionTaskId: "task_1",
        status: "draft",
        updatedAt: new Date("2026-03-12T10:00:00.000Z"),
        finalizedAt: null,
        contentJson: null,
        inspection: {
          id: "inspection_1",
          tenantId: "tenant_1",
          status: InspectionStatus.scheduled,
          siteId: "site_1",
          customerCompanyId: "customer_1",
          assignedTechnicianId: "tech_1",
          scheduledStart: new Date("2026-03-12T09:00:00.000Z"),
          tasks: [{ id: "task_1", inspectionType: "fire_extinguisher" }],
          technicianAssignments: [],
          site: { id: "site_1", name: "Pinecrest Tower", addressLine1: "100 State St", addressLine2: null, city: "Chicago", state: "IL", postalCode: "60601" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          tenant: { id: "tenant_1", name: "Evergreen Fire Protection" }
        },
        task: { id: "task_1", inspectionType: "fire_extinguisher" },
        technician: { id: "tech_1", name: "Alex Turner" },
        attachments: [],
        signatures: [],
        deficiencies: []
      })
      .mockResolvedValueOnce(null);
    prismaMock.asset.count.mockResolvedValue(1);
    prismaMock.asset.findMany.mockResolvedValue([
      {
        id: "asset_1",
        name: "Lobby extinguisher bank",
        assetTag: "EXT-100",
        metadata: { location: "Lobby by east stair", manufacturer: "amerex", ulRating: "2a_10bc" }
      }
    ]);

    await getInspectionReportDraft({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, "inspection_1", "task_1");

    expect(prismaMock.inspectionReport.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        inspectionId: "inspection_1",
        inspectionTaskId: "task_1",
        tenantId: "tenant_1"
      })
    }));
    expect(prismaMock.inspectionReport.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        tenantId: "tenant_1"
      })
    }));
    expect(prismaMock.asset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: "tenant_1",
        siteId: "site_1"
      })
    }));
  });

  it("blocks technicians from opening reports on completed inspections", async () => {
    prismaMock.inspectionReport.findFirst.mockResolvedValueOnce({
      id: "report_1",
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      inspectionTaskId: "task_1",
      status: "draft",
      updatedAt: new Date("2026-03-12T10:00:00.000Z"),
      finalizedAt: null,
      contentJson: null,
      inspection: {
        id: "inspection_1",
        tenantId: "tenant_1",
        status: InspectionStatus.completed,
        siteId: "site_1",
        customerCompanyId: "customer_1",
        assignedTechnicianId: "tech_1",
        scheduledStart: new Date("2026-03-12T09:00:00.000Z"),
        tasks: [{ id: "task_1", inspectionType: "fire_extinguisher" }],
        site: { id: "site_1", name: "Pinecrest Tower", addressLine1: "100 State St", addressLine2: null, city: "Chicago", state: "IL", postalCode: "60601" },
        customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
        tenant: { id: "tenant_1", name: "Evergreen Fire Protection" },
        technicianAssignments: []
      },
      task: { id: "task_1", inspectionType: "fire_extinguisher" },
      technician: { id: "tech_1", name: "Alex Turner" },
      attachments: [],
      signatures: [],
      deficiencies: []
    });

    await expect(
      getInspectionReportDraft({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, "inspection_1", "task_1")
    ).rejects.toThrow(/completed inspections are no longer available/i);
  });
});
