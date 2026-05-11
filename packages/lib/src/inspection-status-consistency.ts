import { InspectionStatus, Prisma } from "@prisma/client";
import { reportStatuses } from "@testworx/types";

import type { JsonObject } from "./json-types";
import { syncInspectionArchiveStateTx } from "./inspection-archive";

type TransactionClient = Prisma.TransactionClient;

const statusRollupTaskSchedulingStatuses = ["due_now", "scheduled_now", "completed", "deferred"] as const;
const billingClosedStatuses = new Set(["reviewed", "invoiced"]);

type InspectionStatusRollupSource =
  | "mobile_or_web_finalize"
  | "sync_finalize"
  | "admin_status_update"
  | "tech_status_update"
  | "billing_status_update"
  | "quickbooks_sync"
  | "repair";

function isClosedBillingStatus(status: string | null | undefined) {
  return Boolean(status && billingClosedStatuses.has(status));
}

function isTaskClosed(task: {
  status: InspectionStatus;
  report: { status: string; finalizedAt: Date | null } | null;
}) {
  return (
    task.status === InspectionStatus.completed ||
    task.status === InspectionStatus.invoiced ||
    (task.report?.status === reportStatuses.finalized && Boolean(task.report.finalizedAt))
  );
}

function resolveClosedInspectionStatus(input: {
  currentStatus?: InspectionStatus;
  billingStatus?: string | null;
  quickbooksInvoiceId?: string | null;
}) {
  return input.currentStatus === InspectionStatus.invoiced ||
    input.billingStatus === "invoiced" ||
    Boolean(input.quickbooksInvoiceId)
    ? InspectionStatus.invoiced
    : InspectionStatus.completed;
}

async function createInspectionStatusAuditLog(tx: TransactionClient, input: {
  tenantId: string;
  actorUserId: string;
  inspectionId: string;
  action: string;
  metadata: Record<string, unknown>;
}) {
  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: "Inspection",
      entityId: input.inspectionId,
      metadata: input.metadata as JsonObject
    }
  });
}

export async function reconcileInspectionStatusTx(tx: TransactionClient, input: {
  tenantId: string;
  inspectionId: string;
  actorUserId: string;
  source: InspectionStatusRollupSource;
  completedAt?: Date;
}) {
  const inspection = await tx.inspection.findFirst({
    where: { id: input.inspectionId, tenantId: input.tenantId },
    select: {
      id: true,
      status: true,
      isPriority: true,
      billingSummary: {
        select: {
          status: true,
          quickbooksInvoiceId: true,
          quickbooksSyncStatus: true
        }
      },
      tasks: {
        where: {
          status: { not: InspectionStatus.cancelled },
          schedulingStatus: { in: [...statusRollupTaskSchedulingStatuses] }
        },
        select: {
          id: true,
          status: true,
          schedulingStatus: true,
          report: { select: { id: true, status: true, finalizedAt: true } }
        }
      }
    }
  });

  if (!inspection) {
    throw new Error("Inspection not found.");
  }

  if (inspection.status === InspectionStatus.cancelled) {
    return {
      completed: false,
      changed: false,
      previousStatus: inspection.status,
      nextStatus: inspection.status,
      wasPriority: inspection.isPriority
    };
  }

  const closedTasks = inspection.tasks.filter(isTaskClosed);
  const blockingTasks = inspection.tasks.filter((task) => !isTaskClosed(task));
  const allCurrentTasksClosed = inspection.tasks.length > 0 && blockingTasks.length === 0;
  const noCurrentTasksRemainOpen = blockingTasks.length === 0;
  const billingStatus = inspection.billingSummary?.status ?? null;
  const quickbooksInvoiceId = inspection.billingSummary?.quickbooksInvoiceId ?? null;
  const billingClosed = isClosedBillingStatus(billingStatus) || Boolean(quickbooksInvoiceId);
  const shouldCloseInspection = allCurrentTasksClosed || (billingClosed && noCurrentTasksRemainOpen);
  const nextStatus = shouldCloseInspection
    ? resolveClosedInspectionStatus({ currentStatus: inspection.status, billingStatus, quickbooksInvoiceId })
    : inspection.status;
  const completedAt = input.completedAt ?? new Date();
  const changed = inspection.status !== nextStatus;

  if (shouldCloseInspection) {
    await tx.inspectionTask.updateMany({
      where: {
        tenantId: input.tenantId,
        inspectionId: input.inspectionId,
        status: { notIn: [InspectionStatus.completed, InspectionStatus.invoiced, InspectionStatus.cancelled] },
        schedulingStatus: { in: [...statusRollupTaskSchedulingStatuses] },
        OR: [
          { report: { is: { status: reportStatuses.finalized, finalizedAt: { not: null } } } },
          { id: { in: closedTasks.map((task) => task.id) } }
        ]
      },
      data: { status: InspectionStatus.completed }
    });

    if (changed) {
      await tx.inspection.update({
        where: { id: input.inspectionId },
        data: {
          status: nextStatus,
          isPriority: false,
          priorityClearedAt: inspection.isPriority ? completedAt : undefined
        }
      });
    }

    await syncInspectionArchiveStateTx(tx, {
      tenantId: input.tenantId,
      inspectionId: input.inspectionId,
      completedAtOverride: completedAt,
      archivedAtOverride: completedAt
    });
  }

  await createInspectionStatusAuditLog(tx, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    inspectionId: input.inspectionId,
    action: "inspection.status_reconciled",
    metadata: {
      source: input.source,
      previousInspectionStatus: inspection.status,
      newInspectionStatus: nextStatus,
      activeTaskCount: inspection.tasks.length,
      closedTaskIds: closedTasks.map((task) => task.id),
      blockingTaskIds: blockingTasks.map((task) => task.id),
      billingStatus,
      quickbooksInvoiceId,
      quickbooksSyncStatus: inspection.billingSummary?.quickbooksSyncStatus ?? null,
      billingReadyTransition: shouldCloseInspection,
      changed
    }
  });

  return {
    completed: shouldCloseInspection,
    changed,
    previousStatus: inspection.status,
    nextStatus,
    wasPriority: inspection.isPriority,
    blockingTaskIds: blockingTasks.map((task) => task.id)
  };
}

export async function repairInspectionStatusConsistencyTx(tx: TransactionClient, input: {
  tenantId: string;
  actorUserId: string;
}) {
  const candidates = await tx.inspection.findMany({
    where: {
      tenantId: input.tenantId,
      status: { in: [InspectionStatus.to_be_completed, InspectionStatus.scheduled, InspectionStatus.in_progress, InspectionStatus.follow_up_required] },
      OR: [
        { billingSummary: { is: { status: { in: ["reviewed", "invoiced"] } } } },
        { billingSummary: { is: { quickbooksInvoiceId: { not: null } } } },
        {
          tasks: {
            some: {
              schedulingStatus: { in: [...statusRollupTaskSchedulingStatuses] },
              report: { is: { status: reportStatuses.finalized, finalizedAt: { not: null } } }
            }
          }
        }
      ]
    },
    select: { id: true }
  });

  const results = [];
  for (const candidate of candidates) {
    results.push(await reconcileInspectionStatusTx(tx, {
      tenantId: input.tenantId,
      inspectionId: candidate.id,
      actorUserId: input.actorUserId,
      source: "repair"
    }));
  }

  return {
    scanned: candidates.length,
    changed: results.filter((result) => result.changed).length,
    results
  };
}
