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

function readDuePeriod(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isCurrentTaskForDuplicateCheck(task: {
  schedulingStatus?: string | null;
  status?: InspectionStatus | string | null;
  dueDate?: Date | string | null;
  dueMonth?: string | null;
}, inspection: { scheduledStart?: Date | string | null }) {
  if (task.status === InspectionStatus.cancelled) {
    return false;
  }

  if (activeTaskSchedulingStatuses.includes((task.schedulingStatus ?? "scheduled_now") as (typeof activeTaskSchedulingStatuses)[number])) {
    return true;
  }

  if (task.schedulingStatus !== "scheduled_future") {
    return false;
  }

  const inspectionDuePeriod = readDuePeriod(inspection.scheduledStart);
  const taskDuePeriod = readDuePeriod(task.dueMonth) ?? readDuePeriod(task.dueDate);
  return Boolean(inspectionDuePeriod && taskDuePeriod && inspectionDuePeriod === taskDuePeriod);
}

function getInspectionDuePeriod(input: {
  scheduledStart?: Date | string | null;
  tasks?: Array<{
    dueDate?: Date | string | null;
    dueMonth?: string | null;
    schedulingStatus?: string | null;
    status?: InspectionStatus | string | null;
  }> | null;
}) {
  const taskDuePeriods = (input.tasks ?? [])
    .filter((task) => isCurrentTaskForDuplicateCheck(task, input))
    .map((task) => readDuePeriod(task.dueMonth) ?? readDuePeriod(task.dueDate))
    .filter((period): period is string => Boolean(period))
    .sort();

  return taskDuePeriods[0] ?? readDuePeriod(input.scheduledStart ?? null);
}

function getTaskTypeSignature(tasks: Array<{
  inspectionType: string;
  dueDate?: Date | string | null;
  dueMonth?: string | null;
  schedulingStatus?: string | null;
  status?: InspectionStatus | string | null;
}>, inspection: { scheduledStart?: Date | string | null }) {
  return tasks
    .filter((task) => isCurrentTaskForDuplicateCheck(task, inspection))
    .map((task) => task.inspectionType)
    .sort()
    .join("|");
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

  const duplicateCandidates = await prisma.inspection.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: { in: [InspectionStatus.to_be_completed, InspectionStatus.scheduled] },
      archivedAt: null,
      billingSummary: { is: null },
      reports: {
        none: {
          status: "finalized",
          finalizedAt: { not: null }
        }
      },
      tasks: {
        some: {
          status: { not: InspectionStatus.cancelled }
        }
      }
    },
    select: {
      id: true,
      tenantId: true,
      customerCompanyId: true,
      siteId: true,
      status: true,
      scheduledStart: true,
      customerCompany: { select: { name: true } },
      site: { select: { name: true, addressLine1: true, city: true, state: true } },
      tasks: {
        select: {
          id: true,
          inspectionType: true,
          dueDate: true,
          dueMonth: true,
          schedulingStatus: true,
          status: true
        }
      }
    },
    orderBy: [{ tenantId: "asc" }, { scheduledStart: "asc" }]
  });

  const duplicateRepairs = [];
  for (const candidate of duplicateCandidates) {
    const duePeriod = getInspectionDuePeriod(candidate);
    const taskTypeSignature = getTaskTypeSignature(candidate.tasks, candidate);
    if (!duePeriod || !taskTypeSignature) {
      continue;
    }

    const duePeriodStart = new Date(`${duePeriod}-01T00:00:00.000Z`);
    const duePeriodEnd = new Date(Date.UTC(duePeriodStart.getUTCFullYear(), duePeriodStart.getUTCMonth() + 1, 1));
    const archivedMatches = await prisma.inspection.findMany({
      where: {
        tenantId: candidate.tenantId,
        id: { not: candidate.id },
        customerCompanyId: candidate.customerCompanyId,
        siteId: candidate.siteId,
        status: { in: [InspectionStatus.completed, InspectionStatus.invoiced] },
        archivedAt: { not: null },
        OR: [
          { scheduledStart: { gte: duePeriodStart, lt: duePeriodEnd } },
          { tasks: { some: { dueMonth: duePeriod } } }
        ]
      },
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        completedAt: true,
        archivedAt: true,
        tasks: {
          select: {
            inspectionType: true,
            dueDate: true,
            dueMonth: true,
            schedulingStatus: true,
            status: true
          }
        }
      }
    });

    const archivedMatch = archivedMatches.find((archived) =>
      getInspectionDuePeriod(archived) === duePeriod &&
      getTaskTypeSignature(archived.tasks, archived) === taskTypeSignature
    );
    if (!archivedMatch) {
      continue;
    }

    const repair = {
      inspectionId: candidate.id,
      tenantId: candidate.tenantId,
      customer: candidate.customerCompany.name,
      site: candidate.site.name,
      siteAddress: [candidate.site.addressLine1, candidate.site.city, candidate.site.state].filter(Boolean).join(", "),
      previousStatus: candidate.status,
      nextStatus: InspectionStatus.cancelled,
      matchedArchivedInspectionId: archivedMatch.id,
      matchedArchivedInspectionStatus: archivedMatch.status,
      duePeriod,
      taskTypeSignature,
      cancelledTaskIds: candidate.tasks.map((task) => task.id)
    };
    duplicateRepairs.push(repair);

    if (!apply) {
      continue;
    }

    const actorUserId = await resolveRepairActorUserId(candidate.tenantId, requestedActorUserId);
    if (!actorUserId) {
      console.warn(`Skipping duplicate ${candidate.id}: no tenant user exists for audit logging.`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.inspectionTask.updateMany({
        where: {
          tenantId: candidate.tenantId,
          inspectionId: candidate.id,
          id: { in: candidate.tasks.map((task) => task.id) },
          status: { not: InspectionStatus.cancelled }
        },
        data: { status: InspectionStatus.cancelled }
      });
      await tx.inspection.update({
        where: { id: candidate.id },
        data: {
          status: InspectionStatus.cancelled,
          isPriority: false,
          priorityClearedAt: new Date()
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId: candidate.tenantId,
          actorUserId,
          action: "inspection.duplicate_active_visit_cancelled",
          entityType: "Inspection",
          entityId: candidate.id,
          metadata: repair
        }
      });
    });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    scanned: candidates.length + duplicateCandidates.length,
    repairable: repairs.length + duplicateRepairs.length,
    repairs,
    duplicateRepairs
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
