import { addMonths, endOfMonth, endOfWeek, format, isAfter, isSameDay, startOfDay, startOfMonth } from "date-fns";
import { InspectionStatus, Prisma, RecurrenceFrequency, ReportStatus } from "@prisma/client";
import { prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantContext } from "./permissions";
import { assertTenantEntitlementForTenant } from "./billing";
import { getDefaultInspectionRecurrenceFrequency, inspectionTypeRegistry } from "./report-config";

const inspectionTypeEnum = z.enum(Object.keys(inspectionTypeRegistry) as [keyof typeof inspectionTypeRegistry, ...(keyof typeof inspectionTypeRegistry)[]]);
export const editableInspectionStatuses = ["to_be_completed", "scheduled", "in_progress", "completed", "cancelled"] as const;
const editableInspectionStatusSchema = z.enum(editableInspectionStatuses);
export const adminInspectionLifecycleValues = ["original", "amended", "replacement", "superseded"] as const;
export type AdminInspectionLifecycle = (typeof adminInspectionLifecycleValues)[number];
const adminInspectionLifecycleFilterSchema = z.enum(["all", ...adminInspectionLifecycleValues]);
export const unstartedInspectionStatuses = [InspectionStatus.to_be_completed, InspectionStatus.scheduled] as const;
export const claimableInspectionStatuses = [InspectionStatus.to_be_completed, InspectionStatus.scheduled] as const;
export const inspectionStatusLabels: Record<InspectionStatus | "past_due", string> = {
  to_be_completed: "To Be Completed",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  past_due: "Past Due"
};

export const scheduleInspectionSchema = z.object({
  customerCompanyId: z.string().min(1),
  siteId: z.string().min(1),
  inspectionMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.union([z.null(), z.coerce.date()]).optional(),
  assignedTechnicianIds: z.array(z.string()).default([]),
  status: editableInspectionStatusSchema.default("to_be_completed"),
  notes: z.string().max(2000).optional(),
  tasks: z.array(
    z.object({
      inspectionType: inspectionTypeEnum,
      frequency: z.nativeEnum(RecurrenceFrequency)
    })
  ).min(1, "Select at least one inspection type.")
}).superRefine((input, context) => {
  if (input.scheduledEnd && input.scheduledEnd <= input.scheduledStart) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Scheduled end must be after the scheduled start.", path: ["scheduledEnd"] });
  }
});

export function nextDueFrom(start: Date, frequency: RecurrenceFrequency) {
  switch (frequency) {
    case "MONTHLY":
      return addMonths(start, 1);
    case "QUARTERLY":
      return addMonths(start, 3);
    case "SEMI_ANNUAL":
      return addMonths(start, 6);
    case "ANNUAL":
      return addMonths(start, 12);
    case "ONCE":
    default:
      return null;
  }
}

export function pickEarliestNextDueAt(dates: Array<Date | null | undefined>) {
  const validDates = dates.filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()));
  if (!validDates.length) {
    return null;
  }

  return validDates.reduce((earliest, current) => current.getTime() < earliest.getTime() ? current : earliest);
}

export function defaultScheduledStartForMonth(monthValue: string, existingValue?: string | null) {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return existingValue ?? "";
  }

  const timePortion = existingValue?.includes("T") ? existingValue.split("T")[1] : "09:00";
  const safeTime = timePortion && timePortion.length >= 5 ? timePortion.slice(0, 5) : "09:00";
  return `${yearText}-${monthText}-01T${safeTime}`;
}

export { getDefaultInspectionRecurrenceFrequency } from "./report-config";

export function formatInspectionTaskTypeLabel(inspectionType: keyof typeof inspectionTypeRegistry) {
  return inspectionTypeRegistry[inspectionType].label;
}

export function buildInspectionTaskDisplayLabel(input: {
  inspectionType: keyof typeof inspectionTypeRegistry;
  occurrenceIndex: number;
  totalOccurrences: number;
}) {
  const baseLabel = formatInspectionTaskTypeLabel(input.inspectionType);
  if (input.totalOccurrences <= 1) {
    return baseLabel;
  }

  return `${baseLabel} ${input.occurrenceIndex}`;
}

export function withInspectionTaskDisplayLabels<T extends { id: string; inspectionType: keyof typeof inspectionTypeRegistry }>(tasks: T[]) {
  const totals = new Map<keyof typeof inspectionTypeRegistry, number>();
  const seen = new Map<keyof typeof inspectionTypeRegistry, number>();

  for (const task of tasks) {
    totals.set(task.inspectionType, (totals.get(task.inspectionType) ?? 0) + 1);
  }

  return tasks.map((task) => {
    const occurrenceIndex = (seen.get(task.inspectionType) ?? 0) + 1;
    seen.set(task.inspectionType, occurrenceIndex);

    return {
      ...task,
      displayLabel: buildInspectionTaskDisplayLabel({
        inspectionType: task.inspectionType,
        occurrenceIndex,
        totalOccurrences: totals.get(task.inspectionType) ?? 1
      })
    };
  });
}

function mergeExistingDuplicateTasks(
  existingTasks: Array<{ inspectionType: keyof typeof inspectionTypeRegistry }>,
  nextTasks: z.infer<typeof scheduleInspectionSchema>["tasks"]
) {
  const existingCounts = new Map<keyof typeof inspectionTypeRegistry, number>();
  for (const task of existingTasks) {
    existingCounts.set(task.inspectionType, (existingCounts.get(task.inspectionType) ?? 0) + 1);
  }

  return nextTasks.flatMap((task) => {
    const existingCount = existingCounts.get(task.inspectionType) ?? 0;
    const desiredCount = Math.max(existingCount, 1);
    return Array.from({ length: desiredCount }, () => ({
      inspectionType: task.inspectionType,
      frequency: task.frequency
    }));
  });
}

export function getInspectionAssignedTechnicianIds(input: {
  assignedTechnicianId?: string | null;
  technicianAssignments?: Array<{ technicianId: string }>;
}) {
  const ids = new Set<string>();
  if (input.assignedTechnicianId) {
    ids.add(input.assignedTechnicianId);
  }

  for (const assignment of input.technicianAssignments ?? []) {
    if (assignment.technicianId) {
      ids.add(assignment.technicianId);
    }
  }

  return [...ids];
}

