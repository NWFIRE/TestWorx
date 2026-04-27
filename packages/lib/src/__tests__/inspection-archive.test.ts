import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  inspection: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn()
  },
  customerCompany: {
    findMany: vi.fn()
  },
  site: {
    findMany: vi.fn()
  },
  user: {
    findMany: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

describe("inspection archive", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns archived inspections with snapshot-friendly labels and pagination", async () => {
    prismaMock.inspection.findMany.mockResolvedValue([
      {
        id: "inspection_12345678",
        status: "completed",
        completedAt: new Date("2026-04-01T15:00:00.000Z"),
        archivedAt: new Date("2026-04-01T15:00:00.000Z"),
        updatedAt: new Date("2026-04-01T15:00:00.000Z"),
        archiveCustomerName: "Summit Tower",
        archiveSiteName: "Main Campus",
        archiveSiteAddress: "123 Main St, Denver CO 80202",
        archiveSiteCity: "Denver",
        archiveTechnicianName: "Taylor Tech",
        archiveInspectionTypes: ["kitchen_suppression"],
        archiveDivisions: ["kitchen_suppression"],
        archiveResultStatus: "Deficiencies found",
        archiveHasDeficiencies: true,
        archiveDeficiencyCount: 2,
        archiveHasReport: true,
        customerCompany: { id: "customer_1", name: "Summit Tower" },
        site: { id: "site_1", name: "Main Campus", city: "Denver", addressLine1: "123 Main St", state: "CO" },
        assignedTechnician: { id: "tech_1", name: "Taylor Tech" },
        technicianAssignments: [],
        tasks: [{ id: "task_1", inspectionType: "kitchen_suppression" }],
        reports: [{ id: "report_1", status: "finalized", finalizedAt: new Date("2026-04-01T14:30:00.000Z") }],
        convertedFromQuotes: [{ id: "quote_1", quoteNumber: "Q-2026-0012" }]
      }
    ]);
    prismaMock.inspection.count.mockResolvedValue(1);
    prismaMock.customerCompany.findMany.mockResolvedValue([{ id: "customer_1", name: "Summit Tower" }]);
    prismaMock.site.findMany.mockResolvedValue([{ id: "site_1", name: "Main Campus", city: "Denver" }]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "tech_1", name: "Taylor Tech" }]);

    const { getAdminInspectionArchiveData } = await import("../inspection-archive");
    const result = await getAdminInspectionArchiveData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { query: "summit", page: 1 }
    );

    expect(result.pagination.totalCount).toBe(1);
    expect(result.inspections[0]?.inspectionNumber).toBe("12345678");
    expect(result.inspections[0]?.customerName).toBe("Summit Tower");
    expect(result.inspections[0]?.inspectionTypeLabels).toEqual(["Kitchen suppression"]);
    expect(result.inspections[0]?.divisions).toEqual(["kitchen_suppression"]);
    expect(prismaMock.inspection.findMany).toHaveBeenCalled();
  });

  it("uses a distinct archive badge tone for invoiced results", async () => {
    const { getArchiveResultStatusTone } = await import("../inspection-archive");

    expect(getArchiveResultStatusTone({ resultStatus: "Completed", hasDeficiencies: false })).toBe("emerald");
    expect(getArchiveResultStatusTone({ resultStatus: "Invoiced", hasDeficiencies: false })).toBe("violet");
    expect(getArchiveResultStatusTone({ resultStatus: "Deficiencies found", hasDeficiencies: true })).toBe("amber");
  });

  it("stores archive snapshot data when an inspection is archived", async () => {
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      status: "completed",
      completedAt: null,
      archivedAt: null,
      customerCompany: { name: "Harbor View" },
      site: {
        name: "North Campus",
        addressLine1: "456 Oak Ave",
        addressLine2: null,
        city: "Tulsa",
        state: "OK",
        postalCode: "74103"
      },
      assignedTechnician: { name: "Alex Tech" },
      technicianAssignments: [],
      tasks: [{ inspectionType: "fire_alarm" }, { inspectionType: "wet_fire_sprinkler" }],
      reports: [{ id: "report_1" }],
      deficiencies: [{ id: "def_1" }]
    });

    const txMock = {
      inspection: {
        findFirst: prismaMock.inspection.findFirst,
        update: prismaMock.inspection.update
      }
    };

    const { syncInspectionArchiveStateTx } = await import("../inspection-archive");
    await syncInspectionArchiveStateTx(txMock as never, {
      tenantId: "tenant_1",
      inspectionId: "inspection_1"
    });

    expect(prismaMock.inspection.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "inspection_1" },
      data: expect.objectContaining({
        archiveCustomerName: "Harbor View",
        archiveSiteName: "North Campus",
        archiveSiteCity: "Tulsa",
        archiveHasDeficiencies: true,
        archiveDeficiencyCount: 1,
        archiveHasReport: true
      })
    }));
  });
});
