import { InspectionStatus, RecurrenceFrequency } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    inspection: {
      findFirst: vi.fn()
    },
    inspectionTask: {
      count: vi.fn(),
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
      jobTimeSession: { findFirst: vi.fn(async () => ({ id: "active-session" })) },
      auditLog: {
        create: vi.fn()
      },
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
    txMock.inspectionTask.count.mockResolvedValue(1);
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
    prismaMock.auditLog.create.mockResolvedValue({ id: "audit_2" });
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

  it("allows office admins to add a report type directly to an in-progress inspection visit", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      assignedTechnicianId: "tech_1",
      technicianAssignments: [{ technicianId: "tech_1" }],
      tasks: [
        {
          inspectionType: "kitchen_suppression",
          schedulingStatus: "scheduled_now",
          sortOrder: 0,
          status: InspectionStatus.in_progress
        }
      ],
      scheduledStart: new Date("2026-03-18T09:00:00.000Z"),
      status: InspectionStatus.in_progress
    });

    await addInspectionTask(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionType: "fire_extinguisher" }
    );

    expect(txMock.inspectionTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        inspectionType: "fire_extinguisher",
        status: InspectionStatus.in_progress,
        addedByUserId: "office_1",
        sortOrder: 1
      })
    });
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "report_type_added",
        entityId: "inspection_1",
        metadata: expect.objectContaining({
          addedToExistingInspection: true,
          inspectionType: "fire_extinguisher",
          inspectionStatus: InspectionStatus.in_progress,
          taskStatus: InspectionStatus.in_progress
        })
      })
    });
  });

  it("allows duplicate same-type report instances on the same inspection", async () => {
    txMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      assignedTechnicianId: "tech_1",
      technicianAssignments: [{ technicianId: "tech_1" }],
      tasks: [
        {
          inspectionType: "fire_extinguisher",
          schedulingStatus: "scheduled_now",
          sortOrder: 0,
          status: InspectionStatus.in_progress
        }
      ],
      scheduledStart: new Date("2026-03-18T09:00:00.000Z"),
      status: InspectionStatus.in_progress
    });

    await addInspectionTask(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionType: "fire_extinguisher" }
    );

    expect(txMock.inspectionTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        inspectionId: "inspection_1",
        inspectionType: "fire_extinguisher",
        addedByUserId: "tech_1",
        sortOrder: 1
      })
    });
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
        status: "draft",
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

  it("allows technicians to remove original scheduled draft report types", async () => {
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
        status: "draft",
        attachments: [],
        signatures: [],
        deficiencies: []
      }
    });

    await expect(removeInspectionTask(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionTaskId: "task_existing" }
    )).resolves.toEqual({ id: "task_existing" });

    expect(txMock.inspectionTask.delete).toHaveBeenCalledWith({ where: { id: "task_existing" } });
  });

  it("allows office admins to remove a technician-added report type", async () => {
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
    txMock.inspectionTask.findMany.mockResolvedValue([{ id: "task_existing" }]);

    const removedTask = await removeInspectionTask(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionTaskId: "task_added" }
    );

    expect(txMock.inspectionTask.delete).toHaveBeenCalledWith({
      where: { id: "task_added" }
    });
    expect(removedTask).toEqual({ id: "task_added" });
  });

  it("allows office admins to remove an original scheduled report type when no report activity exists", async () => {
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
      inspectionType: "fire_extinguisher",
      addedByUserId: null,
      report: {
        id: "report_existing",
        attachments: [],
        signatures: [],
        deficiencies: []
      }
    });
    txMock.inspectionTask.findMany.mockResolvedValue([{ id: "task_other" }]);

    const removedTask = await removeInspectionTask(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionTaskId: "task_existing" }
    );

    expect(txMock.inspectionTask.delete).toHaveBeenCalledWith({
      where: { id: "task_existing" }
    });
    expect(removedTask).toEqual({ id: "task_existing" });
  });

  it("allows technicians to remove worked drafts and records the removed data", async () => {
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
        status: "draft",
        attachments: [],
        signatures: [],
        deficiencies: []
      }
    });
    txMock.inspectionReport.count.mockResolvedValue(1);

    await expect(removeInspectionTask(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionTaskId: "task_added" }
    )).resolves.toEqual({ id: "task_added" });

    expect(txMock.inspectionTask.delete).toHaveBeenCalled();
    expect(txMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      metadata: expect.objectContaining({ removedTaskSnapshot: expect.objectContaining({ id: "task_added" }) })
    }) }));
  });

  it.each([
    { status: "submitted", finalizedAt: null, signatures: [] },
    { status: "finalized", finalizedAt: null, signatures: [] },
    { status: "draft", finalizedAt: new Date(), signatures: [] },
    { status: "draft", finalizedAt: null, signatures: [{ imageDataUrl: "signature" }] }
  ])("protects submitted, finalized and signed reports even with force: %j", async (report) => {
    txMock.inspection.findFirst.mockResolvedValue({ id: "inspection_1", assignedTechnicianId: "tech_1", status: InspectionStatus.in_progress });
    txMock.inspectionTask.findFirst.mockResolvedValue({ id: "task_1", report: { id: "report_1", attachments: [], deficiencies: [], ...report } });
    await expect(removeInspectionTask({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, { inspectionId: "inspection_1", inspectionTaskId: "task_1", force: true })).rejects.toThrow("cannot be removed by technicians");
    expect(txMock.inspectionTask.delete).not.toHaveBeenCalled();
  });

  it("protects the last current-visit report", async () => {
    txMock.inspection.findFirst.mockResolvedValue({ id: "inspection_1", assignedTechnicianId: "tech_1", status: InspectionStatus.in_progress });
    txMock.inspectionTask.findFirst.mockResolvedValue({ id: "task_1", report: null });
    txMock.inspectionTask.count.mockResolvedValue(0);
    await expect(removeInspectionTask({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, { inspectionId: "inspection_1", inspectionTaskId: "task_1" })).rejects.toThrow("Keep at least one report");
    expect(txMock.inspectionTask.count).toHaveBeenCalledWith({ where: { tenantId: "tenant_1", inspectionId: "inspection_1", id: { not: "task_1" }, schedulingStatus: { in: ["due_now", "scheduled_now", "completed", "deferred"] } } });
    expect(txMock.inspectionTask.delete).not.toHaveBeenCalled();
  });

  it("rejects unassigned technicians", async () => {
    txMock.inspection.findFirst.mockResolvedValue({ id: "inspection_1", assignedTechnicianId: "other_tech", status: InspectionStatus.in_progress });
    await expect(removeInspectionTask({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, { inspectionId: "inspection_1", inspectionTaskId: "task_1" })).rejects.toThrow("do not have access");
    expect(txMock.inspectionTask.delete).not.toHaveBeenCalled();
  });

  it.each([InspectionStatus.completed, InspectionStatus.invoiced, InspectionStatus.cancelled])("protects closed inspections: %s", async (status) => {
    txMock.inspection.findFirst.mockResolvedValue({ id: "inspection_1", assignedTechnicianId: "tech_1", status });
    await expect(removeInspectionTask({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, { inspectionId: "inspection_1", inspectionTaskId: "task_1" })).rejects.toThrow("active inspections");
    expect(txMock.inspectionTask.delete).not.toHaveBeenCalled();
  });

  it("scopes the inspection and task to the tenant and visit", async () => {
    txMock.inspection.findFirst.mockResolvedValue({ id: "inspection_1", assignedTechnicianId: "tech_1", status: InspectionStatus.in_progress });
    txMock.inspectionTask.findFirst.mockResolvedValue(null);
    await expect(removeInspectionTask({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, { inspectionId: "inspection_1", inspectionTaskId: "foreign_task" })).rejects.toThrow("Report type not found");
    expect(txMock.inspection.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inspection_1", tenantId: "tenant_1" } }));
    expect(txMock.inspectionTask.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "foreign_task", tenantId: "tenant_1", inspectionId: "inspection_1" } }));
    expect(txMock.inspectionTask.delete).not.toHaveBeenCalled();
  });

  it("requires technicians to start the job", async () => {
    prismaMock.jobTimeSession.findFirst.mockResolvedValueOnce(null as never);
    await expect(removeInspectionTask({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, { inspectionId: "inspection_1", inspectionTaskId: "task_1" })).rejects.toThrow();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("allows office admins to delete a report after work has started", async () => {
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
      inspectionType: "fire_extinguisher",
      addedByUserId: null,
      report: {
        id: "report_existing",
        attachments: [{ storageKey: "blob:attachment_1" }],
        signatures: [{ imageDataUrl: "blob:signature_1" }],
        deficiencies: [{ photoStorageKey: "blob:deficiency_1" }]
      }
    });
    txMock.inspectionTask.findMany.mockResolvedValue([]);
    txMock.inspectionReport.count.mockResolvedValue(3);

    const removedTask = await removeInspectionTask(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { inspectionId: "inspection_1", inspectionTaskId: "task_existing", force: true }
    );

    expect(txMock.attachment.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant_1",
        inspectionReportId: "report_existing"
      }
    });
    expect(txMock.signature.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant_1",
        inspectionReportId: "report_existing"
      }
    });
    expect(txMock.deficiency.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant_1",
        inspectionReportId: "report_existing"
      }
    });
    expect(txMock.inspectionReport.delete).toHaveBeenCalledWith({
      where: { id: "report_existing" }
    });
    expect(txMock.inspectionTask.delete).toHaveBeenCalledWith({
      where: { id: "task_existing" }
    });
    expect(removedTask).toEqual({ id: "task_existing" });
  });
});