function readTechnicianAssignments(value: unknown): Array<{ technicianId: string }> {
  const assignments = (value as { technicianAssignments?: Array<{ technicianId: string }> } | null | undefined)?.technicianAssignments;
  return Array.isArray(assignments) ? assignments : [];
}

function readTechnicianNameAssignments(value: unknown): Array<{ technician: { name: string } }> {
  const assignments = (value as { technicianAssignments?: Array<{ technician: { name: string } }> } | null | undefined)?.technicianAssignments;
  return Array.isArray(assignments) ? assignments : [];
}

export function isTechnicianAssignedToInspection(input: {
  userId: string;
  assignedTechnicianId?: string | null;
  technicianAssignments?: Array<{ technicianId: string }>;
}) {
  return getInspectionAssignedTechnicianIds(input).includes(input.userId);
}

export function formatAssignedTechnicianNames(input: {
  assignedTechnician?: { name: string } | null;
  technicianAssignments?: Array<{ technician: { name: string } }>;
}) {
  const names = new Set<string>();
  if (input.assignedTechnician?.name) {
    names.add(input.assignedTechnician.name);
  }

  for (const assignment of input.technicianAssignments ?? []) {
    if (assignment.technician?.name) {
      names.add(assignment.technician.name);
    }
  }

  return [...names];
}

export function isInspectionPastDue(input: {
  status: InspectionStatus;
  scheduledStart: Date;
  now?: Date;
}) {
  if (input.status === InspectionStatus.completed || input.status === InspectionStatus.cancelled) {
    return false;
  }

  return isAfter(input.now ?? new Date(), endOfMonth(input.scheduledStart));
}

export function getInspectionDisplayStatus(input: {
  status: InspectionStatus;
  scheduledStart: Date;
  now?: Date;
}) {
  return isInspectionPastDue(input) ? "past_due" : input.status;
}

export function isInspectionInUnstartedState(status: InspectionStatus) {
  return status === InspectionStatus.to_be_completed || status === InspectionStatus.scheduled;
}

export function formatInspectionStatusLabel(status: InspectionStatus | "past_due") {
  return inspectionStatusLabels[status];
}

function deriveInspectionLifecycle(input: {
  hasIncomingAmendment: boolean;
  hasOutgoingAmendment: boolean;
  hasStartedWork: boolean;
}): AdminInspectionLifecycle {
  if (input.hasIncomingAmendment) {
    return "replacement";
  }

  if (input.hasOutgoingAmendment) {
    return "superseded";
  }

  if (input.hasStartedWork) {
    return "amended";
  }

  return "original";
}

export function getAssignmentAuditAction(previousTechnicianId: string | null, nextTechnicianId: string | null) {
  if (!previousTechnicianId && nextTechnicianId) {
    return "inspection.assigned";
  }

  if (previousTechnicianId && !nextTechnicianId) {
    return "inspection.unassigned";
  }

  if (previousTechnicianId && nextTechnicianId && previousTechnicianId !== nextTechnicianId) {
    return "inspection.assigned";
  }

  return null;
}

export function canTechnicianClaimInspection(input: {
  actorTenantId: string | null;
  inspectionTenantId: string;
  assignedTechnicianIds: string[];
  claimable: boolean;
  status: InspectionStatus;
}) {
  return Boolean(
    input.actorTenantId &&
      input.actorTenantId === input.inspectionTenantId &&
      input.assignedTechnicianIds.length === 0 &&
      input.claimable &&
      (input.status === InspectionStatus.to_be_completed || input.status === InspectionStatus.scheduled)
  );
}

