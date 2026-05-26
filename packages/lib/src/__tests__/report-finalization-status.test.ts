import { InspectionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { syncInspectionArchiveStateTxMock } = vi.hoisted(() => ({
  syncInspectionArchiveStateTxMock: vi.fn()
}));

vi.mock("../inspection-archive", () => ({
  syncInspectionArchiveStateTx: syncInspectionArchiveStateTxMock
}));

import { resolveInspectionCompletionAfterTaskFinalizationTx } from "../report-service";

function buildTxMock() {
  return {
    inspection: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    inspectionTask: {
      updateMany: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  };
}

describe("inspection completion after report finalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncInspectionArchiveStateTxMock.mockResolvedValue(undefined);
  });

  it("marks the parent inspection completed only when every active task is finalized", async () => {
    const tx = buildTxMock();
    const finalizedAt = new Date("2026-05-08T14:00:00.000Z");
    tx.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      status: InspectionStatus.in_progress,
      isPriority: true,
      tasks: [
        {
          id: "task_1",
          status: InspectionStatus.completed,
          schedulingStatus: "completed",
          report: { id: "report_1", status: "finalized", finalizedAt }
        },
        {
          id: "task_2",
          status: InspectionStatus.completed,
          schedulingStatus: "completed",
          report: { id: "report_2", status: "finalized", finalizedAt }
        }
      ]
    });

    const result = await resolveInspectionCompletionAfterTaskFinalizationTx({
      tx: tx as never,
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      finalizedAt,
      actorUserId: "tech_1",
      source: "mobile_or_web_finalize"
    });

    expect(result.completed).toBe(true);
    expect(tx.inspection.update).toHaveBeenCalledWith({
      where: { id: "inspection_1" },
      data: {
        status: InspectionStatus.completed,
        isPriority: false,
        priorityClearedAt: finalizedAt
      }
    });
    expect(syncInspectionArchiveStateTxMock).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      completedAtOverride: finalizedAt,
      archivedAtOverride: finalizedAt
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "inspection.status_reconciled",
        metadata: expect.objectContaining({
          previousInspectionStatus: InspectionStatus.in_progress,
          newInspectionStatus: InspectionStatus.completed,
          billingReadyTransition: true
        })
      })
    }));
  });

  it("leaves the parent active when another active report task is not finalized", async () => {
    const tx = buildTxMock();
    const finalizedAt = new Date("2026-05-08T14:00:00.000Z");
    tx.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      status: InspectionStatus.in_progress,
      isPriority: false,
      tasks: [
        {
          id: "task_1",
          status: InspectionStatus.completed,
          schedulingStatus: "completed",
          report: { id: "report_1", status: "finalized", finalizedAt }
        },
        {
          id: "task_2",
          status: InspectionStatus.in_progress,
          schedulingStatus: "scheduled_now",
          report: { id: "report_2", status: "draft", finalizedAt: null }
        }
      ]
    });

    const result = await resolveInspectionCompletionAfterTaskFinalizationTx({
      tx: tx as never,
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      finalizedAt,
      actorUserId: "tech_1",
      source: "mobile_or_web_finalize"
    });

    expect(result.completed).toBe(false);
    expect(tx.inspection.update).not.toHaveBeenCalled();
    expect(syncInspectionArchiveStateTxMock).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "inspection.status_reconciled",
        metadata: expect.objectContaining({
          previousInspectionStatus: InspectionStatus.in_progress,
          newInspectionStatus: InspectionStatus.in_progress,
          blockingTaskIds: ["task_2"],
          billingReadyTransition: false
        })
      })
    }));
  });

  it("repairs stale task statuses when reports are finalized", async () => {
    const tx = buildTxMock();
    const finalizedAt = new Date("2026-05-08T14:00:00.000Z");
    tx.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      status: InspectionStatus.to_be_completed,
      isPriority: false,
      billingSummary: null,
      tasks: [
        {
          id: "task_1",
          status: InspectionStatus.to_be_completed,
          schedulingStatus: "scheduled_now",
          report: { id: "report_1", status: "finalized", finalizedAt }
        }
      ]
    });

    const result = await resolveInspectionCompletionAfterTaskFinalizationTx({
      tx: tx as never,
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      finalizedAt,
      actorUserId: "tech_1",
      source: "sync_finalize"
    });

    expect(result.completed).toBe(true);
    expect(tx.inspectionTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: InspectionStatus.completed }
    }));
    expect(tx.inspection.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: InspectionStatus.completed })
    }));
  });

  it("treats same-month scheduled future tasks as current work when reconciling finalized inspections", async () => {
    const tx = buildTxMock();
    const finalizedAt = new Date("2026-05-18T18:00:00.000Z");
    tx.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      status: InspectionStatus.to_be_completed,
      isPriority: false,
      scheduledStart: new Date("2026-05-01T09:00:00.000Z"),
      billingSummary: null,
      tasks: [
        {
          id: "task_1",
          status: InspectionStatus.to_be_completed,
          schedulingStatus: "scheduled_future",
          dueDate: null,
          dueMonth: "2026-05",
          report: { id: "report_1", status: "finalized", finalizedAt }
        }
      ]
    });

    const result = await resolveInspectionCompletionAfterTaskFinalizationTx({
      tx: tx as never,
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      finalizedAt,
      actorUserId: "tech_1",
      source: "sync_finalize"
    });

    expect(result.completed).toBe(true);
    expect(tx.inspectionTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["task_1"] } }),
      data: { status: InspectionStatus.completed }
    }));
    expect(tx.inspection.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: InspectionStatus.completed })
    }));
  });
});
