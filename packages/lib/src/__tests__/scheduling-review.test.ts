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
  }, 10000);

  it("excludes completed finalized inspections that are already invoiced from the action queue", async () => {
    prismaMock.inspection.findMany.mockResolvedValue([
      {
        id: "inspection_invoiced",
        status: "completed",
        scheduledStart: new Date("2026-04-01T14:00:00.000Z"),
        completedAt: new Date("2026-04-01T16:00:00.000Z"),
        site: { name: "General / No Fixed Site" },
        customerCompany: { name: "Anderson Burris Funeral Home" },
        assignedTechnician: { name: "Eli Rodriguez" },
        technicianAssignments: [],
        billingSummary: {
          status: "invoiced",
          quickbooksSyncStatus: "synced",
          quickbooksInvoiceId: "qb_invoice_1",
          quickbooksInvoiceNumber: "1001"
        },
        tasks: [
          {
            id: "task_1",
            inspectionType: "fire_alarm",
            customDisplayLabel: null,
            recurrence: null,
            report: {
              id: "report_1",
              status: reportStatuses.finalized,
              finalizedAt: new Date("2026-04-01T15:30:00.000Z")
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

    expect(result.counts.readyToBill).toBe(0);
    expect(result.counts.awaitingReview).toBe(0);
    expect(result.inspections).toEqual([]);
  });

  it("filters ready-to-bill inspections by customer search query", async () => {
    prismaMock.inspection.findMany.mockResolvedValue([
      {
        id: "inspection_axis",
        status: "completed",
        scheduledStart: new Date("2026-04-01T14:00:00.000Z"),
        completedAt: new Date("2026-04-01T16:00:00.000Z"),
        site: { name: "Axis Energy Yard", addressLine1: "100 Main", city: "Enid", state: "OK", postalCode: "73701" },
        customerCompany: { name: "Axis Energy" },
        assignedTechnician: { name: "Eli Rodriguez" },
        technicianAssignments: [],
        billingSummary: { status: "draft", quickbooksSyncStatus: "not_synced", quickbooksInvoiceId: null, quickbooksInvoiceNumber: null },
        tasks: [
          {
            id: "task_axis",
            inspectionType: "fire_alarm",
            customDisplayLabel: null,
            recurrence: null,
            report: {
              id: "report_axis",
              status: reportStatuses.finalized,
              finalizedAt: new Date("2026-04-01T15:30:00.000Z")
            }
          }
        ]
      },
      {
        id: "inspection_other",
        status: "completed",
        scheduledStart: new Date("2026-04-02T14:00:00.000Z"),
        completedAt: new Date("2026-04-02T16:00:00.000Z"),
        site: { name: "Other Site", addressLine1: "200 Main", city: "Tulsa", state: "OK", postalCode: "74101" },
        customerCompany: { name: "Other Customer" },
        assignedTechnician: { name: "Shawn O'Brien" },
        technicianAssignments: [],
        billingSummary: { status: "draft", quickbooksSyncStatus: "not_synced", quickbooksInvoiceId: null, quickbooksInvoiceNumber: null },
        tasks: [
          {
            id: "task_other",
            inspectionType: "kitchen_suppression",
            customDisplayLabel: null,
            recurrence: null,
            report: {
              id: "report_other",
              status: reportStatuses.finalized,
              finalizedAt: new Date("2026-04-02T15:30:00.000Z")
            }
          }
        ]
      }
    ]);

    const { getAdminReportReviewQueueData } = await import("../scheduling");
    const result = await getAdminReportReviewQueueData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { month: "2026-04", query: "axis" }
    );

    expect(prismaMock.inspection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.any(Array)
        }),
        take: 100
      })
    );
    expect(result.filters.query).toBe("axis");
    expect(result.counts.readyToBill).toBe(1);
    expect(result.inspections).toHaveLength(1);
    expect(result.inspections[0]?.id).toBe("inspection_axis");
  });
});