function parseDateTimeInput(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const localMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (localMatch) {
    const [, year, month, day, hour, minute] = localMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeAssignedTechnicianIds(input: {
  assignedTechnicianIds?: string[] | null;
  assignedTechnicianId?: string | null;
}) {
  const ids = [
    ...(input.assignedTechnicianIds ?? []),
    ...(input.assignedTechnicianId ? [input.assignedTechnicianId] : [])
  ].filter(Boolean);

  return [...new Set(ids)];
}

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function parseInspectionFormData(formData: FormData) {
  const inspectionMonth = String(formData.get("inspectionMonth") ?? "");
  const scheduledStart = String(formData.get("scheduledStart") ?? "") || defaultScheduledStartForMonth(inspectionMonth);
  const scheduledEndValue = String(formData.get("scheduledEnd") ?? "");
  const assignedTechnicianIds = normalizeAssignedTechnicianIds({
    assignedTechnicianIds: formData.getAll("assignedTechnicianIds").map((value) => String(value)).filter(Boolean),
    assignedTechnicianId: String(formData.get("assignedTechnicianId") ?? "") || null
  });
  const tasks = (Object.keys(inspectionTypeRegistry) as Array<keyof typeof inspectionTypeRegistry>)
    .filter((inspectionType) => formData.get(`type:${inspectionType}`) === "true")
    .map((inspectionType) => ({
      inspectionType,
      frequency: formData.get(`frequency:${inspectionType}`) ?? getDefaultInspectionRecurrenceFrequency(inspectionType)
    }));

  return scheduleInspectionSchema.safeParse({
    customerCompanyId: formData.get("customerCompanyId"),
    siteId: formData.get("siteId"),
    inspectionMonth: inspectionMonth || undefined,
    scheduledStart: parseDateTimeInput(scheduledStart) ?? scheduledStart,
    scheduledEnd: scheduledEndValue ? parseDateTimeInput(scheduledEndValue) ?? scheduledEndValue : null,
    assignedTechnicianIds,
    status: formData.get("status") ?? "to_be_completed",
    notes: formData.get("notes") || undefined,
    tasks
  });
}

export function parseCreateInspectionFormData(formData: FormData) {
  return parseInspectionFormData(formData);
}

function requiresAdvancedRecurrence(tasks: z.infer<typeof scheduleInspectionSchema>["tasks"]) {
  return tasks.some((task) => task.frequency !== RecurrenceFrequency.ONCE && task.frequency !== RecurrenceFrequency.ANNUAL);
}
export function parseUpdateInspectionFormData(formData: FormData) {
  return parseInspectionFormData(formData);
}

async function validateSchedulingReferences(tx: Prisma.TransactionClient, tenantId: string, input: z.infer<typeof scheduleInspectionSchema>) {
  const uniqueAssignedTechnicianIds = normalizeAssignedTechnicianIds(input as { assignedTechnicianIds?: string[] | null; assignedTechnicianId?: string | null });
  const assignedTechnicianQuery = uniqueAssignedTechnicianIds.length
    ? "findMany" in tx.user && typeof tx.user.findMany === "function"
      ? tx.user.findMany({ where: { id: { in: uniqueAssignedTechnicianIds }, tenantId, role: "technician" } })
      : Promise.all(
          uniqueAssignedTechnicianIds.map((technicianId) =>
            tx.user.findFirst({ where: { id: technicianId, tenantId, role: "technician" } })
          )
        ).then((records) => records.filter((record): record is NonNullable<typeof records[number]> => Boolean(record)))
    : Promise.resolve([]);
  const [customerCompany, site, assignedTechnicians] = await Promise.all([
    tx.customerCompany.findFirst({ where: { id: input.customerCompanyId, tenantId } }),
    tx.site.findFirst({ where: { id: input.siteId, tenantId } }),
    assignedTechnicianQuery
  ]);

  if (!customerCompany || !site || site.customerCompanyId !== customerCompany.id) {
    throw new Error("Customer and site must belong to the same tenant record.");
  }

  if (assignedTechnicians.length !== uniqueAssignedTechnicianIds.length) {
    throw new Error("Assigned technicians must belong to the tenant.");
  }

  const assignedTechnicianIds = uniqueAssignedTechnicianIds.filter((technicianId) => assignedTechnicians.some((technician) => technician.id === technicianId));

  return {
    customerCompany,
    site,
    assignedTechnicianIds,
    primaryAssignedTechnicianId: assignedTechnicianIds[0] ?? null
  };
}

async function syncInspectionTechnicianAssignments(
  tx: Prisma.TransactionClient,
  inspectionId: string,
  tenantId: string,
  technicianIds: string[]
) {
  if (!("inspectionTechnicianAssignment" in tx) || !tx.inspectionTechnicianAssignment) {
    return;
  }

  await tx.inspectionTechnicianAssignment.deleteMany({
    where: { tenantId, inspectionId }
  });

  if (!technicianIds.length) {
    return;
  }

  await tx.inspectionTechnicianAssignment.createMany({
    data: technicianIds.map((technicianId) => ({
      tenantId,
      inspectionId,
      technicianId
    }))
  });
}

async function writeInspectionTasks(tx: Prisma.TransactionClient, inspectionId: string, tenantId: string, assignedTechnicianId: string | null, scheduledStart: Date, tasks: z.infer<typeof scheduleInspectionSchema>["tasks"]) {
  await Promise.all(
    tasks.map((task, index) =>
      createInspectionTaskWithReport({
        tx,
        tenantId,
        inspectionId,
        inspectionType: task.inspectionType,
        frequency: task.frequency,
        scheduledStart,
        taskStatus: InspectionStatus.to_be_completed,
        technicianId: assignedTechnicianId,
        sortOrder: index
      })
    )
  );
}

async function createInspectionTaskWithReport(input: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  inspectionId: string;
  inspectionType: keyof typeof inspectionTypeRegistry;
  frequency: RecurrenceFrequency;
  scheduledStart: Date;
  taskStatus: InspectionStatus;
  technicianId: string | null;
  sortOrder: number;
}) {
  const createdTask = await input.tx.inspectionTask.create({
    data: {
      tenantId: input.tenantId,
      inspectionId: input.inspectionId,
      inspectionType: input.inspectionType,
      status: input.taskStatus,
      sortOrder: input.sortOrder
    }
  });

  await Promise.all([
    input.tx.inspectionRecurrence.create({
      data: {
        tenantId: input.tenantId,
        inspectionTaskId: createdTask.id,
        frequency: input.frequency,
        nextDueAt: nextDueFrom(input.scheduledStart, input.frequency)
      }
    }),
    input.tx.inspectionReport.create({
      data: {
        tenantId: input.tenantId,
        inspectionId: input.inspectionId,
        inspectionTaskId: createdTask.id,
        technicianId: input.technicianId,
        contentJson: { narrative: "" }
      }
    })
  ]);

  return createdTask;
}

async function createAuditLog(tx: Prisma.TransactionClient, input: {
  tenantId: string | null;
  actorUserId: string;
  action: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: "Inspection",
      entityId: input.entityId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined
    }
  });
}

export async function createInspection(actor: ActorContext, input: z.infer<typeof scheduleInspectionSchema>) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only office administrators can create inspections.");
  }

  const tenantId = parsedActor.tenantId as string;

  if (requiresAdvancedRecurrence(input.tasks)) {
    await assertTenantEntitlementForTenant(tenantId, "advancedRecurrence", "Advanced recurrence schedules require a Professional or Enterprise subscription.");
  }

  return prisma.$transaction(async (tx) => {
    const { customerCompany, site, assignedTechnicianIds, primaryAssignedTechnicianId } = await validateSchedulingReferences(tx, tenantId, input);

    const inspection = await tx.inspection.create({
      data: {
        tenantId,
        customerCompanyId: customerCompany.id,
        siteId: site.id,
        assignedTechnicianId: primaryAssignedTechnicianId,
        createdByUserId: parsedActor.userId,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd ?? null,
        status: input.status,
        notes: input.notes,
        claimable: assignedTechnicianIds.length === 0
      }
    });

    await syncInspectionTechnicianAssignments(tx, inspection.id, tenantId, assignedTechnicianIds);
    await writeInspectionTasks(tx, inspection.id, tenantId, primaryAssignedTechnicianId, input.scheduledStart, input.tasks);
    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.created",
      entityId: inspection.id,
      metadata: {
        customerCompanyId: customerCompany.id,
        siteId: site.id,
        status: input.status,
        taskCount: input.tasks.length
      }
    });

    if (assignedTechnicianIds.length > 0) {
      await createAuditLog(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "inspection.assigned",
        entityId: inspection.id,
        metadata: {
          assignedTechnicianIds
        }
      });
    }

    return tx.inspection.findUniqueOrThrow({
      where: { id: inspection.id },
      include: {
        site: true,
        customerCompany: true,
        assignedTechnician: true,
        technicianAssignments: { include: { technician: true } },
        tasks: { include: { recurrence: true } }
      }
    });
  });
}

