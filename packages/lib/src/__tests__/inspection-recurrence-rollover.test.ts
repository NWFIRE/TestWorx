import { InspectionStatus, RecurrenceFrequency } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    inspection: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn()
    },
    inspectionReport: {
      count: vi.fn(),
      create: vi.fn()
    },
    customerCompany: {
      findFirst: vi.fn()
    },
    site: {
      findFirst: vi.fn()
    },
    user: {
      findFirst: vi.fn()
    },
    inspectionTask: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn()
    },
    inspectionRecurrence: {
      create: vi.fn()
    },
    inspectionAmendment: {
      findFirst: vi.fn(),
      create: vi.fn()
    },
    inspectionTechnicianAssignment: {
      deleteMany: vi.fn(),
      createMany: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  };

  return {
    txMock: tx,
    prismaMock: {
      inspection: {
        findFirst: vi.fn()
      },
      inspectionReport: {
        count: vi.fn()
      },
      tenant: {
        findFirst: vi.fn()
      },
      $transaction: vi.fn(async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx))
    }
  };
});

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

import { createInspectionAmendment, nextDueFrom, updateInspectionStatus } from "../scheduling";

describe("inspection recurrence rollover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      stripeSubscriptionStatus: "active",
      subscriptionPlan: { code: "professional" }
    });
    txMock.inspectionReport.count.mockResolvedValue(2);
    txMock.customerCompany.findFirst.mockResolvedValue({ id: "customer_1" });
    txMock.site.findFirst.mockResolvedValue({ id: "site_1", customerCompanyId: "customer_1" });
    txMock.user.findFirst.mockResolvedValue({ id: "tech_1", role: "technician" });
    txMock.inspection.create.mockResolvedValue({ id: "replacement_1" });
    txMock.inspection.update.mockResolvedValue({ id: "inspection_1", status: InspectionStatus.completed });
    txMock.inspectionTask.create.mockResolvedValue({ id: "task_new" });
    txMock.inspectionTask.findMany.mockResolvedValue([]);
    txMock.inspectionTask.updateMany.mockResolvedValue({ count: 0 });
    txMock.inspectionRecurrence.create.mockResolvedValue({ id: "recurrence_new" });
    txMock.inspectionReport.create.mockResolvedValue({ id: "report_new" });
    txMock.inspectionAmendment.findFirst.mockResolvedValue(null);
    txMock.inspectionAmendment.create.mockResolvedValue({ id: "amendment_1" });
    txMock.inspectionTechnicianAssignment.deleteMany.mockResolvedValue({ count: 0 });
    txMock.inspectionTechnicianAssignment.createMany.mockResolvedValue({ count: 1 });
    txMock.auditLog.create.mockResolvedValue({ id: "audit_1" });
    txMock.inspection.findUniqueOrThrow.mockResolvedValue({ id: "replacement_1", status: "scheduled" });
  });

  it("preserves the original next due date when a started inspection is amended", async () => {
    const originalScheduledStart = new Date("2026-03-13T09:00:00.000Z");
    const preservedNextDueAt = new Date("2027-03-13T09:00:00.000Z");

    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      assignedTechnicianId: "tech_1",
      status: InspectionStatus.in_progress,
      scheduledStart: originalScheduledStart,
      scheduledEnd: new Date("2026-03-13T10:00:00.000Z"),
      notes: "Original visit",
      tasks: [{
        id: "task_1",
        inspectionType: "fire_alarm",
        recurrence: {
          id: "recurrence_1",
          frequency: RecurrenceFrequency.ANNUAL,
          seriesId: "series_1",
          anchorScheduledStart: originalScheduledStart,
          nextDueAt: preservedNextDueAt
        }
      }],
      site: { name: "Original Site" },
      customerCompany: { name: "Original Customer" },
      assignedTechnician: { id: "tech_1", name: "Taylor Tech" },
      technicianAssignments: [{ technicianId: "tech_1", technician: { id: "tech_1", name: "Taylor Tech" } }]
    });

    await createInspectionAmendment(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1",
      {
        customerCompanyId: "customer_1",
        siteId: "site_1",
        scheduledStart: new Date("2026-03-20T09:00:00.000Z"),
        scheduledEnd: new Date("2026-03-20T10:30:00.000Z"),
        assignedTechnicianIds: ["tech_1"],
        status: "scheduled",
        notes: "Return visit for remaining devices.",
        reason: "Customer requested a return visit after the initial inspection started.",
        tasks: [
          { inspectionType: "fire_alarm", frequency: RecurrenceFrequency.ANNUAL }
        ]
      }
    );

    expect(txMock.inspectionRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        seriesId: "series_1",
        anchorScheduledStart: originalScheduledStart,
        nextDueAt: preservedNextDueAt,
        frequency: RecurrenceFrequency.ANNUAL
      })
    });
  });

  it("creates the next recurring inspection from the stored next due date when completed", async () => {
    const originalScheduledStart = new Date("2026-03-13T09:00:00.000Z");
    const nextDueAt = new Date("2027-03-13T09:00:00.000Z");
    const followingDueAt = nextDueFrom(nextDueAt, RecurrenceFrequency.ANNUAL);

    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      assignedTechnicianId: "tech_1",
      createdByUserId: "office_1",
      status: InspectionStatus.in_progress,
      scheduledStart: originalScheduledStart,
      scheduledEnd: new Date("2026-03-13T10:00:00.000Z"),
      notes: "Annual visit",
      claimable: false,
      amendments: [],
      technicianAssignments: [{ technicianId: "tech_1" }],
      tasks: [{
        id: "task_1",
        inspectionType: "fire_alarm",
        recurrence: {
          id: "recurrence_1",
          frequency: RecurrenceFrequency.ANNUAL,
          seriesId: "series_1",
          anchorScheduledStart: originalScheduledStart,
          nextDueAt
        }
      }]
    });
    prismaMock.inspectionReport.count.mockResolvedValue(0);
    txMock.inspection.create.mockResolvedValue({ id: "inspection_2" });

    await updateInspectionStatus(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      "inspection_1",
      InspectionStatus.completed
    );

    expect(txMock.inspection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scheduledStart: nextDueAt,
        scheduledEnd: new Date("2027-03-13T10:00:00.000Z"),
        status: InspectionStatus.to_be_completed
      })
    });
    expect(txMock.inspectionRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        seriesId: "series_1",
        anchorScheduledStart: originalScheduledStart,
        nextDueAt: followingDueAt
      })
    });
  });
});
