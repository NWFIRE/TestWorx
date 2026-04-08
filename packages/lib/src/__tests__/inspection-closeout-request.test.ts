import { InspectionClassification, InspectionCloseoutRequestStatus, InspectionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    inspection: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    inspectionCloseoutRequest: {
      upsert: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn()
    },
    inspectionTask: {
      create: vi.fn()
    },
    inspectionRecurrence: {
      create: vi.fn()
    },
    inspectionReport: {
      create: vi.fn()
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
      $transaction: vi.fn(async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx))
    }
  };
});

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

import {
  approveInspectionCloseoutRequest,
  completeInspectionWithCloseoutRequest,
  dismissInspectionCloseoutRequest
} from "../scheduling";

describe("inspection closeout requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.inspectionReport.count.mockResolvedValue(0);
    prismaMock.inspection.findFirst.mockResolvedValue(null);
    txMock.inspection.update.mockResolvedValue({ id: "inspection_1", status: InspectionStatus.completed });
    txMock.inspection.findFirst.mockResolvedValue(null);
    txMock.inspectionCloseoutRequest.upsert.mockResolvedValue({ id: "closeout_1" });
    txMock.auditLog.create.mockResolvedValue({ id: "audit_1" });
    txMock.inspection.create.mockResolvedValue({ id: "inspection_2", scheduledStart: new Date("2026-04-09T09:00:00.000Z") });
    txMock.inspectionTask.create.mockResolvedValue({ id: "task_2" });
    txMock.inspectionRecurrence.create.mockResolvedValue({ id: "recurrence_2" });
    txMock.inspectionReport.create.mockResolvedValue({ id: "report_2" });
    txMock.inspectionCloseoutRequest.update.mockResolvedValue({ id: "closeout_1", status: InspectionCloseoutRequestStatus.approved });
    txMock.inspectionCloseoutRequest.findFirst.mockResolvedValue({
      id: "closeout_1",
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      requestedByUserId: "tech_1",
      requestType: "follow_up_inspection",
      note: "Need a return visit for the remaining devices.",
      status: InspectionCloseoutRequestStatus.pending
    });
  });

  it("completes an inspection and records a pending follow-up request", async () => {
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      assignedTechnicianId: "tech_1",
      createdByUserId: "office_1",
      status: InspectionStatus.in_progress,
      scheduledStart: new Date("2026-04-08T09:00:00.000Z"),
      scheduledEnd: new Date("2026-04-08T10:00:00.000Z"),
      notes: "Visit in progress",
      claimable: false,
      technicianAssignments: [{ technicianId: "tech_1" }],
      tasks: []
    });

    await completeInspectionWithCloseoutRequest(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      "inspection_1",
      {
        requestType: "follow_up_inspection",
        note: "Need a return visit for the remaining devices."
      }
    );

    expect(txMock.inspection.update).toHaveBeenCalledWith({
      where: { id: "inspection_1" },
      data: expect.objectContaining({
        status: InspectionStatus.completed
      })
    });
    expect(txMock.inspectionCloseoutRequest.upsert).toHaveBeenCalledWith({
      where: { inspectionId: "inspection_1" },
      update: expect.objectContaining({
        requestType: "follow_up_inspection",
        note: "Need a return visit for the remaining devices.",
        status: InspectionCloseoutRequestStatus.pending
      }),
      create: expect.objectContaining({
        inspectionId: "inspection_1",
        requestType: "follow_up_inspection"
      }),
      include: expect.any(Object)
    });
  });

  it("approves a pending request and creates a new follow-up inspection", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      assignedTechnicianId: "tech_1",
      createdByUserId: "office_1",
      status: InspectionStatus.completed,
      scheduledStart: new Date("2026-04-08T09:00:00.000Z"),
      scheduledEnd: new Date("2026-04-08T10:00:00.000Z"),
      notes: "Completed visit",
      claimable: false,
      tasks: [
        {
          inspectionType: "fire_alarm",
          recurrence: { frequency: "ANNUAL" },
          dueMonth: "2026-04",
          dueDate: new Date("2026-04-08T00:00:00.000Z"),
          notes: null
        }
      ],
      closeoutRequest: {
        id: "closeout_1",
        requestType: "follow_up_inspection",
        note: "Need a return visit for the remaining devices.",
        status: InspectionCloseoutRequestStatus.pending
      }
    });

    await approveInspectionCloseoutRequest(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(txMock.inspection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerCompanyId: "customer_1",
        siteId: "site_1",
        inspectionClassification: InspectionClassification.follow_up,
        status: InspectionStatus.to_be_completed,
        notes: "Need a return visit for the remaining devices."
      })
    });
    expect(txMock.inspectionCloseoutRequest.update).toHaveBeenCalledWith({
      where: { inspectionId: "inspection_1" },
      data: expect.objectContaining({
        status: InspectionCloseoutRequestStatus.approved,
        createdInspectionId: "inspection_2"
      })
    });
  });

  it("dismisses a pending request without creating a new inspection", async () => {
    await dismissInspectionCloseoutRequest(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(txMock.inspectionCloseoutRequest.update).toHaveBeenCalledWith({
      where: { id: "closeout_1" },
      data: expect.objectContaining({
        status: InspectionCloseoutRequestStatus.dismissed,
        dismissedByUserId: "office_1"
      })
    });
    expect(txMock.inspection.create).not.toHaveBeenCalled();
  });
});