export async function updateInspection(actor: ActorContext, inspectionId: string, input: z.infer<typeof scheduleInspectionSchema>) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only office administrators can edit inspections.");
  }

  const tenantId = parsedActor.tenantId as string;

  if (requiresAdvancedRecurrence(input.tasks)) {
    await assertTenantEntitlementForTenant(tenantId, "advancedRecurrence", "Advanced recurrence schedules require a Professional or Enterprise subscription.");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.inspection.findFirst({
      where: { id: inspectionId, tenantId },
      include: { tasks: true, technicianAssignments: { select: { technicianId: true } } }
    });

    if (!existing) {
      throw new Error("Inspection not found.");
    }

    const reportActivityCount = await tx.inspectionReport.count({
      where: {
        tenantId,
        inspectionId,
        OR: [
          { autosaveVersion: { gt: 1 } },
          { status: ReportStatus.finalized },
          { attachments: { some: {} } },
          { signatures: { some: {} } },
          { deficiencies: { some: {} } }
        ]
      }
    });

    if (reportActivityCount > 0) {
      throw new Error("Inspection scheduling cannot be edited after report work has started. Create a follow-up visit instead.");
    }

    const { customerCompany, site, assignedTechnicianIds, primaryAssignedTechnicianId } = await validateSchedulingReferences(tx, tenantId, input);
    const effectiveTasks = mergeExistingDuplicateTasks(existing.tasks, input.tasks);
    const previousAssignedTechnicianIds = getInspectionAssignedTechnicianIds({
      assignedTechnicianId: existing.assignedTechnicianId,
      technicianAssignments: readTechnicianAssignments(existing)
    });

    await tx.attachment.deleteMany({ where: { tenantId, inspectionReport: { inspectionId } } });
    await tx.signature.deleteMany({ where: { tenantId, inspectionReport: { inspectionId } } });
    await tx.deficiency.deleteMany({ where: { tenantId, inspectionReport: { inspectionId } } });
    await tx.inspectionReport.deleteMany({ where: { tenantId, inspectionId } });
    await tx.inspectionRecurrence.deleteMany({ where: { tenantId, inspectionTask: { inspectionId } } });
    await tx.inspectionTask.deleteMany({ where: { tenantId, inspectionId } });

    await tx.inspection.update({
      where: { id: inspectionId },
      data: {
        customerCompanyId: customerCompany.id,
        siteId: site.id,
        assignedTechnicianId: primaryAssignedTechnicianId,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd ?? null,
        status: input.status,
        notes: input.notes,
        claimable: assignedTechnicianIds.length === 0
      }
    });

    await syncInspectionTechnicianAssignments(tx, inspectionId, tenantId, assignedTechnicianIds);
    await writeInspectionTasks(tx, inspectionId, tenantId, primaryAssignedTechnicianId, input.scheduledStart, effectiveTasks);

    const assignmentAction = getAssignmentAuditAction(previousAssignedTechnicianIds[0] ?? null, primaryAssignedTechnicianId);
    if (assignmentAction) {
      await createAuditLog(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        action: assignmentAction,
        entityId: inspectionId,
        metadata: {
          previousTechnicianIds: previousAssignedTechnicianIds,
          nextTechnicianIds: assignedTechnicianIds
        }
      });
    }

    return tx.inspection.findUniqueOrThrow({
      where: { id: inspectionId },
      include: {
        site: true,
        customerCompany: true,
        assignedTechnician: true,
        technicianAssignments: { include: { technician: true } },
        tasks: { include: { recurrence: true } }
      }
    });
  });
}

export async function updateInspectionStatus(actor: ActorContext, inspectionId: string, status: InspectionStatus) {
  const parsedActor = parseActor(actor);
  const tenantId = parsedActor.tenantId as string;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, tenantId },
    include: { technicianAssignments: { select: { technicianId: true } } }
  });
  if (!inspection) {
    throw new Error("Inspection not found.");
  }

  const canManageStatus =
    ["tenant_admin", "office_admin"].includes(parsedActor.role) ||
    (parsedActor.role === "technician" &&
      isTechnicianAssignedToInspection({
        userId: parsedActor.userId,
        assignedTechnicianId: inspection.assignedTechnicianId,
        technicianAssignments: readTechnicianAssignments(inspection)
      }));
  if (!canManageStatus) {
    throw new Error("You do not have access to update this inspection.");
  }

  if (status === InspectionStatus.completed) {
    const remainingDrafts = await prisma.inspectionReport.count({
      where: {
        tenantId,
        inspectionId,
        status: { not: ReportStatus.finalized }
      }
    });

    if (remainingDrafts > 0) {
      throw new Error("Finalize all inspection reports before marking the inspection completed.");
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.inspection.update({
      where: { id: inspectionId },
      data: { status }
    });

    if (status !== InspectionStatus.completed) {
      await tx.inspectionTask.updateMany({
        where: { tenantId, inspectionId, status: { not: InspectionStatus.completed } },
        data: { status }
      });
    }

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.status_updated",
      entityId: inspectionId,
      metadata: { status }
    });

    return updated;
  });
}

