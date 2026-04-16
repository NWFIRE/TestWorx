import { beforeEach, describe, expect, it, vi } from "vitest";

import { reportStatuses } from "@testworx/types";

const prismaMock = {
  inspection: {
    findMany: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

describe("report review queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("includes completed inspections that are missing completedAt when finalized reports fall inside the selected month", async () => {
    const finalizedAt = new Date("2026-04-15T15:45:00.000Z");
    prismaMock.inspection.findMany.mockResolvedValue([
      {
        id: "inspection_1",
        status: "completed",
        scheduledStart: new Date("2026-04-01T14:00:00.000Z"),
        completedAt: null,
        site: { name: "General / No Fixed Site" },
        customerCompany: { name: "Commercial Fire LLC" },
        assignedTechnician: { name: "Eli Rodriguez" },
        technicianAssignments: [],
        billingSummary: { status: "draft" },
        tasks: [
          {
            id: "task_1",
            inspectionType: "kitchen_suppression",
            customDisplayLabel: null,
            recurrence: null,
            report: {
              id: "report_1",
              status: reportStatuses.finalized,
              finalizedAt
            }
          }
        ]
      }
    ]);

    const { getAdminReportReviewQueueData } = await import("../scheduling");
    const result = await getAdminReportReviewQueueData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { month: "2026-04" }
    );

    expect(prismaMock.inspection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant_1",
          status: "completed",
          OR: expect.any(Array)
        })
      })
    );
    expect(result.counts.awaitingReview).toBe(1);
    expect(result.counts.completed).toBe(1);
    expect(result.inspections[0]?.completedAt).toEqual(finalizedAt);
    expect(result.inspections[0]?.customerLabel).toBe("Commercial Fire LLC");
  });
});
