import { InspectionStatus, RecurrenceFrequency } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    inspection: {
      findFirst: vi.fn()
    },
    inspectionTask: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    inspectionRecurrence: {
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn()
    },
    inspectionReport: {
      create: vi.fn(),
      count: vi.fn(),
      delete: vi.fn()
    },
    reportCorrectionEvent: {
      deleteMany: vi.fn()
    },
    attachment: {
      deleteMany: vi.fn()
    },
    signature: {
      deleteMany: vi.fn()
    },
    deficiency: {
      deleteMany: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  };

  return {
    txMock: tx,
    prismaMock: {
      $transaction: vi.fn(async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx))
    }
  };
});

vi.mock("@testworx/db", async () => {
  const actual = await vi.importActual<typeof import("@testworx/db")>("@testworx/db");
  return {
    ...actual,
    prisma: prismaMock
  };
});

import { addInspectionTask, removeInspectionTask } from "../scheduling";

describe("inspection task addition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMock.inspectionTask.create.mockResolvedValue({ id: "task_new" });
    txMock.inspectionRecurrence.create.mockResolvedValue({ id: "recurrence_new" });
    txMock.inspectionReport.create.mockResolvedValue({ id: "report_new" });
    txMock.inspectionTask.delete.mockResolvedValue({ id: "task_new" });
    txMock.inspectionTask.findMany.mockResolvedValue([]);
    txMock.inspectionTask.update.mockResolvedValue({ id: "task_existing" });
    txMock.inspectionRecurrence.deleteMany.mockResolvedValue({ count: 1 });
    txMock.inspectionReport.count.mockResolvedValue(0);
    txMock.inspectionReport.delete.mockResolvedValue({ id: "report_existing" });
    txMock.reportCorrectionEvent.deleteMany.mockResolvedValue({ count: 0 });
    txMock.attachment.deleteMany.mockResolvedValue({ count: 0 });
    txMock.signature.deleteMany.mockResolvedValue({ count: 0 });
    txMock.deficiency.deleteMany.mockResolvedValue({ count: 0 });
    txMock.auditLog.create.mockResolvedValue({ id: "audit_1" });
  });

  it("allows an assigned technician to add another report type to an active inspection", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      assignedTechnicianId: "tech_1",
      technicianAssignments: [{ technicianId: "tech_1" }],
      tasks: [
        { sortOrder: 0 },
        { sortOrder: 1 }
      ],
      scheduledStart: new Date("2026-03-18T09:00:00.000Z"),
      status: InspectionStatus.in_progress
    });

    const createdTask = await addInspectionTask(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionType: "fire_alarm" }
    );

    expect(txMock.inspectionTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        inspectionType: "fire_alarm",
        status: InspectionStatus.in_progress,
        addedByUserId: "tech_1",
        sortOrder: 2
      })
    });
    expect(txMock.inspectionRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        inspectionTaskId: "task_new",
        frequency: RecurrenceFrequency.ANNUAL
      })
    });
    expect(txMock.inspectionReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        inspectionTaskId: "task_new",
        technicianId: "tech_1"
      })
    });
    expect(createdTask).toEqual({ id: "task_new" });
  });

  it("blocks technicians who are not assigned to the inspection", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      assignedTechnicianId: "tech_2",
      technicianAssignments: [{ technicianId: "tech_2" }],
      tasks: [],
      scheduledStart: new Date("2026-03-18T09:00:00.000Z"),
      status: InspectionStatus.scheduled
    });

    await expect(addInspectionTask(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionType: "fire_alarm" }
    )).rejects.toThrow(/do not have access/i);

    expect(txMock.inspectionTask.create).not.toHaveBeenCalled();
  });

  it("allows an assigned technician to remove a report type they added", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      assignedTechnicianId: "tech_1",
      technicianAssignments: [{ technicianId: "tech_1" }],
      status: InspectionStatus.in_progress
    });
    txMock.inspectionTask.findFirst.mockResolvedValue({
      id: "task_added",
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      inspectionType: "fire_alarm",
      addedByUserId: "tech_1",
      report: {
        id: "report_added",
        attachments: [],
        signatures: [],
        deficiencies: []
      }
    });
    txMock.inspectionTask.findMany.mockResolvedValue([
      { id: "task_existing" },
      { id: "task_other" }
    ]);

    const removedTask = await removeInspectionTask(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionTaskId: "task_added" }
    );

    expect(txMock.inspectionReport.delete).toHaveBeenCalledWith({
      where: { id: "report_added" }
    });
    expect(txMock.inspectionTask.delete).toHaveBeenCalledWith({
      where: { id: "task_added" }
    });
    expect(txMock.inspectionTask.update).toHaveBeenNthCalledWith(1, {
      where: { id: "task_existing" },
      data: { sortOrder: 0 }
    });
    expect(txMock.inspectionTask.update).toHaveBeenNthCalledWith(2, {
      where: { id: "task_other" },
      data: { sortOrder: 1 }
    });
    expect(removedTask).toEqual({ id: "task_added" });
  });

  it("blocks technicians from removing original scheduled report types", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      assignedTechnicianId: "tech_1",
      technicianAssignments: [{ technicianId: "tech_1" }],
      status: InspectionStatus.in_progress
    });
    txMock.inspectionTask.findFirst.mockResolvedValue({
      id: "task_existing",
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      inspectionType: "fire_alarm",
      addedByUserId: null,
      report: {
        id: "report_existing",
        attachments: [],
        signatures: [],
        deficiencies: []
      }
    });

    await expect(removeInspectionTask(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionTaskId: "task_existing" }
    )).rejects.toThrow(/only remove report types they added/i);

    expect(txMock.inspectionTask.delete).not.toHaveBeenCalled();
  });

  it("blocks removing a report type once report activity exists", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      assignedTechnicianId: "tech_1",
      technicianAssignments: [{ technicianId: "tech_1" }],
      status: InspectionStatus.in_progress
    });
    txMock.inspectionTask.findFirst.mockResolvedValue({
      id: "task_added",
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      inspectionType: "fire_alarm",
      addedByUserId: "tech_1",
      report: {
        id: "report_added",
        attachments: [],
        signatures: [],
        deficiencies: []
      }
    });
    txMock.inspectionReport.count.mockResolvedValue(1);

    await expect(removeInspectionTask(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionTaskId: "task_added" }
    )).rejects.toThrow(/already has report activity/i);

    expect(txMock.inspectionTask.delete).not.toHaveBeenCalled();
  });
});