export async function addInspectionTask(actor: ActorContext, input: {
  inspectionId: string;
  inspectionType: keyof typeof inspectionTypeRegistry;
}) {
  const parsedActor = parseActor(actor);
  const tenantId = parsedActor.tenantId as string;

  return prisma.$transaction(async (tx) => {
    const inspection = await tx.inspection.findFirst({
      where: { id: input.inspectionId, tenantId },
      include: {
        technicianAssignments: { select: { technicianId: true } },
        tasks: { select: { sortOrder: true } }
      }
    });

    if (!inspection) {
      throw new Error("Inspection not found.");
    }

    const canAddTask =
      ["tenant_admin", "office_admin"].includes(parsedActor.role) ||
      (parsedActor.role === "technician" &&
        isTechnicianAssignedToInspection({
          userId: parsedActor.userId,
          assignedTechnicianId: inspection.assignedTechnicianId,
          technicianAssignments: readTechnicianAssignments(inspection)
        }));

    if (!canAddTask) {
      throw new Error("You do not have access to add report types to this inspection.");
    }

    if (inspection.status === InspectionStatus.completed || inspection.status === InspectionStatus.cancelled) {
      throw new Error("Report types can only be added to active inspections.");
    }

    const nextSortOrder = inspection.tasks.length > 0
      ? Math.max(...inspection.tasks.map((task) => task.sortOrder)) + 1
      : 0;
    const assignedTechnicianIds = getInspectionAssignedTechnicianIds({
      assignedTechnicianId: inspection.assignedTechnicianId,
      technicianAssignments: readTechnicianAssignments(inspection)
    });
    const defaultTechnicianId = parsedActor.role === "technician"
      ? parsedActor.userId
      : inspection.assignedTechnicianId ?? assignedTechnicianIds[0] ?? null;

    const createdTask = await createInspectionTaskWithReport({
      tx,
      tenantId,
      inspectionId: inspection.id,
      inspectionType: input.inspectionType,
      frequency: getDefaultInspectionRecurrenceFrequency(input.inspectionType),
      scheduledStart: inspection.scheduledStart,
      taskStatus: inspection.status === InspectionStatus.in_progress ? InspectionStatus.in_progress : InspectionStatus.to_be_completed,
      technicianId: defaultTechnicianId,
      sortOrder: nextSortOrder
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.task_added",
      entityId: inspection.id,
      metadata: {
        inspectionTaskId: createdTask.id,
        inspectionType: input.inspectionType
      }
    });

    return createdTask;
  });
}

async function getInspectionReportActivityCount(tx: Prisma.TransactionClient, tenantId: string, inspectionId: string) {
  return tx.inspectionReport.count({
    where: {
      tenantId,
      inspectionId,
      OR: [
        { autosaveVersion: { gt: 1 } },
        { status: ReportStatus.finalized },
        { attachments: { some: {} } },
        { signatures: { some: {} } },
        { deficiencies: { some: {} } }
      ]
    }
  });
}

async function getInspectionReportActivityCountMap(tenantId: string, inspectionIds: string[]) {
  if (!inspectionIds.length) {
    return new Map<string, number>();
  }

  const grouped = await prisma.inspectionReport.groupBy({
    by: ["inspectionId"],
    where: {
      tenantId,
      inspectionId: { in: inspectionIds },
      OR: [
        { autosaveVersion: { gt: 1 } },
        { status: ReportStatus.finalized },
        { attachments: { some: {} } },
        { signatures: { some: {} } },
        { deficiencies: { some: {} } }
      ]
    },
    _count: {
      _all: true
    }
  });

  return new Map(grouped.map((entry) => [entry.inspectionId, entry._count._all]));
}

function buildInspectionSnapshot(input: {
  id?: string;
  customerCompanyId: string;
  siteId: string;
  assignedTechnicianIds: string[];
  status: InspectionStatus;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  notes: string | null | undefined;
  tasks: Array<{ inspectionType: string; recurrence?: { frequency: RecurrenceFrequency | null } | null; frequency?: RecurrenceFrequency }>;
}) {
  return {
    inspectionId: input.id ?? null,
    customerCompanyId: input.customerCompanyId,
    siteId: input.siteId,
    assignedTechnicianIds: input.assignedTechnicianIds,
    status: input.status,
    scheduledStart: input.scheduledStart.toISOString(),
    scheduledEnd: input.scheduledEnd?.toISOString() ?? null,
    notes: input.notes ?? null,
    tasks: input.tasks.map((task) => ({
      inspectionType: task.inspectionType,
      frequency: task.frequency ?? task.recurrence?.frequency ?? getDefaultInspectionRecurrenceFrequency(task.inspectionType as keyof typeof inspectionTypeRegistry)
    }))
  };
}

