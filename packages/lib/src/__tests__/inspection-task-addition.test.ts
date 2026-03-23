import { InspectionStatus, RecurrenceFrequency } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock } = vi.hoisted(() => {
  const tx = {
    inspection: {
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

import { addInspectionTask } from "../scheduling";

describe("inspection task addition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMock.inspectionTask.create.mockResolvedValue({ id: "task_new" });
    txMock.inspectionRecurrence.create.mockResolvedValue({ id: "recurrence_new" });
    txMock.inspectionReport.create.mockResolvedValue({ id: "report_new" });
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
});
