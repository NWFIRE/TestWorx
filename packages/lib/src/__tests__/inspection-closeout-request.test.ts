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
  dismissInspectionCloseoutRequest,
  submitTechnicianInspectionFieldUpdate
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
    const inspectionRecord = {
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
      tasks: [],
      customerCompany: { name: "Customer" },
      site: { name: "Site", addressLine1: "1 Main", addressLine2: null, city: "Enid", state: "OK", postalCode: "73701" },
      assignedTechnician: { name: "Tech" },
      reports: [],
      deficiencies: [],
      completedAt: null,
      archivedAt: null
    };
    prismaMock.inspection.findFirst.mockResolvedValue(inspectionRecord);
    txMock.inspection.findFirst.mockResolvedValue(inspectionRecord);

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

  it("lets a technician flag customer refusal without completing reports", async () => {
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      assignedTechnicianId: "tech_1",
      createdByUserId: "office_1",
      status: InspectionStatus.to_be_completed,
      scheduledStart: new Date("2026-04-08T09:00:00.000Z"),
      scheduledEnd: new Date("2026-04-08T10:00:00.000Z"),
      notes: "Scheduled visit",
      claimable: false,
      technicianAssignments: [{ technicianId: "tech_1" }]
    });

    await submitTechnicianInspectionFieldUpdate(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      "inspection_1",
      {
        requestType: "customer_refused",
        note: "Customer refused service after we arrived."
      }
    );

    expect(txMock.inspectionCloseoutRequest.upsert).toHaveBeenCalledWith({
      where: { inspectionId: "inspection_1" },
      update: expect.objectContaining({
        requestType: "customer_refused",
        note: "Customer refused service after we arrived.",
        requestedDueMonth: null,
        status: InspectionCloseoutRequestStatus.pending
      }),
      create: expect.objectContaining({
        inspectionId: "inspection_1",
        requestType: "customer_refused",
        requestedDueMonth: null
      }),
      include: expect.any(Object)
    });
    expect(txMock.inspection.update).toHaveBeenCalledWith({
      where: { id: "inspection_1" },
      data: { status: InspectionStatus.follow_up_required }
    });
  });

  it("records the technician-requested due month for office review", async () => {
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
      notes: "Scheduled visit",
      claimable: false,
      technicianAssignments: [{ technicianId: "tech_1" }]
    });

    await submitTechnicianInspectionFieldUpdate(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      "inspection_1",
      {
        requestType: "wrong_due_month",
        requestedDueMonth: "2026-07",
        note: "Customer said their annual due month moved to July."
      }
    );

    expect(txMock.inspectionCloseoutRequest.upsert).toHaveBeenCalledWith({
      where: { inspectionId: "inspection_1" },
      update: expect.objectContaining({
        requestType: "wrong_due_month",
        requestedDueMonth: "2026-07",
        status: InspectionCloseoutRequestStatus.pending
      }),
      create: expect.objectContaining({
        inspectionId: "inspection_1",
        requestType: "wrong_due_month",
        requestedDueMonth: "2026-07"
      }),
      include: expect.any(Object)
    });
    expect(txMock.inspection.update).toHaveBeenCalledWith({
      where: { id: "inspection_1" },
      data: { status: InspectionStatus.follow_up_required }
    });
  });

  it("approves a field update without creating a new inspection", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      assignedTechnicianId: "tech_1",
      createdByUserId: "office_1",
      status: InspectionStatus.follow_up_required,
      scheduledStart: new Date("2026-04-08T09:00:00.000Z"),
      scheduledEnd: new Date("2026-04-08T10:00:00.000Z"),
      notes: "Needs office review",
      claimable: false,
      tasks: [],
      closeoutRequest: {
        id: "closeout_1",
        requestType: "wrong_due_month",
        note: "Technician reported this inspection belongs in 2026-07.",
        requestedDueMonth: "2026-07",
        status: InspectionCloseoutRequestStatus.pending
      }
    });

    await approveInspectionCloseoutRequest(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(txMock.inspection.create).not.toHaveBeenCalled();
    expect(txMock.inspectionCloseoutRequest.update).toHaveBeenCalledWith({
      where: { inspectionId: "inspection_1" },
      data: expect.objectContaining({
        status: InspectionCloseoutRequestStatus.approved,
        approvedByUserId: "office_1"
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