export async function createInspectionAmendment(actor: ActorContext, inspectionId: string, input: z.infer<typeof scheduleInspectionSchema> & { reason: string }) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only office administrators can amend started inspections.");
  }

  const tenantId = parsedActor.tenantId as string;
  if (requiresAdvancedRecurrence(input.tasks)) {
    await assertTenantEntitlementForTenant(tenantId, "advancedRecurrence", "Advanced recurrence schedules require a Professional or Enterprise subscription.");
  }

  const reason = input.reason.trim();
  if (reason.length < 8) {
    throw new Error("Provide a brief amendment reason so the change history is understandable.");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.inspection.findFirst({
      where: { id: inspectionId, tenantId },
      include: {
        tasks: { include: { recurrence: true } },
        site: true,
        customerCompany: true,
        assignedTechnician: true,
        technicianAssignments: { include: { technician: true } }
      }
    });

    if (!existing) {
      throw new Error("Inspection not found.");
    }

    const priorAmendment = await tx.inspectionAmendment.findFirst({
      where: { tenantId, inspectionId },
      orderBy: { createdAt: "desc" }
    });

    if (priorAmendment) {
      throw new Error("This inspection already has an amendment. Update the replacement inspection instead of creating another replacement visit.");
    }

    const reportActivityCount = await getInspectionReportActivityCount(tx, tenantId, inspectionId);
    const hasStartedWork = !isInspectionInUnstartedState(existing.status) || reportActivityCount > 0;
    if (!hasStartedWork) {
      throw new Error("Use the standard edit workflow until inspection work has started.");
    }

    const { customerCompany, site, assignedTechnicianIds, primaryAssignedTechnicianId } = await validateSchedulingReferences(tx, tenantId, input);
    const effectiveTasks = mergeExistingDuplicateTasks(existing.tasks, input.tasks);
    const previousSnapshot = buildInspectionSnapshot({
      id: existing.id,
      customerCompanyId: existing.customerCompanyId,
      siteId: existing.siteId,
      assignedTechnicianIds: getInspectionAssignedTechnicianIds({
        assignedTechnicianId: existing.assignedTechnicianId,
        technicianAssignments: readTechnicianAssignments(existing)
      }),
      status: existing.status,
      scheduledStart: existing.scheduledStart,
      scheduledEnd: existing.scheduledEnd,
      notes: existing.notes,
      tasks: existing.tasks
    });
    const replacementSnapshot = buildInspectionSnapshot({
      customerCompanyId: customerCompany.id,
      siteId: site.id,
      assignedTechnicianIds,
      status: InspectionStatus.to_be_completed,
      scheduledStart: input.scheduledStart,
      scheduledEnd: input.scheduledEnd ?? null,
      notes: input.notes,
      tasks: effectiveTasks
    });

    const comparablePrevious = { ...previousSnapshot, inspectionId: null, status: InspectionStatus.to_be_completed };
    if (JSON.stringify(comparablePrevious) === JSON.stringify({ ...replacementSnapshot, inspectionId: null })) {
      throw new Error("No scheduling changes were detected for this amendment.");
    }

    const replacementInspection = await tx.inspection.create({
      data: {
        tenantId,
        customerCompanyId: customerCompany.id,
        siteId: site.id,
        assignedTechnicianId: primaryAssignedTechnicianId,
        createdByUserId: parsedActor.userId,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd ?? null,
        status: InspectionStatus.to_be_completed,
        notes: input.notes,
        claimable: assignedTechnicianIds.length === 0
      }
    });

    await syncInspectionTechnicianAssignments(tx, replacementInspection.id, tenantId, assignedTechnicianIds);
    await writeInspectionTasks(tx, replacementInspection.id, tenantId, primaryAssignedTechnicianId, input.scheduledStart, effectiveTasks);

    const amendmentType = JSON.stringify(previousSnapshot.assignedTechnicianIds) !== JSON.stringify(assignedTechnicianIds)
      ? "reassignment"
      : existing.scheduledStart.getTime() !== input.scheduledStart.getTime() || (existing.scheduledEnd?.getTime() ?? null) !== (input.scheduledEnd?.getTime() ?? null)
        ? "reschedule"
        : "scope_change";

    const amendment = await tx.inspectionAmendment.create({
      data: {
        tenantId,
        inspectionId,
        replacementInspectionId: replacementInspection.id,
        createdByUserId: parsedActor.userId,
        type: amendmentType,
        reason,
        previousSnapshot: previousSnapshot as Prisma.InputJsonValue,
        replacementSnapshot: { ...replacementSnapshot, inspectionId: replacementInspection.id } as Prisma.InputJsonValue
      }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.amendment_created",
      entityId: inspectionId,
      metadata: {
        amendmentId: amendment.id,
        replacementInspectionId: replacementInspection.id,
        amendmentType,
        reason
      }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.amendment_replacement_created",
      entityId: replacementInspection.id,
      metadata: {
        amendmentId: amendment.id,
        originalInspectionId: inspectionId,
        amendmentType,
        reason
      }
    });

    if (assignedTechnicianIds.length > 0) {
      await createAuditLog(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "inspection.assigned",
        entityId: replacementInspection.id,
        metadata: {
          assignedTechnicianIds,
          amendmentId: amendment.id
        }
      });
    }

    return tx.inspection.findUniqueOrThrow({
      where: { id: replacementInspection.id },
      include: {
        site: true,
        customerCompany: true,
        assignedTechnician: true,
        technicianAssignments: { include: { technician: true } },
        tasks: { include: { recurrence: true } }
      }
    });
  });
}

