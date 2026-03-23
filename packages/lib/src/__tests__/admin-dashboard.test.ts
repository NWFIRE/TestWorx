import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  customerCompany: {
    findMany: vi.fn()
  },
  site: {
    findMany: vi.fn(),
    count: vi.fn()
  },
  user: {
    findMany: vi.fn()
  },
  inspection: {
    findMany: vi.fn(),
    count: vi.fn()
  },
  inspectionReport: {
    groupBy: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

describe("admin dashboard data", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns completed archive data while keeping active scheduling counts available", async () => {
    prismaMock.customerCompany.findMany.mockResolvedValue([{ id: "customer_1", name: "Pinecrest" }]);
    prismaMock.site.findMany.mockResolvedValue([{ id: "site_1", name: "Tower", city: "Chicago", customerCompanyId: "customer_1" }]);
    prismaMock.user.findMany.mockResolvedValue([{ id: "tech_1", name: "Taylor Tech" }]);
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([
        {
          id: "inspection_1",
          status: "scheduled",
          scheduledStart: new Date("2026-03-20T09:00:00.000Z"),
          site: { name: "Tower" },
          customerCompany: { name: "Pinecrest" },
          assignedTechnician: null,
          technicianAssignments: [],
          tasks: [],
          amendments: [],
          replacementAmendments: []
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "inspection_2",
          status: "completed",
          scheduledStart: new Date("2026-03-18T09:00:00.000Z"),
          site: { name: "Annex" },
          customerCompany: { name: "Pinecrest" },
          billingSummary: { status: "invoiced" },
          assignedTechnician: null,
          technicianAssignments: [],
          tasks: [],
          amendments: [],
          replacementAmendments: []
        }
      ]);
    prismaMock.site.count.mockResolvedValue(8);
    prismaMock.inspection.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(24)
      .mockResolvedValueOnce(11);
    prismaMock.inspectionReport.groupBy.mockResolvedValue([]);

    const { getAdminDashboardData } = await import("../scheduling");
    const result = await getAdminDashboardData({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" });

    expect(result.summary.unassignedInspections).toBe(3);
    expect(result.summary.upcomingInspections).toBe(24);
    expect(result.summary.completedInspections).toBe(11);
    expect(result.sites[0]).toEqual({ id: "site_1", name: "Tower", city: "Chicago", customerCompanyId: "customer_1" });
    expect(result.activeInspections).toHaveLength(1);
    expect(result.completedInspections).toHaveLength(1);
    expect(result.completedInspections[0]?.status).toBe("completed");
    expect(result.completedInspections[0]?.billingStatus).toBe("invoiced");
  }, 15000);
});
