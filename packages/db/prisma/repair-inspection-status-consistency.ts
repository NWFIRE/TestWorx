import { InspectionStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const activeStatuses = [
  InspectionStatus.to_be_completed,
  InspectionStatus.scheduled,
  InspectionStatus.in_progress,
  InspectionStatus.follow_up_required
];
const activeTaskSchedulingStatuses = ["due_now", "scheduled_now", "completed", "deferred"] as const;
const closedBillingStatuses = new Set(["reviewed", "invoiced"]);

function hasArg(name: string) {
  return process.argv.includes(name);
}

function readArg(name: string) {
  const index = process.argv.findIndex((arg) => arg === name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isTaskClosed(task: {
  status: InspectionStatus;
  report: { status: string; finalizedAt: Date | null } | null;
}) {
  return (
    task.status === InspectionStatus.completed ||
    task.status === InspectionStatus.invoiced ||
    (task.report?.status === "finalized" && Boolean(task.report.finalizedAt))
  );
}

async function resolveRepairActorUserId(tenantId: string, requestedActorUserId?: string | null) {
  if (requestedActorUserId) {
    const user = await prisma.user.findFirst({
      where: { id: requestedActorUserId, tenantId },
      select: { id: true }
    });
    if (user) {
      return user.id;
    }
  }

  const admin = await prisma.user.findFirst({
    where: {
      tenantId,
      role: { in: ["tenant_admin", "office_admin", "platform_admin"] }
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }]
  });
  if (admin) {
    return admin.id;
  }

  const fallback = await prisma.user.findFirst({
    where: { tenantId },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }]
  });

  return fallback?.id ?? null;
}

async function main() {
  const apply = hasArg("--apply");
  const tenantId = readArg("--tenant-id");
  const requestedActorUserId = readArg("--actor-user-id") ?? null;

  const candidates = await prisma.inspection.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: { in: activeStatuses },
      OR: [
        { billingSummary: { is: { status: { in: [...closedBillingStatuses] } } } },
        { billingSummary: { is: { quickbooksInvoiceId: { not: null } } } },
        {
          tasks: {
            some: {
              schedulingStatus: { in: [...activeTaskSchedulingStatuses] },
              report: { is: { status: "finalized", finalizedAt: { not: null } } }
            }
          }
        }
      ]
    },
    select: {
      id: true,
      tenantId: true,
      status: true,
      isPriority: true,
      completedAt: true,
      archivedAt: true,
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
          schedulingStatus: { in: [...activeTaskSchedulingStatuses] }
        },
        select: {
          id: true,
          status: true,
          schedulingStatus: true,
          report: { select: { status: true, finalizedAt: true } }
        }
      }
    },
    orderBy: [{ tenantId: "asc" }, { scheduledStart: "asc" }]
  });

  const repairs = [];
  for (const inspection of candidates) {
    const blockingTasks = inspection.tasks.filter((task) => !isTaskClosed(task));
    const closedTasks = inspection.tasks.filter(isTaskClosed);
    const billingClosed =
      closedBillingStatuses.has(inspection.billingSummary?.status ?? "") ||
      Boolean(inspection.billingSummary?.quickbooksInvoiceId);
    const shouldClose = (
      (inspection.tasks.length > 0 && blockingTasks.length === 0) ||
      (billingClosed && blockingTasks.length === 0)
    );

    if (!shouldClose) {
      continue;
    }

    const nextStatus = inspection.billingSummary?.status === "invoiced" || inspection.billingSummary?.quickbooksInvoiceId
      ? InspectionStatus.invoiced
      : InspectionStatus.completed;

    repairs.push({
      inspectionId: inspection.id,
      tenantId: inspection.tenantId,
      previousStatus: inspection.status,
      nextStatus,
      closedTaskIds: closedTasks.map((task) => task.id),
      billingStatus: inspection.billingSummary?.status ?? null,
      quickbooksInvoiceId: inspection.billingSummary?.quickbooksInvoiceId ?? null
    });

    if (!apply) {
      continue;
    }

    const actorUserId = await resolveRepairActorUserId(inspection.tenantId, requestedActorUserId);
    if (!actorUserId) {
      console.warn(`Skipping ${inspection.id}: no tenant user exists for audit logging.`);
      continue;
    }

    const closedAt = inspection.completedAt ?? inspection.archivedAt ?? new Date();
    await prisma.$transaction(async (tx) => {
      await tx.inspectionTask.updateMany({
        where: {
          tenantId: inspection.tenantId,
          inspectionId: inspection.id,
          id: { in: closedTasks.map((task) => task.id) },
          status: { notIn: [InspectionStatus.completed, InspectionStatus.invoiced, InspectionStatus.cancelled] }
        },
        data: { status: InspectionStatus.completed }
      });
      await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          status: nextStatus,
          isPriority: false,
          priorityClearedAt: inspection.isPriority ? closedAt : undefined,
          completedAt: inspection.completedAt ?? closedAt,
          archivedAt: inspection.archivedAt ?? closedAt
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId: inspection.tenantId,
          actorUserId,
          action: "inspection.status_consistency_repaired",
          entityType: "Inspection",
          entityId: inspection.id,
          metadata: {
            previousInspectionStatus: inspection.status,
            newInspectionStatus: nextStatus,
            closedTaskIds: closedTasks.map((task) => task.id),
            billingStatus: inspection.billingSummary?.status ?? null,
            quickbooksInvoiceId: inspection.billingSummary?.quickbooksInvoiceId ?? null,
            quickbooksSyncStatus: inspection.billingSummary?.quickbooksSyncStatus ?? null
          }
        }
      });
    });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    scanned: candidates.length,
    repairable: repairs.length,
    repairs
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