export async function getInspectionForEdit(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only tenant and office administrators can view amendment details.");
  }

  const tenantId = parsedActor.tenantId as string;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, tenantId },
    include: {
      tasks: {
        include: {
          recurrence: true,
          report: {
            include: {
              correctionRequestedBy: { select: { id: true, name: true } },
              correctionResolvedBy: { select: { id: true, name: true } },
              correctionEvents: {
                include: {
                  actedBy: { select: { id: true, name: true } }
                },
                orderBy: { createdAt: "desc" }
              }
            }
          }
        }
      },
      site: true,
      customerCompany: true,
      assignedTechnician: true,
      technicianAssignments: { include: { technician: true } },
      replacementAmendments: {
        include: {
          inspection: {
            include: {
              site: true,
              assignedTechnician: true,
              technicianAssignments: { include: { technician: true } }
            }
          }
        }
      },
      amendments: {
        include: {
          replacementInspection: {
            include: {
              site: true,
              assignedTechnician: true,
              technicianAssignments: { include: { technician: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!inspection) {
    return null;
  }

  const reportActivityCount = await prisma.inspectionReport.count({
    where: {
      tenantId,
      inspectionId,
      OR: [
        { autosaveVersion: { gt: 1 } },
        { status: ReportStatus.finalized },
        { attachments: { some: {} } },
        { signatures: { some: {} } },
        { deficiencies: { some: {} } }
      ]
    }
  });

  const auditTrail = await prisma.auditLog.findMany({
    where: {
      tenantId,
      OR: [
        { entityType: "Inspection", entityId: inspectionId },
        { entityType: "Attachment", metadata: { path: ["inspectionId"], equals: inspectionId } },
        { entityType: "InspectionDocument", metadata: { path: ["inspectionId"], equals: inspectionId } }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 12
  });

  const originalAmendment = inspection.replacementAmendments[0] ?? null;
  const outgoingAmendment = inspection.amendments[0] ?? null;
  const deficiencies = await prisma.deficiency.findMany({
    where: { tenantId, inspectionId },
    orderBy: [{ createdAt: "desc" }]
  });
  const lifecycle = deriveInspectionLifecycle({
    hasIncomingAmendment: Boolean(originalAmendment),
    hasOutgoingAmendment: Boolean(outgoingAmendment),
    hasStartedWork: reportActivityCount > 0 || !isInspectionInUnstartedState(inspection.status)
  });

  return {
    ...inspection,
    originalAmendment,
    outgoingAmendment,
    lifecycle,
    displayStatus: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart }),
    assignedTechnicianNames: formatAssignedTechnicianNames({
      assignedTechnician: inspection.assignedTechnician,
      technicianAssignments: readTechnicianNameAssignments(inspection)
    }),
    auditTrail,
    deficiencies,
    deficiencyCount: deficiencies.length,
    reportActivityCount,
    hasStartedWork: !isInspectionInUnstartedState(inspection.status) || reportActivityCount > 0
  };
}

export async function getAdminDashboardData(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only tenant and office administrators can access the scheduling dashboard.");
  }

  const tenantId = parsedActor.tenantId as string;

  const [customers, sites, technicians, activeInspections, completedInspections, siteCount, unassignedInspections, totalInspections, completedInspectionCount] = await Promise.all([
    prisma.customerCompany.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.site.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId, role: "technician" }, orderBy: { name: "asc" } }),
    prisma.inspection.findMany({
      where: { tenantId, status: { not: InspectionStatus.completed } },
      include: {
        site: true,
        customerCompany: true,
        assignedTechnician: true,
        technicianAssignments: { include: { technician: true } },
        tasks: { include: { recurrence: true } },
        amendments: {
          select: {
            id: true,
            replacementInspectionId: true
          }
        },
        replacementAmendments: {
          select: {
            id: true,
            inspectionId: true
          }
        }
      },
      orderBy: [{ scheduledStart: "asc" }],
      take: 12
    }),
    prisma.inspection.findMany({
      where: { tenantId, status: InspectionStatus.completed },
      include: {
        site: true,
        customerCompany: true,
        billingSummary: {
          select: {
            status: true
          }
        },
        assignedTechnician: true,
        technicianAssignments: { include: { technician: true } },
        tasks: { include: { recurrence: true } },
        amendments: {
          select: {
            id: true,
            replacementInspectionId: true
          }
        },
        replacementAmendments: {
          select: {
            id: true,
            inspectionId: true
          }
        }
      },
      orderBy: [{ scheduledStart: "desc" }],
      take: 20
    }),
    prisma.site.count({ where: { tenantId } }),
    prisma.inspection.count({ where: { tenantId, assignedTechnicianId: null, technicianAssignments: { none: {} }, claimable: true, status: { in: [...claimableInspectionStatuses] } } }),
    prisma.inspection.count({ where: { tenantId } }),
    prisma.inspection.count({ where: { tenantId, status: InspectionStatus.completed } })
  ]);

  const inspections = [...activeInspections, ...completedInspections];
  const reportActivityCounts = await getInspectionReportActivityCountMap(tenantId, inspections.map((inspection) => inspection.id));

  function mapInspectionForDashboard<
    T extends (typeof inspections)[number]
  >(inspection: T) {
    const inspectionWithOptionalBillingSummary = inspection as T & {
      billingSummary?: { status?: string | null } | null;
    };

    return {
      ...inspection,
      tasks: withInspectionTaskDisplayLabels(inspection.tasks),
      displayStatus: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart }),
      billingStatus: inspectionWithOptionalBillingSummary.billingSummary?.status ?? null,
      assignedTechnicianNames: formatAssignedTechnicianNames({
        assignedTechnician: inspection.assignedTechnician,
        technicianAssignments: readTechnicianNameAssignments(inspection)
      }),
      lifecycle: deriveInspectionLifecycle({
        hasIncomingAmendment: inspection.replacementAmendments.length > 0,
        hasOutgoingAmendment: inspection.amendments.length > 0,
        hasStartedWork: (reportActivityCounts.get(inspection.id) ?? 0) > 0 || !isInspectionInUnstartedState(inspection.status)
      })
    };
  }

  return {
    customers: customers.map((customer) => ({ id: customer.id, name: customer.name })),
    sites: sites.map((site) => ({ id: site.id, name: site.name, city: site.city, customerCompanyId: site.customerCompanyId })),
    technicians: technicians.map((technician) => ({ id: technician.id, name: technician.name })),
    inspections: activeInspections.map(mapInspectionForDashboard),
    activeInspections: activeInspections.map(mapInspectionForDashboard),
    completedInspections: completedInspections.map(mapInspectionForDashboard),
    summary: {
      upcomingInspections: totalInspections,
      unassignedInspections,
      siteCount,
      completedInspections: completedInspectionCount
    }
  };
}

