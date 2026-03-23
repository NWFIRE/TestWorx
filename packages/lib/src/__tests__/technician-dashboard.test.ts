import { InspectionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    inspection: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

import { getTechnicianDashboardData } from "../scheduling";

describe("technician dashboard inspection access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes completed inspections from technician dashboard results", async () => {
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([
        {
          id: "inspection_1",
          tenantId: "tenant_1",
          status: InspectionStatus.scheduled,
          scheduledStart: new Date("2026-03-17T09:00:00.000Z"),
          site: { id: "site_1", name: "Pinecrest Tower" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          assignedTechnician: { id: "tech_1", name: "Alex Turner" },
          technicianAssignments: [],
          tasks: []
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_1", role: "technician", tenantId: "tenant_1" });

    expect(prismaMock.inspection.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        tenantId: "tenant_1",
        status: { not: InspectionStatus.completed }
      })
    }));
    expect(result.assigned).toHaveLength(1);
    expect(result.assigned[0]?.id).toBe("inspection_1");
  });
});