export async function getAdminAmendmentManagementData(
  actor: ActorContext,
  input?: { lifecycle?: "all" | AdminInspectionLifecycle }
) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only tenant and office administrators can access amendment management.");
  }

  const tenantId = parsedActor.tenantId as string;
  const lifecycleFilter = adminInspectionLifecycleFilterSchema.parse(input?.lifecycle ?? "all");

  const inspections = await prisma.inspection.findMany({
    where: { tenantId },
    include: {
      site: true,
      customerCompany: true,
      assignedTechnician: true,
      technicianAssignments: { include: { technician: true } },
      amendments: {
        include: {
          replacementInspection: {
            include: {
              site: true,
              assignedTechnician: true,
              technicianAssignments: { include: { technician: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      },
      replacementAmendments: {
        include: {
          inspection: {
            include: {
              site: true,
              assignedTechnician: true,
              technicianAssignments: { include: { technician: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: [{ scheduledStart: "desc" }]
  });

  const inspectionIds = inspections.map((inspection) => inspection.id);
  const [reportActivityCounts, auditEntries] = await Promise.all([
    getInspectionReportActivityCountMap(tenantId, inspectionIds),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: "Inspection",
        entityId: { in: inspectionIds },
        action: {
          in: [
            "inspection.amendment_created",
            "inspection.amendment_replacement_created",
            "inspection.assigned",
            "inspection.unassigned",
            "inspection.status_updated"
          ]
        }
      },
      orderBy: [{ createdAt: "desc" }]
    })
  ]);

  const latestAuditByInspectionId = new Map<string, (typeof auditEntries)[number]>();
  for (const entry of auditEntries) {
    if (!latestAuditByInspectionId.has(entry.entityId)) {
      latestAuditByInspectionId.set(entry.entityId, entry);
    }
  }

  const lifecycleCounts = {
    original: 0,
    amended: 0,
    replacement: 0,
    superseded: 0
  } satisfies Record<AdminInspectionLifecycle, number>;

  const items = inspections.map((inspection) => {
    const originalAmendment = inspection.replacementAmendments[0] ?? null;
    const outgoingAmendment = inspection.amendments[0] ?? null;
    const hasStartedWork = (reportActivityCounts.get(inspection.id) ?? 0) > 0 || !isInspectionInUnstartedState(inspection.status);
    const lifecycle = deriveInspectionLifecycle({
      hasIncomingAmendment: Boolean(originalAmendment),
      hasOutgoingAmendment: Boolean(outgoingAmendment),
      hasStartedWork
    });
    lifecycleCounts[lifecycle] += 1;

    return {
      ...inspection,
      lifecycle,
      displayStatus: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart }),
      assignedTechnicianNames: formatAssignedTechnicianNames({
        assignedTechnician: inspection.assignedTechnician,
        technicianAssignments: readTechnicianNameAssignments(inspection)
      }),
      hasStartedWork,
      reportActivityCount: reportActivityCounts.get(inspection.id) ?? 0,
      originalAmendment,
      outgoingAmendment,
      latestAuditEntry: latestAuditByInspectionId.get(inspection.id) ?? null
    };
  }).filter((inspection) => lifecycleFilter === "all" || inspection.lifecycle === lifecycleFilter);

  return {
    lifecycleFilter,
    lifecycleCounts,
    items
  };
}

function buildMonthCalendar(inspections: Array<{ scheduledStart: Date; status: InspectionStatus; site: { name: string } }>) {
  return inspections.map((inspection) => ({
    dayKey: format(inspection.scheduledStart, "yyyy-MM-dd"),
    label: format(inspection.scheduledStart, "MMM d"),
    siteName: inspection.site.name,
    status: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart })
  }));
}

export async function getTechnicianDashboardData(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (parsedActor.role !== "technician") {
    throw new Error("Only technicians can access the technician dashboard.");
  }

  const tenantId = parsedActor.tenantId as string;
  const now = new Date();
  const dayStart = startOfDay(now);
  const weekEnd = endOfWeek(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [assignedInspections, unassignedInspections] = await Promise.all([
    prisma.inspection.findMany({
      where: {
        tenantId,
        status: { not: InspectionStatus.completed },
        OR: [
          { assignedTechnicianId: parsedActor.userId },
          { technicianAssignments: { some: { technicianId: parsedActor.userId } } }
        ]
      },
      include: {
        site: true,
        customerCompany: true,
        assignedTechnician: true,
        technicianAssignments: { include: { technician: true } },
        tasks: { include: { recurrence: true, report: true } },
        documents: {
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            label: true,
            fileName: true,
            requiresSignature: true,
            status: true,
            signedAt: true
          }
        }
      },
      orderBy: [{ scheduledStart: "asc" }]
    }),
    prisma.inspection.findMany({
      where: { tenantId, assignedTechnicianId: null, technicianAssignments: { none: {} }, claimable: true, status: { in: [...claimableInspectionStatuses] } },
      include: { site: true, customerCompany: true, assignedTechnician: true, technicianAssignments: { include: { technician: true } }, tasks: { include: { recurrence: true, report: true } } },
      orderBy: [{ scheduledStart: "asc" }]
    })
  ]);

  const monthAssigned = assignedInspections.filter((inspection) => inspection.scheduledStart >= monthStart && inspection.scheduledStart <= monthEnd);

  return {
    today: assignedInspections.filter((inspection) => isSameDay(inspection.scheduledStart, now)),
    thisWeek: assignedInspections.filter((inspection) => inspection.scheduledStart >= dayStart && inspection.scheduledStart <= weekEnd),
    thisMonth: monthAssigned,
    assigned: assignedInspections.map((inspection) => ({
      ...inspection,
      tasks: withInspectionTaskDisplayLabels(inspection.tasks),
      displayStatus: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart }),
      assignedTechnicianNames: formatAssignedTechnicianNames({
        assignedTechnician: inspection.assignedTechnician,
        technicianAssignments: readTechnicianNameAssignments(inspection)
      })
    })),
    unassigned: unassignedInspections.map((inspection) => ({
      ...inspection,
      tasks: withInspectionTaskDisplayLabels(inspection.tasks),
      displayStatus: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart }),
      assignedTechnicianNames: formatAssignedTechnicianNames({
        assignedTechnician: inspection.assignedTechnician,
        technicianAssignments: readTechnicianNameAssignments(inspection)
      })
    })),
    monthCalendar: buildMonthCalendar(monthAssigned)
  };
}

export async function claimInspection(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  if (parsedActor.role !== "technician") {
    throw new Error("Only technicians can claim inspections.");
  }

  const tenantId = parsedActor.tenantId as string;

  return prisma.$transaction(async (tx) => {
    const inspection = await tx.inspection.findFirst({
      where: { id: inspectionId, tenantId },
      include: { tasks: true, technicianAssignments: { select: { technicianId: true } } }
    });

    if (!inspection || !canTechnicianClaimInspection({
      actorTenantId: tenantId,
      inspectionTenantId: inspection.tenantId,
      assignedTechnicianIds: getInspectionAssignedTechnicianIds({
        assignedTechnicianId: inspection.assignedTechnicianId,
        technicianAssignments: readTechnicianAssignments(inspection)
      }),
      claimable: inspection.claimable,
      status: inspection.status
    })) {
      throw new Error("Inspection is not claimable.");
    }

    const claimed = await tx.inspection.updateMany({
      where: {
        id: inspectionId,
        tenantId,
        assignedTechnicianId: null,
        technicianAssignments: { none: {} },
        claimable: true,
        status: { in: [...claimableInspectionStatuses] }
      },
      data: {
        assignedTechnicianId: parsedActor.userId,
        claimable: false,
        status: inspection.status
      }
    });

    if (claimed.count !== 1) {
      throw new Error("This inspection was already claimed by another technician.");
    }

    await tx.inspectionReport.updateMany({
      where: { tenantId, inspectionId },
      data: { technicianId: parsedActor.userId }
    });
    await syncInspectionTechnicianAssignments(tx, inspectionId, tenantId, [parsedActor.userId]);

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.claimed",
      entityId: inspectionId,
      metadata: {
        claimedByUserId: parsedActor.userId
      }
    });

    return tx.inspection.findUniqueOrThrow({
      where: { id: inspectionId },
      include: {
        site: true,
        customerCompany: true,
        assignedTechnician: true,
        technicianAssignments: { include: { technician: true } },
        tasks: { include: { recurrence: true } }
      }
    });
  });
}
