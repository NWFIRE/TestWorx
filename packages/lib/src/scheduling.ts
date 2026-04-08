import { addMonths, endOfMonth, endOfWeek, format, isAfter, isSameDay, startOfDay, startOfMonth } from "date-fns";
import {
  InspectionClassification,
  InspectionCloseoutRequestStatus,
  InspectionCloseoutRequestType,
  InspectionStatus,
  Prisma,
  RecurrenceFrequency
} from "@prisma/client";
import { prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema, reportStatuses } from "@testworx/types";

import { assertTenantContext } from "./permissions";
import { assertTenantEntitlementForTenant } from "./billing";
import type { JsonInputValue, JsonObject } from "./json-types";
import { getDefaultInspectionRecurrenceFrequency, inspectionTypeRegistry } from "./report-config";
import { deleteStoredFile } from "./storage";

const inspectionTypeEnum = z.enum(Object.keys(inspectionTypeRegistry) as [keyof typeof inspectionTypeRegistry, ...(keyof typeof inspectionTypeRegistry)[]]);
export const inspectionClassificationValues = [
  "standard",
  "call_in",
  "follow_up",
  "emergency"
] as const;
export type InspectionClassificationValue = (typeof inspectionClassificationValues)[number];
const inspectionClassificationSchema = z.enum(inspectionClassificationValues);
export const inspectionPriorityFilterValues = ["all", "priority", "non_priority"] as const;
export type InspectionPriorityFilterValue = (typeof inspectionPriorityFilterValues)[number];
export const inspectionFilterStatuses = [
  "to_be_completed",
  "scheduled",
  "in_progress",
  "completed",
  "invoiced",
  "cancelled",
  "follow_up_required"
] as const;
export type InspectionFilterStatus = (typeof inspectionFilterStatuses)[number];
export const editableInspectionStatuses = [
  "to_be_completed",
  "scheduled",
  "in_progress",
  "completed",
  "invoiced",
  "cancelled",
  "follow_up_required"
] as const;
const editableInspectionStatusSchema = z.enum(editableInspectionStatuses);
export const inspectionTaskSchedulingStatuses = [
  "due_now",
  "scheduled_now",
  "scheduled_future",
  "not_scheduled",
  "completed",
  "deferred"
] as const;
export type InspectionTaskSchedulingStatus = (typeof inspectionTaskSchedulingStatuses)[number];
const inspectionTaskSchedulingStatusSchema = z.enum(inspectionTaskSchedulingStatuses);
export const adminInspectionLifecycleValues = ["original", "amended", "replacement", "superseded"] as const;
export type AdminInspectionLifecycle = (typeof adminInspectionLifecycleValues)[number];
const adminInspectionLifecycleFilterSchema = z.enum(["all", ...adminInspectionLifecycleValues]);
export const inspectionCloseoutRequestTypes = ["new_inspection", "follow_up_inspection"] as const;
export type InspectionCloseoutRequestTypeValue = (typeof inspectionCloseoutRequestTypes)[number];
const inspectionCloseoutRequestTypeSchema = z.enum(inspectionCloseoutRequestTypes);
export const inspectionCloseoutRequestStatuses = ["pending", "approved", "dismissed"] as const;
export type InspectionCloseoutRequestStatusValue = (typeof inspectionCloseoutRequestStatuses)[number];
export const inspectionReviewFilters = ["needs_review", "pending_follow_up_request", "approved_created", "dismissed", "has_amendment_linkage"] as const;
export type InspectionReviewFilterValue = (typeof inspectionReviewFilters)[number];
const inspectionReviewFilterSchema = z.enum(["all", ...inspectionReviewFilters]);
export const unstartedInspectionStatuses = [InspectionStatus.to_be_completed, InspectionStatus.scheduled] as const;
export const claimableInspectionStatuses = [InspectionStatus.to_be_completed, InspectionStatus.scheduled] as const;
export const activeOperationalInspectionStatuses = [
  InspectionStatus.to_be_completed,
  InspectionStatus.scheduled,
  InspectionStatus.in_progress,
  InspectionStatus.follow_up_required
] as const;
export const completedOperationalInspectionStatuses = [
  InspectionStatus.completed,
  InspectionStatus.invoiced
] as const;
export const terminalInspectionStatuses = [
  InspectionStatus.completed,
  InspectionStatus.invoiced,
  InspectionStatus.cancelled
] as const;
export const genericInspectionSiteOptionValue = "__generic_site__";
export const genericInspectionSiteName = "General / No Fixed Site";
export const customInspectionSiteOptionValue = "__custom_site__";
export const customInspectionSiteName = "Create one-time site";
const genericInspectionSiteAddressLine1 = "No fixed service address";
const genericInspectionSiteCity = "Unknown";
const genericInspectionSiteState = "Unknown";
const genericInspectionSitePostalCode = "Unknown";
export const inspectionStatusLabels: Record<InspectionStatus | "past_due", string> = {
  to_be_completed: "To Be Completed",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
  follow_up_required: "Follow-Up Required",
  past_due: "Past Due"
};
export const inspectionClassificationLabels: Record<InspectionClassificationValue, string> = {
  standard: "Standard",
  call_in: "Call-In",
  follow_up: "Follow-Up",
  emergency: "Emergency"
};
export const inspectionCloseoutRequestTypeLabels: Record<InspectionCloseoutRequestTypeValue, string> = {
  new_inspection: "New inspection",
  follow_up_inspection: "Follow-up inspection"
};
export const inspectionCloseoutRequestStatusLabels: Record<InspectionCloseoutRequestStatusValue, string> = {
  pending: "Pending",
  approved: "Approved",
  dismissed: "Dismissed"
};

const inspectionCloseoutRequestSchema = z.discriminatedUnion("requestType", [
  z.object({
    requestType: z.literal("none")
  }),
  z.object({
    requestType: inspectionCloseoutRequestTypeSchema,
    note: z.string().trim().min(5, "Add a short note so office staff knows what to schedule next.").max(2000)
  })
]);

const currentVisitTaskSchedulingStatuses = new Set<InspectionTaskSchedulingStatus>([
  "due_now",
  "scheduled_now",
  "completed",
  "deferred"
]);

export const scheduleInspectionSchema = z.object({
  customerCompanyId: z.string().min(1, "Select a customer before creating the inspection."),
  siteId: z.string().min(1, "Select a site before creating the inspection."),
  inspectionClassification: inspectionClassificationSchema.default("standard"),
  isPriority: z.boolean().default(false),
  inspectionMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.union([z.null(), z.coerce.date()]).optional(),
  assignedTechnicianIds: z.array(z.string()).default([]),
  status: editableInspectionStatusSchema.default("to_be_completed"),
  notes: z.string().max(2000).optional(),
  tasks: z.array(
    z.object({
      inspectionType: inspectionTypeEnum,
      frequency: z.nativeEnum(RecurrenceFrequency),
      assignedTechnicianId: z.string().optional().nullable(),
      dueMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
      dueDate: z.union([z.null(), z.coerce.date()]).optional(),
      schedulingStatus: inspectionTaskSchedulingStatusSchema.default("scheduled_now"),
      notes: z.string().max(1000).optional()
    })
  ).min(1, "Select at least one inspection type.")
}).superRefine((input, context) => {
  if (input.scheduledEnd && input.scheduledEnd <= input.scheduledStart) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Scheduled end must be after the scheduled start.", path: ["scheduledEnd"] });
  }

  const currentVisitStatuses: InspectionTaskSchedulingStatus[] = ["due_now", "scheduled_now"];
  const seen = new Set<string>();
  input.tasks.forEach((task, index) => {
    const normalizedDueMonth =
      task.dueMonth ||
      (task.dueDate instanceof Date && !Number.isNaN(task.dueDate.getTime())
        ? `${task.dueDate.getFullYear()}-${String(task.dueDate.getMonth() + 1).padStart(2, "0")}`
        : "");

    if (!normalizedDueMonth && !(task.dueDate instanceof Date && !Number.isNaN(task.dueDate.getTime()))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each service line needs a due month or due date.",
        path: ["tasks", index, "dueMonth"]
      });
    }

    if (currentVisitStatuses.includes(task.schedulingStatus) && !task.assignedTechnicianId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Assign a technician to any service scheduled for this visit.",
        path: ["tasks", index, "assignedTechnicianId"]
      });
    }

    const duplicateKey = [
      task.inspectionType,
      normalizedDueMonth,
      task.dueDate instanceof Date && !Number.isNaN(task.dueDate.getTime()) ? task.dueDate.toISOString() : "",
      task.schedulingStatus
    ].join("|");
    if (seen.has(duplicateKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate service lines on the same visit need different due timing or status.",
        path: ["tasks", index, "inspectionType"]
      });
    }
    seen.add(duplicateKey);
  });
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

export function formatInspectionTaskSchedulingStatusLabel(status: InspectionTaskSchedulingStatus) {
  switch (status) {
    case "due_now":
      return "Due now";
    case "scheduled_now":
      return "Schedule for this visit";
    case "scheduled_future":
      return "Scheduled for future";
    case "not_scheduled":
      return "Track for later";
    case "completed":
      return "Completed";
    case "deferred":
      return "Deferred";
    default:
      return String(status).replaceAll("_", " ");
  }
}

export function formatInspectionClassificationLabel(classification: InspectionClassification | InspectionClassificationValue) {
  return inspectionClassificationLabels[classification as InspectionClassificationValue];
}

export function getInspectionClassificationTone(classification: InspectionClassification | InspectionClassificationValue) {
  switch (classification) {
    case "call_in":
      return "blue" as const;
    case "follow_up":
      return "violet" as const;
    case "emergency":
      return "rose" as const;
    case "standard":
    default:
      return "slate" as const;
  }
}

export function formatInspectionPriorityLabel(isPriority: boolean) {
  return isPriority ? "Priority" : "Standard priority";
}

export function getInspectionPriorityTone(isPriority: boolean) {
  return isPriority ? ("amber" as const) : ("slate" as const);
}

export function formatInspectionCloseoutRequestTypeLabel(requestType: InspectionCloseoutRequestType | InspectionCloseoutRequestTypeValue) {
  return inspectionCloseoutRequestTypeLabels[requestType as InspectionCloseoutRequestTypeValue];
}

export function formatInspectionCloseoutRequestStatusLabel(status: InspectionCloseoutRequestStatus | InspectionCloseoutRequestStatusValue) {
  return inspectionCloseoutRequestStatusLabels[status as InspectionCloseoutRequestStatusValue];
}

export function getInspectionCloseoutRequestTone(status: InspectionCloseoutRequestStatus | InspectionCloseoutRequestStatusValue) {
  switch (status) {
    case "approved":
      return "emerald" as const;
    case "dismissed":
      return "slate" as const;
    case "pending":
    default:
      return "blue" as const;
  }
}

export function isCurrentVisitTaskSchedulingStatus(status?: string | null) {
  return Boolean(status && currentVisitTaskSchedulingStatuses.has(status as InspectionTaskSchedulingStatus));
}

function normalizeTaskDueMonth(input: { dueMonth?: string | null; dueDate?: Date | null; fallbackMonth?: string | null }) {
  if (input.dueMonth) {
    return input.dueMonth;
  }
  if (input.dueDate instanceof Date && !Number.isNaN(input.dueDate.getTime())) {
    return `${input.dueDate.getFullYear()}-${String(input.dueDate.getMonth() + 1).padStart(2, "0")}`;
  }
  return input.fallbackMonth ?? null;
}

export function isGenericInspectionSiteName(siteName: string | null | undefined) {
  return (siteName ?? "").trim() === genericInspectionSiteName;
}

export function getInspectionDisplayLabels(input: {
  siteName: string | null | undefined;
  customerName: string | null | undefined;
}) {
  const siteName = (input.siteName ?? "").trim();
  const customerName = (input.customerName ?? "").trim();
  const isGenericSite = isGenericInspectionSiteName(siteName);

  return {
    isGenericSite,
    primaryTitle: isGenericSite && customerName ? customerName : siteName || customerName || "Untitled inspection",
    secondaryTitle: isGenericSite ? genericInspectionSiteName : customerName
  };
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
): ScheduledInspectionTaskInput[] {
  if (nextTasks.some((task) => task.dueMonth || task.dueDate || task.assignedTechnicianId || task.notes || task.schedulingStatus)) {
    return nextTasks.map((task) => ({
      ...task,
      schedulingStatus: task.schedulingStatus ?? "scheduled_now"
    }));
  }

  const existingCounts = new Map<keyof typeof inspectionTypeRegistry, number>();
  for (const task of existingTasks) {
    existingCounts.set(task.inspectionType, (existingCounts.get(task.inspectionType) ?? 0) + 1);
  }

  return nextTasks.flatMap((task) => {
    const existingCount = existingCounts.get(task.inspectionType) ?? 0;
    const desiredCount = Math.max(existingCount, 1);
    return Array.from({ length: desiredCount }, () => ({
      inspectionType: task.inspectionType,
      frequency: task.frequency,
      assignedTechnicianId: task.assignedTechnicianId ?? null,
      dueMonth: task.dueMonth ?? null,
      dueDate: task.dueDate ?? null,
      schedulingStatus: task.schedulingStatus ?? "scheduled_now",
      notes: task.notes
    }));
  });
}

type ScheduledInspectionTaskInput = z.infer<typeof scheduleInspectionSchema>["tasks"][number] & {
  recurrenceSeriesId?: string | null;
  recurrenceAnchorScheduledStart?: Date | null;
  recurrenceNextDueAt?: Date | null;
};

function mapRecurringTaskDefinitions(input: {
  existingTasks: Array<{
    id: string;
    inspectionType: keyof typeof inspectionTypeRegistry;
    recurrence?: {
      id: string;
      frequency: RecurrenceFrequency;
      seriesId?: string | null;
      anchorScheduledStart?: Date | null;
      nextDueAt?: Date | null;
    } | null;
  }>;
  nextTasks: z.infer<typeof scheduleInspectionSchema>["tasks"];
  scheduledStart: Date;
  mode: "reset_anchor" | "preserve_anchor";
  fallbackAnchorScheduledStart?: Date;
}) {
  const taskQueues = new Map<keyof typeof inspectionTypeRegistry, typeof input.existingTasks>();
  for (const task of input.existingTasks) {
    const queue = taskQueues.get(task.inspectionType) ?? [];
    queue.push(task);
    taskQueues.set(task.inspectionType, queue);
  }

  return input.nextTasks.map((task) => {
    const queue = taskQueues.get(task.inspectionType) ?? [];
    const existingTask = queue.shift();
    if (!existingTask?.recurrence) {
      return task;
    }

    const anchorScheduledStart = input.mode === "preserve_anchor"
      ? existingTask.recurrence.anchorScheduledStart ?? input.fallbackAnchorScheduledStart ?? input.scheduledStart
      : input.scheduledStart;
    const recurrenceNextDueAt = input.mode === "preserve_anchor" && existingTask.recurrence.frequency === task.frequency
      ? existingTask.recurrence.nextDueAt ?? nextDueFrom(anchorScheduledStart, task.frequency)
      : nextDueFrom(anchorScheduledStart, task.frequency);

    return {
      ...task,
      recurrenceSeriesId: existingTask.recurrence.seriesId ?? existingTask.recurrence.id ?? existingTask.id,
      recurrenceAnchorScheduledStart: anchorScheduledStart,
      recurrenceNextDueAt
    } satisfies ScheduledInspectionTaskInput;
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
  if (isTerminalInspectionStatus(input.status)) {
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

export function isActiveOperationalInspectionStatus(status: InspectionStatus) {
  return activeOperationalInspectionStatuses.includes(status as (typeof activeOperationalInspectionStatuses)[number]);
}

export function isTerminalInspectionStatus(status: InspectionStatus) {
  return terminalInspectionStatuses.includes(status as (typeof terminalInspectionStatuses)[number]);
}

export function formatInspectionStatusLabel(status: InspectionStatus | "past_due") {
  return inspectionStatusLabels[status];
}

export function getInspectionStatusTone(status: InspectionStatus | "past_due") {
  switch (status) {
    case "scheduled":
      return "blue" as const;
    case "in_progress":
    case "follow_up_required":
      return "amber" as const;
    case "completed":
      return "emerald" as const;
    case "invoiced":
      return "violet" as const;
    case "cancelled":
    case "past_due":
      return "rose" as const;
    case "to_be_completed":
    default:
      return "slate" as const;
  }
}

function inspectionClassificationFromFilterValue(value: string): InspectionClassificationValue[] {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "all") {
    return [];
  }

  return inspectionClassificationValues.includes(normalized as InspectionClassificationValue)
    ? [normalized as InspectionClassificationValue]
    : [];
}

export function normalizeInspectionClassificationFilters(
  input?: string | string[] | null
): InspectionClassificationValue[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];

  const normalized = new Set<InspectionClassificationValue>();
  for (const value of values) {
    for (const resolved of inspectionClassificationFromFilterValue(value)) {
      normalized.add(resolved);
    }
  }

  return [...normalized];
}

export function normalizeInspectionPriorityFilter(input?: string | null): InspectionPriorityFilterValue {
  const normalized = (input ?? "all").trim().toLowerCase();
  return inspectionPriorityFilterValues.includes(normalized as InspectionPriorityFilterValue)
    ? (normalized as InspectionPriorityFilterValue)
    : "all";
}

function inspectionStatusFromFilterValue(value: string): InspectionFilterStatus[] {
  switch (value.trim().toLowerCase()) {
    case "":
    case "all":
      return [];
    case "open":
      return [...activeOperationalInspectionStatuses];
    default:
      return inspectionFilterStatuses.includes(value.trim().toLowerCase() as InspectionFilterStatus)
        ? [value.trim().toLowerCase() as InspectionFilterStatus]
        : [];
  }
}

export function normalizeInspectionStatusFilters(
  input?: string | string[] | null
): InspectionFilterStatus[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];

  const normalized = new Set<InspectionFilterStatus>();
  for (const value of values) {
    for (const resolved of inspectionStatusFromFilterValue(value)) {
      normalized.add(resolved);
    }
  }

  return [...normalized];
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

function hasRiskyInspectionAccountingState(input: {
  billingStatus?: string | null;
  quickbooksInvoiceId?: string | null;
  quickbooksSyncStatus?: string | null;
}) {
  return (
    input.billingStatus === "invoiced" ||
    Boolean(input.quickbooksInvoiceId) ||
    input.quickbooksSyncStatus === "synced" ||
    input.quickbooksSyncStatus === "sent"
  );
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

function resolveInspectionPriorityState(input: {
  previousIsPriority?: boolean;
  nextIsPriority: boolean;
  nextStatus: InspectionStatus;
}) {
  const completesInspection = input.nextStatus === InspectionStatus.completed;
  const effectiveIsPriority = completesInspection ? false : input.nextIsPriority;

  return {
    isPriority: effectiveIsPriority,
    priorityAssignedAt:
      effectiveIsPriority && !input.previousIsPriority ? new Date() : undefined,
    priorityClearedAt:
      input.previousIsPriority && !effectiveIsPriority ? new Date() : undefined
  };
}

function parseInspectionFormData(formData: FormData) {
  const inspectionMonth = String(formData.get("inspectionMonth") ?? "");
  const scheduledStart = String(formData.get("scheduledStart") ?? "") || defaultScheduledStartForMonth(inspectionMonth);
  const scheduledEndValue = String(formData.get("scheduledEnd") ?? "");
  const customerCompanyId = String(formData.get("customerCompanyId") ?? "").trim();
  const selectedSiteId = String(formData.get("siteId") ?? "").trim();
  const siteId = selectedSiteId || (customerCompanyId ? genericInspectionSiteOptionValue : "");
  const inspectionClassification = String(formData.get("inspectionClassification") ?? "standard");
  const isPriority = formData.get("isPriority") === "on";
  const status = String(formData.get("status") ?? "to_be_completed");
  const assignedTechnicianIds = normalizeAssignedTechnicianIds({
    assignedTechnicianIds: formData.getAll("assignedTechnicianIds").map((value) => String(value)).filter(Boolean),
    assignedTechnicianId: String(formData.get("assignedTechnicianId") ?? "") || null
  });
  const rawServiceLines = String(formData.get("serviceLinesJson") ?? "").trim();
  const tasks = rawServiceLines
    ? (() => {
        try {
          const parsed = JSON.parse(rawServiceLines) as Array<Record<string, unknown>>;
          return parsed.map((task) => ({
            inspectionType: String(task.inspectionType ?? ""),
            frequency: String(task.frequency ?? ""),
            assignedTechnicianId: String(task.assignedTechnicianId ?? "").trim() || null,
            dueMonth: String(task.dueMonth ?? "").trim() || undefined,
            dueDate: parseDateTimeInput(String(task.dueDate ?? "").trim()),
            schedulingStatus: String(task.schedulingStatus ?? "scheduled_now"),
            notes: String(task.notes ?? "").trim() || undefined
          }));
        } catch {
          return [];
        }
      })()
    : (Object.keys(inspectionTypeRegistry) as Array<keyof typeof inspectionTypeRegistry>)
        .filter((inspectionType) => formData.get(`type:${inspectionType}`) === "true")
        .map((inspectionType) => ({
          inspectionType,
          frequency: String(formData.get(`frequency:${inspectionType}`) ?? getDefaultInspectionRecurrenceFrequency(inspectionType)),
          assignedTechnicianId: assignedTechnicianIds[0] ?? null,
          dueMonth: inspectionMonth || scheduledStart.slice(0, 7),
          dueDate: parseDateTimeInput(scheduledStart),
          schedulingStatus: "scheduled_now",
          notes: undefined
        }));

  return scheduleInspectionSchema.safeParse({
    customerCompanyId,
    siteId,
    inspectionClassification,
    isPriority,
    inspectionMonth: inspectionMonth || undefined,
    scheduledStart: parseDateTimeInput(scheduledStart) ?? scheduledStart,
    scheduledEnd: scheduledEndValue ? parseDateTimeInput(scheduledEndValue) ?? scheduledEndValue : null,
    assignedTechnicianIds,
    status,
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

export async function ensureGenericInspectionSite(
  actor: ActorContext,
  customerCompanyId: string
) {
  const parsed = parseActor(actor);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsed.role)) {
    throw new Error("Only administrators can create generic inspection sites.");
  }

  const tenantId = parsed.tenantId as string;
  const customerCompany = await prisma.customerCompany.findFirst({
    where: {
      id: customerCompanyId,
      tenantId
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!customerCompany) {
    throw new Error("Customer not found.");
  }

  const existingSite = await prisma.site.findFirst({
    where: {
      tenantId,
      customerCompanyId: customerCompany.id,
      name: genericInspectionSiteName
    },
    select: {
      id: true
    }
  });

  if (existingSite) {
    return existingSite;
  }

  return prisma.site.create({
    data: {
      tenantId,
      customerCompanyId: customerCompany.id,
      name: genericInspectionSiteName,
      addressLine1: genericInspectionSiteAddressLine1,
      city: genericInspectionSiteCity,
      state: genericInspectionSiteState,
      postalCode: genericInspectionSitePostalCode,
      notes: `Created automatically for customer ${customerCompany.name} when scheduling without a specific site.`
    },
    select: {
      id: true
    }
  });
}

export async function createOneTimeInspectionSite(
  actor: ActorContext,
  customerCompanyId: string,
  input: {
    name: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    notes?: string | null;
  }
) {
  const parsed = parseActor(actor);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsed.role)) {
    throw new Error("Only administrators can create one-time inspection sites.");
  }

  const tenantId = parsed.tenantId as string;
  const customerCompany = await prisma.customerCompany.findFirst({
    where: {
      id: customerCompanyId,
      tenantId
    },
    select: {
      id: true,
      name: true
    }
  });

  if (!customerCompany) {
    throw new Error("Customer not found.");
  }

  return prisma.site.create({
    data: {
      tenantId,
      customerCompanyId: customerCompany.id,
      name: input.name.trim(),
      addressLine1: input.addressLine1.trim(),
      addressLine2: input.addressLine2?.trim() || null,
      city: input.city.trim(),
      state: input.state.trim(),
      postalCode: input.postalCode.trim(),
      notes: input.notes?.trim() || `Created as a one-time inspection site for ${customerCompany.name}.`
    },
    select: {
      id: true
    }
  });
}

export async function deleteInspection(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only office administrators can delete inspections.");
  }

  const tenantId = parsedActor.tenantId as string;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, tenantId },
    include: {
      customerCompany: { select: { name: true } },
      site: { select: { name: true } },
      amendments: { select: { id: true } },
      replacementAmendments: { select: { id: true } },
      billingSummary: {
        select: {
          id: true,
          status: true,
          quickbooksInvoiceId: true,
          quickbooksSyncStatus: true
        }
      },
      attachments: {
        select: {
          id: true,
          storageKey: true
        }
      },
      reports: {
        select: {
          id: true,
          attachments: {
            select: {
              id: true,
              storageKey: true
            }
          },
          signatures: {
            select: {
              id: true,
              imageDataUrl: true
            }
          },
          deficiencies: {
            select: {
              id: true,
              photoStorageKey: true
            }
          }
        }
      },
      documents: {
        select: {
          id: true,
          originalStorageKey: true,
          signedStorageKey: true
        }
      }
    }
  });

  if (!inspection) {
    throw new Error("Inspection not found.");
  }

  const blockedReason = inspection.amendments.length > 0 || inspection.replacementAmendments.length > 0
    ? "This inspection is linked to amendment history and cannot be deleted."
    : hasRiskyInspectionAccountingState({
        billingStatus: inspection.billingSummary?.status,
        quickbooksInvoiceId: inspection.billingSummary?.quickbooksInvoiceId,
        quickbooksSyncStatus: inspection.billingSummary?.quickbooksSyncStatus
      })
      ? "This inspection has invoicing or QuickBooks history and cannot be deleted."
      : null;

  if (blockedReason) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "inspection.delete_blocked",
        entityType: "Inspection",
        entityId: inspectionId,
        metadata: {
          reason: blockedReason,
          customerName: inspection.customerCompany.name,
          siteName: inspection.site.name
        } as JsonObject
      }
    });

    throw new Error(blockedReason);
  }

  const storageKeys = [
    ...inspection.attachments.map((attachment) => attachment.storageKey),
    ...inspection.reports.flatMap((report) => [
      ...report.attachments.map((attachment) => attachment.storageKey),
      ...report.signatures.map((signature) => signature.imageDataUrl),
      ...report.deficiencies.map((deficiency) => deficiency.photoStorageKey).filter((key): key is string => Boolean(key))
    ]),
    ...inspection.documents.flatMap((document) => [
      document.originalStorageKey,
      document.signedStorageKey
    ].filter((key): key is string => Boolean(key)))
  ];

  await prisma.$transaction(async (tx) => {
    const reportIds = inspection.reports.map((report) => report.id);

    if (reportIds.length) {
      await tx.reportCorrectionEvent.deleteMany({
        where: { tenantId, reportId: { in: reportIds } }
      });
    }

    await tx.attachment.deleteMany({
      where: {
        tenantId,
        OR: [
          { inspectionId },
          { inspectionReportId: { in: reportIds } }
        ]
      }
    });
    await tx.signature.deleteMany({
      where: { tenantId, inspectionReportId: { in: reportIds } }
    });
    await tx.deficiency.deleteMany({
      where: { tenantId, inspectionId }
    });
    await tx.inspectionDocument.deleteMany({
      where: { tenantId, inspectionId }
    });
    await tx.inspectionReport.deleteMany({
      where: { tenantId, inspectionId }
    });
    await tx.inspectionRecurrence.deleteMany({
      where: { tenantId, inspectionTask: { inspectionId } }
    });
    await tx.inspectionTask.deleteMany({
      where: { tenantId, inspectionId }
    });
    await tx.inspectionTechnicianAssignment.deleteMany({
      where: { tenantId, inspectionId }
    });
    await tx.inspectionBillingSummary.deleteMany({
      where: { tenantId, inspectionId }
    });
    await tx.inspection.delete({
      where: { id: inspectionId }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.deleted",
      entityId: inspectionId,
      metadata: {
        customerName: inspection.customerCompany.name,
        siteName: inspection.site.name,
        deletedReportCount: inspection.reports.length,
        deletedDocumentCount: inspection.documents.length,
        deletedAttachmentCount: inspection.attachments.length + inspection.reports.reduce((count, report) => count + report.attachments.length, 0),
        deletedSignatureCount: inspection.reports.reduce((count, report) => count + report.signatures.length, 0),
        deletedDeficiencyCount: inspection.reports.reduce((count, report) => count + report.deficiencies.length, 0)
      }
    });
  });

  const cleanupResults = await Promise.allSettled(
    [...new Set(storageKeys)].map((storageKey) => deleteStoredFile(storageKey))
  );

  const failedCleanupCount = cleanupResults.filter((result) => result.status === "rejected").length;
  if (failedCleanupCount > 0) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "inspection.delete_storage_cleanup_failed",
        entityType: "Inspection",
        entityId: inspectionId,
        metadata: {
          failedCleanupCount
        } as JsonObject
      }
    });
  }
}

async function validateSchedulingReferences(tx: Prisma.TransactionClient, tenantId: string, input: z.infer<typeof scheduleInspectionSchema>) {
  const uniqueAssignedTechnicianIds = normalizeAssignedTechnicianIds({
    assignedTechnicianIds: [
      ...(input.assignedTechnicianIds ?? []),
      ...input.tasks.map((task) => task.assignedTechnicianId).filter((value): value is string => Boolean(value))
    ]
  });
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
    primaryAssignedTechnicianId:
      input.tasks.find((task) => isCurrentVisitTaskSchedulingStatus(task.schedulingStatus) && task.assignedTechnicianId)?.assignedTechnicianId ??
      assignedTechnicianIds[0] ??
      null
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

async function writeInspectionTasks(
  tx: Prisma.TransactionClient,
  inspectionId: string,
  tenantId: string,
  inspectionScheduledStart: Date,
  scheduledStart: Date,
  tasks: ScheduledInspectionTaskInput[]
) {
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
        technicianId: task.assignedTechnicianId ?? null,
        addedByUserId: null,
        sortOrder: index,
        dueMonth: normalizeTaskDueMonth({
          dueMonth: task.dueMonth,
          dueDate: task.dueDate ?? null,
          fallbackMonth: format(inspectionScheduledStart, "yyyy-MM")
        }),
        dueDate: task.dueDate ?? null,
        schedulingStatus: task.schedulingStatus,
        notes: task.notes,
        recurrenceSeriesId: task.recurrenceSeriesId,
        recurrenceAnchorScheduledStart: task.recurrenceAnchorScheduledStart,
        recurrenceNextDueAt: task.recurrenceNextDueAt
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
  addedByUserId?: string | null;
  sortOrder: number;
  dueMonth?: string | null;
  dueDate?: Date | null;
  schedulingStatus?: string;
  notes?: string | null;
  recurrenceSeriesId?: string | null;
  recurrenceAnchorScheduledStart?: Date | null;
  recurrenceNextDueAt?: Date | null;
}) {
  const createdTask = await input.tx.inspectionTask.create({
    data: {
      tenantId: input.tenantId,
      inspectionId: input.inspectionId,
      inspectionType: input.inspectionType,
      status: input.taskStatus,
      addedByUserId: input.addedByUserId ?? null,
      assignedTechnicianId: input.technicianId,
      dueMonth: input.dueMonth ?? null,
      dueDate: input.dueDate ?? null,
      schedulingStatus: input.schedulingStatus ?? "scheduled_now",
      notes: input.notes ?? null,
      sortOrder: input.sortOrder
    }
  });

  await Promise.all([
    input.tx.inspectionRecurrence.create({
      data: {
        tenantId: input.tenantId,
        inspectionTaskId: createdTask.id,
        seriesId: input.recurrenceSeriesId ?? crypto.randomUUID(),
        frequency: input.frequency,
        anchorScheduledStart: input.recurrenceAnchorScheduledStart ?? input.scheduledStart,
        nextDueAt: input.recurrenceNextDueAt ?? nextDueFrom(input.scheduledStart, input.frequency)
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

async function createRecurringFollowUpInspectionsTx(tx: Prisma.TransactionClient, input: {
  tenantId: string;
  actorUserId: string;
  inspection: {
    id: string;
    customerCompanyId: string;
    siteId: string;
    assignedTechnicianId: string | null;
    createdByUserId: string;
    scheduledStart: Date;
    scheduledEnd: Date | null;
    notes: string | null;
    claimable: boolean;
    amendments?: Array<{ id: string }>;
    technicianAssignments?: Array<{ technicianId: string }>;
    tasks: Array<{
      id: string;
      inspectionType: keyof typeof inspectionTypeRegistry;
      assignedTechnicianId?: string | null;
      dueMonth?: string | null;
      dueDate?: Date | null;
      schedulingStatus?: string | null;
      notes?: string | null;
      recurrence?: {
        id: string;
        frequency: RecurrenceFrequency;
        seriesId?: string | null;
        anchorScheduledStart?: Date | null;
        nextDueAt?: Date | null;
      } | null;
    }>;
  };
}) {
  if ((input.inspection.amendments?.length ?? 0) > 0) {
    return [];
  }

  const recurringTasks = input.inspection.tasks.filter((task) => (
    task.recurrence &&
    task.recurrence.frequency !== RecurrenceFrequency.ONCE &&
    task.recurrence.nextDueAt instanceof Date &&
    !Number.isNaN(task.recurrence.nextDueAt.getTime()) &&
    isCurrentVisitTaskSchedulingStatus(task.schedulingStatus ?? null)
  ));
  if (!recurringTasks.length) {
    return [];
  }

  const recurringSeriesIds = recurringTasks
    .map((task) => task.recurrence?.seriesId)
    .filter((seriesId): seriesId is string => typeof seriesId === "string" && seriesId.length > 0);
  const existingFutureTasks = recurringSeriesIds.length > 0
    ? await tx.inspectionTask.findMany({
      where: {
        tenantId: input.tenantId,
        inspectionId: { not: input.inspection.id },
        recurrence: {
          is: {
            seriesId: { in: recurringSeriesIds }
          }
        }
      },
      select: {
        recurrence: {
          select: {
            seriesId: true
          }
        }
      }
    })
    : [];
  const existingSeriesIds = new Set(
    existingFutureTasks
      .map((task) => task.recurrence?.seriesId)
      .filter((seriesId): seriesId is string => typeof seriesId === "string" && seriesId.length > 0)
  );

  const tasksToRollForward = recurringTasks.filter((task) => {
    const seriesId = task.recurrence?.seriesId ?? task.recurrence?.id ?? task.id;
    return !existingSeriesIds.has(seriesId);
  });
  if (!tasksToRollForward.length) {
    return [];
  }

  const durationMs = input.inspection.scheduledEnd
    ? Math.max(input.inspection.scheduledEnd.getTime() - input.inspection.scheduledStart.getTime(), 0)
    : null;
  const assignedTechnicianIds = getInspectionAssignedTechnicianIds({
    assignedTechnicianId: input.inspection.assignedTechnicianId,
    technicianAssignments: input.inspection.technicianAssignments
  });

  const groupedTasks = new Map<string, { scheduledStart: Date; tasks: ScheduledInspectionTaskInput[] }>();
  for (const task of tasksToRollForward) {
    const nextScheduledStart = task.recurrence?.nextDueAt;
    if (!nextScheduledStart) {
      continue;
    }

    const group = groupedTasks.get(nextScheduledStart.toISOString()) ?? {
      scheduledStart: nextScheduledStart,
      tasks: []
    };
    group.tasks.push({
      inspectionType: task.inspectionType,
      frequency: task.recurrence?.frequency ?? getDefaultInspectionRecurrenceFrequency(task.inspectionType),
      assignedTechnicianId: task.assignedTechnicianId ?? null,
      dueMonth: normalizeTaskDueMonth({
        dueMonth: task.dueMonth ?? null,
        dueDate: task.recurrence?.nextDueAt ?? task.dueDate ?? null,
        fallbackMonth: format(nextScheduledStart, "yyyy-MM")
      }),
      dueDate: task.recurrence?.nextDueAt ?? task.dueDate ?? null,
      schedulingStatus: "scheduled_now",
      notes: task.notes ?? undefined,
      recurrenceSeriesId: task.recurrence?.seriesId ?? task.recurrence?.id ?? task.id,
      recurrenceAnchorScheduledStart: task.recurrence?.anchorScheduledStart ?? input.inspection.scheduledStart,
      recurrenceNextDueAt: nextDueFrom(nextScheduledStart, task.recurrence?.frequency ?? getDefaultInspectionRecurrenceFrequency(task.inspectionType))
    });
    groupedTasks.set(nextScheduledStart.toISOString(), group);
  }

  const createdInspections = [];
  for (const group of [...groupedTasks.values()].sort((left, right) => left.scheduledStart.getTime() - right.scheduledStart.getTime())) {
    const createdInspection = await tx.inspection.create({
      data: {
        tenantId: input.tenantId,
        customerCompanyId: input.inspection.customerCompanyId,
        siteId: input.inspection.siteId,
        assignedTechnicianId: input.inspection.assignedTechnicianId,
        createdByUserId: input.actorUserId,
        scheduledStart: group.scheduledStart,
        scheduledEnd: durationMs === null ? null : new Date(group.scheduledStart.getTime() + durationMs),
        status: InspectionStatus.to_be_completed,
        notes: input.inspection.notes,
        claimable: assignedTechnicianIds.length === 0
      }
    });

    await syncInspectionTechnicianAssignments(tx, createdInspection.id, input.tenantId, assignedTechnicianIds);
    await writeInspectionTasks(
      tx,
      createdInspection.id,
      input.tenantId,
      input.inspection.scheduledStart,
      group.scheduledStart,
      group.tasks
    );

    await createAuditLog(tx, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "inspection.recurrence_created",
      entityId: createdInspection.id,
      metadata: {
        sourceInspectionId: input.inspection.id,
        taskCount: group.tasks.length,
        scheduledStart: group.scheduledStart.toISOString()
      }
    });

    createdInspections.push(createdInspection);
  }

  return createdInspections;
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
      metadata: input.metadata as JsonObject | undefined
    }
  });
}

function serializeCloseoutRequestMetadata(input: {
  requestType: InspectionCloseoutRequestType | InspectionCloseoutRequestTypeValue;
  note: string;
  createdInspectionId?: string | null;
}) {
  return {
    requestType: input.requestType,
    note: input.note,
    createdInspectionId: input.createdInspectionId ?? null
  };
}

async function createInspectionCloseoutRequestTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    inspectionId: string;
    requestedByUserId: string;
    requestType: InspectionCloseoutRequestTypeValue;
    note: string;
  }
) {
  const closeoutRequest = await tx.inspectionCloseoutRequest.upsert({
    where: { inspectionId: input.inspectionId },
    update: {
      requestedByUserId: input.requestedByUserId,
      requestType: input.requestType,
      note: input.note,
      status: InspectionCloseoutRequestStatus.pending,
      createdInspectionId: null,
      approvedByUserId: null,
      dismissedByUserId: null,
      approvedAt: null,
      dismissedAt: null
    },
    create: {
      tenantId: input.tenantId,
      inspectionId: input.inspectionId,
      requestedByUserId: input.requestedByUserId,
      requestType: input.requestType,
      note: input.note
    },
    include: {
      requestedBy: { select: { id: true, name: true } }
    }
  });

  await createAuditLog(tx, {
    tenantId: input.tenantId,
    actorUserId: input.requestedByUserId,
    action: "inspection.closeout_request_created",
    entityId: input.inspectionId,
    metadata: serializeCloseoutRequestMetadata({
      requestType: input.requestType,
      note: input.note
    })
  });

  return closeoutRequest;
}

function getReviewCompletionSummary(input: {
  tasks: Array<{
    report: {
      id: string;
      status: string;
      finalizedAt: Date | null;
    } | null;
  }>;
  deficiencies: Array<unknown>;
  documents: Array<{
    requiresSignature: boolean;
    status: string;
  }>;
  attachments: Array<unknown>;
}) {
  const totalTasks = input.tasks.length;
  const finalizedTasks = input.tasks.filter((task) => task.report?.status === reportStatuses.finalized).length;
  const missingReports = totalTasks - finalizedTasks;
  const pendingDocuments = input.documents.filter((document) => document.requiresSignature && !["SIGNED", "EXPORTED"].includes(document.status)).length;

  return {
    totalTasks,
    finalizedTasks,
    missingReports,
    reportCompletionLabel: totalTasks ? `${finalizedTasks}/${totalTasks} finalized` : "0/0 finalized",
    signaturesReady: pendingDocuments === 0,
    pendingSignatureDocuments: pendingDocuments,
    documentCount: input.documents.length,
    attachmentCount: input.attachments.length,
    deficiencyCount: input.deficiencies.length,
    readyForOfficeReview: missingReports === 0 && pendingDocuments === 0
  };
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
    const priorityState = resolveInspectionPriorityState({
      nextIsPriority: input.isPriority,
      nextStatus: input.status
    });

    const inspection = await tx.inspection.create({
      data: {
        tenantId,
        customerCompanyId: customerCompany.id,
        siteId: site.id,
        assignedTechnicianId: primaryAssignedTechnicianId,
        createdByUserId: parsedActor.userId,
        inspectionClassification: input.inspectionClassification,
        isPriority: priorityState.isPriority,
        priorityAssignedAt: priorityState.priorityAssignedAt,
        priorityClearedAt: priorityState.priorityClearedAt,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd ?? null,
        status: input.status,
        notes: input.notes,
        claimable: assignedTechnicianIds.length === 0
      }
    });

    await syncInspectionTechnicianAssignments(tx, inspection.id, tenantId, assignedTechnicianIds);
    await writeInspectionTasks(tx, inspection.id, tenantId, input.scheduledStart, input.scheduledStart, input.tasks);
    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.created",
      entityId: inspection.id,
        metadata: {
          customerCompanyId: customerCompany.id,
          siteId: site.id,
          inspectionClassification: input.inspectionClassification,
          isPriority: priorityState.isPriority,
          status: input.status,
          taskCount: input.tasks.length
        }
      });

      await createAuditLog(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "inspection.classification_set",
        entityId: inspection.id,
        metadata: {
          inspectionClassification: input.inspectionClassification
        }
      });

      if (priorityState.isPriority) {
        await createAuditLog(tx, {
          tenantId,
          actorUserId: parsedActor.userId,
          action: "inspection.priority_enabled",
          entityId: inspection.id,
          metadata: {
            isPriority: true
          }
        });
      }

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
      include: { tasks: { include: { recurrence: true } }, technicianAssignments: { select: { technicianId: true } } }
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
          { status: reportStatuses.finalized },
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
    const priorityState = resolveInspectionPriorityState({
      previousIsPriority: existing.isPriority,
      nextIsPriority: input.isPriority,
      nextStatus: input.status
    });
    const taskDefinitions = mapRecurringTaskDefinitions({
      existingTasks: existing.tasks,
      nextTasks: effectiveTasks,
      scheduledStart: input.scheduledStart,
      mode: "reset_anchor"
    });
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
        inspectionClassification: input.inspectionClassification,
        isPriority: priorityState.isPriority,
        priorityAssignedAt: priorityState.priorityAssignedAt,
        priorityClearedAt: priorityState.priorityClearedAt,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd ?? null,
        status: input.status,
        notes: input.notes,
        claimable: assignedTechnicianIds.length === 0
      }
    });

    await syncInspectionTechnicianAssignments(tx, inspectionId, tenantId, assignedTechnicianIds);
    await writeInspectionTasks(tx, inspectionId, tenantId, input.scheduledStart, input.scheduledStart, taskDefinitions);

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

    if (existing.inspectionClassification !== input.inspectionClassification) {
      await createAuditLog(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "inspection.classification_updated",
        entityId: inspectionId,
        metadata: {
          previousClassification: existing.inspectionClassification,
          nextClassification: input.inspectionClassification
        }
      });
    }

    if (!existing.isPriority && priorityState.isPriority) {
      await createAuditLog(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "inspection.priority_enabled",
        entityId: inspectionId,
        metadata: {
          previousPriority: false,
          nextPriority: true
        }
      });
    }

    if (existing.isPriority && !priorityState.isPriority) {
      await createAuditLog(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        action: input.status === InspectionStatus.completed ? "inspection.priority_cleared_automatically" : "inspection.priority_disabled",
        entityId: inspectionId,
        metadata: {
          previousPriority: true,
          nextPriority: false,
          reason: input.status === InspectionStatus.completed ? "Priority cleared automatically when inspection was marked Completed." : null
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

export async function updateInspectionStatus(
  actor: ActorContext,
  inspectionId: string,
  status: InspectionStatus,
  options?: { note?: string | null }
) {
  const parsedActor = parseActor(actor);
  const tenantId = parsedActor.tenantId as string;
  const trimmedNote = options?.note?.trim() ? options.note.trim() : null;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, tenantId },
    include: {
      technicianAssignments: { select: { technicianId: true } },
      amendments: { select: { id: true } },
      tasks: { include: { recurrence: true } }
    }
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
        status: { not: reportStatuses.finalized },
        task: {
          OR: [
            { schedulingStatus: "due_now" },
            { schedulingStatus: "scheduled_now" },
            { schedulingStatus: "completed" },
            { schedulingStatus: "deferred" }
          ]
        }
      }
    });

    if (remainingDrafts > 0) {
      throw new Error("Finalize all inspection reports before marking the inspection completed.");
    }
  }

  return prisma.$transaction(async (tx) => {
    if (inspection.status === status) {
      return inspection;
    }

    const priorityState = resolveInspectionPriorityState({
      previousIsPriority: inspection.isPriority,
      nextIsPriority: inspection.isPriority,
      nextStatus: status
    });

    const updated = await tx.inspection.update({
      where: { id: inspectionId },
      data: {
        status,
        isPriority: priorityState.isPriority,
        priorityClearedAt: priorityState.priorityClearedAt
      }
    });

    if (status !== InspectionStatus.completed) {
      await tx.inspectionTask.updateMany({
        where: {
          tenantId,
          inspectionId,
          status: { not: InspectionStatus.completed },
          OR: [
            { schedulingStatus: "due_now" },
            { schedulingStatus: "scheduled_now" },
            { schedulingStatus: "completed" },
            { schedulingStatus: "deferred" }
          ]
        },
        data: { status }
      });
    }

    let generatedInspectionsCount = 0;
    if (status === InspectionStatus.completed) {
      const generatedInspections = await createRecurringFollowUpInspectionsTx(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        inspection
      });
      generatedInspectionsCount = generatedInspections.length;
    }

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.status_updated",
      entityId: inspectionId,
      metadata: {
        previousStatus: inspection.status,
        status,
        nextStatus: status,
        note: trimmedNote,
        generatedInspectionsCount
      }
    });

    if (inspection.isPriority && !priorityState.isPriority) {
      await createAuditLog(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "inspection.priority_cleared_automatically",
        entityId: inspectionId,
        metadata: {
          previousPriority: true,
          nextPriority: false,
          reason: "Priority cleared automatically when inspection was marked Completed."
        }
      });
    }

    return updated;
  });
}

export async function completeInspectionWithCloseoutRequest(
  actor: ActorContext,
  inspectionId: string,
  input?: z.infer<typeof inspectionCloseoutRequestSchema>
) {
  const parsedActor = parseActor(actor);
  const tenantId = parsedActor.tenantId as string;
  const parsedRequest = inspectionCloseoutRequestSchema.parse(input ?? { requestType: "none" });

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, tenantId },
    include: {
      technicianAssignments: { select: { technicianId: true } },
      tasks: { include: { recurrence: true } }
    }
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

  const remainingDrafts = await prisma.inspectionReport.count({
    where: {
      tenantId,
      inspectionId,
      status: { not: reportStatuses.finalized },
      task: {
        OR: [
          { schedulingStatus: "due_now" },
          { schedulingStatus: "scheduled_now" },
          { schedulingStatus: "completed" },
          { schedulingStatus: "deferred" }
        ]
      }
    }
  });

  if (remainingDrafts > 0) {
    throw new Error("Finalize all inspection reports before marking the inspection completed.");
  }

  return prisma.$transaction(async (tx) => {
    const priorityState = resolveInspectionPriorityState({
      previousIsPriority: inspection.isPriority,
      nextIsPriority: inspection.isPriority,
      nextStatus: InspectionStatus.completed
    });

    const updated = inspection.status === InspectionStatus.completed
      ? inspection
      : await tx.inspection.update({
          where: { id: inspectionId },
          data: {
            status: InspectionStatus.completed,
            isPriority: priorityState.isPriority,
            priorityClearedAt: priorityState.priorityClearedAt
          }
        });

    const generatedInspections = inspection.status === InspectionStatus.completed
      ? []
      : await createRecurringFollowUpInspectionsTx(tx, {
          tenantId,
          actorUserId: parsedActor.userId,
          inspection
        });

    let closeoutRequestId: string | null = null;
    if (parsedRequest.requestType !== "none") {
      const closeoutRequest = await createInspectionCloseoutRequestTx(tx, {
        tenantId,
        inspectionId,
        requestedByUserId: parsedActor.userId,
        requestType: parsedRequest.requestType,
        note: parsedRequest.note
      });
      closeoutRequestId = closeoutRequest.id;
    }

    if (inspection.status !== InspectionStatus.completed) {
      await createAuditLog(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "inspection.status_updated",
        entityId: inspectionId,
        metadata: {
          previousStatus: inspection.status,
          status: InspectionStatus.completed,
          nextStatus: InspectionStatus.completed,
          generatedInspectionsCount: generatedInspections.length,
          closeoutRequestId
        }
      });
    }

    if (inspection.isPriority && !priorityState.isPriority) {
      await createAuditLog(tx, {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "inspection.priority_cleared_automatically",
        entityId: inspectionId,
        metadata: {
          previousPriority: true,
          nextPriority: false,
          reason: "Priority cleared automatically when inspection was marked Completed."
        }
      });
    }

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

    if (isTerminalInspectionStatus(inspection.status)) {
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
      addedByUserId: parsedActor.userId,
      sortOrder: nextSortOrder,
      dueMonth: format(inspection.scheduledStart, "yyyy-MM"),
      dueDate: inspection.scheduledStart,
      schedulingStatus: "scheduled_now",
      recurrenceAnchorScheduledStart: inspection.scheduledStart
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

export async function removeInspectionTask(actor: ActorContext, input: {
  inspectionId: string;
  inspectionTaskId: string;
  force?: boolean;
}) {
  const parsedActor = parseActor(actor);
  const tenantId = parsedActor.tenantId as string;

  return prisma.$transaction(async (tx) => {
    const inspection = await tx.inspection.findFirst({
      where: { id: input.inspectionId, tenantId },
      include: {
        technicianAssignments: { select: { technicianId: true } }
      }
    });

    if (!inspection) {
      throw new Error("Inspection not found.");
    }

    const canManageTask =
      ["tenant_admin", "office_admin"].includes(parsedActor.role) ||
      (parsedActor.role === "technician" &&
        isTechnicianAssignedToInspection({
          userId: parsedActor.userId,
          assignedTechnicianId: inspection.assignedTechnicianId,
          technicianAssignments: readTechnicianAssignments(inspection)
        }));

    if (!canManageTask) {
      throw new Error("You do not have access to remove report types from this inspection.");
    }

    const forceRemoval = Boolean(input.force && ["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role));

    if (!forceRemoval && isTerminalInspectionStatus(inspection.status)) {
      throw new Error("Report types can only be removed from active inspections.");
    }

    const task = await tx.inspectionTask.findFirst({
      where: {
        id: input.inspectionTaskId,
        tenantId,
        inspectionId: inspection.id
      },
      include: {
        report: {
          include: {
            attachments: {
              select: {
                storageKey: true
              }
            },
            signatures: {
              select: {
                imageDataUrl: true
              }
            },
            deficiencies: {
              select: {
                photoStorageKey: true
              }
            }
          }
        }
      }
    });

    if (!task) {
      throw new Error("Report type not found.");
    }

    if (parsedActor.role === "technician" && task.addedByUserId !== parsedActor.userId) {
      throw new Error("Technicians can only remove report types they added themselves.");
    }

    const reportActivityCount = task.report
      ? await tx.inspectionReport.count({
          where: {
            tenantId,
            id: task.report.id,
            OR: [
              { autosaveVersion: { gt: 1 } },
              { status: reportStatuses.finalized },
              { attachments: { some: {} } },
              { signatures: { some: {} } },
              { deficiencies: { some: {} } }
            ]
          }
        })
      : 0;

    if (!forceRemoval && reportActivityCount > 0) {
      throw new Error("This report type already has report activity and cannot be removed.");
    }

    const storageKeys = task.report
      ? [
          ...task.report.attachments.map((attachment) => attachment.storageKey),
          ...task.report.signatures.map((signature) => signature.imageDataUrl),
          ...task.report.deficiencies.map((deficiency) => deficiency.photoStorageKey).filter((key): key is string => Boolean(key))
        ]
      : [];

    if (task.report) {
      await tx.reportCorrectionEvent.deleteMany({
        where: {
          tenantId,
          reportId: task.report.id
        }
      });

      await tx.attachment.deleteMany({
        where: {
          tenantId,
          inspectionReportId: task.report.id
        }
      });
      await tx.signature.deleteMany({
        where: {
          tenantId,
          inspectionReportId: task.report.id
        }
      });
      await tx.deficiency.deleteMany({
        where: {
          tenantId,
          inspectionReportId: task.report.id
        }
      });
      await tx.inspectionReport.delete({
        where: {
          id: task.report.id
        }
      });
    }

    await tx.inspectionRecurrence.deleteMany({
      where: {
        tenantId,
        inspectionTaskId: task.id
      }
    });
    await tx.inspectionTask.delete({
      where: {
        id: task.id
      }
    });

    const remainingTasks = await tx.inspectionTask.findMany({
      where: {
        tenantId,
        inspectionId: inspection.id
      },
      select: {
        id: true
      },
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    await Promise.all(
      remainingTasks.map((remainingTask, index) =>
        tx.inspectionTask.update({
          where: { id: remainingTask.id },
          data: { sortOrder: index }
        })
      )
    );

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.task_removed",
      entityId: inspection.id,
      metadata: {
        inspectionTaskId: task.id,
        inspectionType: task.inspectionType,
        removedByUserId: parsedActor.userId,
        forceRemoval
      }
    });

    const cleanupResults = await Promise.allSettled(
      [...new Set(storageKeys)].map((storageKey) => deleteStoredFile(storageKey))
    );
    const failedCleanupCount = cleanupResults.filter((result) => result.status === "rejected").length;

    if (failedCleanupCount > 0) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: parsedActor.userId,
          action: "inspection.task_remove_storage_cleanup_failed",
          entityType: "Inspection",
          entityId: inspection.id,
          metadata: {
            inspectionTaskId: task.id,
            failedCleanupCount
          } as JsonObject
        }
      });
    }

    return { id: task.id };
  });
}

async function getInspectionReportActivityCount(tx: Prisma.TransactionClient, tenantId: string, inspectionId: string) {
  return tx.inspectionReport.count({
    where: {
      tenantId,
      inspectionId,
      OR: [
        { autosaveVersion: { gt: 1 } },
        { status: reportStatuses.finalized },
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
        { status: reportStatuses.finalized },
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
  inspectionClassification: InspectionClassification;
  isPriority: boolean;
  status: InspectionStatus;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  notes: string | null | undefined;
  tasks: Array<{
    inspectionType: string;
    assignedTechnicianId?: string | null;
    dueMonth?: string | null;
    dueDate?: Date | null;
    schedulingStatus?: string | null;
    notes?: string | null;
    recurrence?: { frequency: RecurrenceFrequency | null } | null;
    frequency?: RecurrenceFrequency;
  }>;
}) {
  return {
    inspectionId: input.id ?? null,
    customerCompanyId: input.customerCompanyId,
    siteId: input.siteId,
    assignedTechnicianIds: input.assignedTechnicianIds,
    inspectionClassification: input.inspectionClassification,
    isPriority: input.isPriority,
    status: input.status,
    scheduledStart: input.scheduledStart.toISOString(),
    scheduledEnd: input.scheduledEnd?.toISOString() ?? null,
    notes: input.notes ?? null,
    tasks: input.tasks.map((task) => ({
      inspectionType: task.inspectionType,
      frequency: task.frequency ?? task.recurrence?.frequency ?? getDefaultInspectionRecurrenceFrequency(task.inspectionType as keyof typeof inspectionTypeRegistry),
      assignedTechnicianId: task.assignedTechnicianId ?? null,
      dueMonth: task.dueMonth ?? null,
      dueDate: task.dueDate?.toISOString() ?? null,
      schedulingStatus: task.schedulingStatus ?? "scheduled_now",
      notes: task.notes ?? null
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
    const taskDefinitions = mapRecurringTaskDefinitions({
      existingTasks: existing.tasks,
      nextTasks: effectiveTasks,
      scheduledStart: input.scheduledStart,
      mode: "preserve_anchor",
      fallbackAnchorScheduledStart: existing.scheduledStart
    });
      const previousSnapshot = buildInspectionSnapshot({
        id: existing.id,
        customerCompanyId: existing.customerCompanyId,
        siteId: existing.siteId,
        assignedTechnicianIds: getInspectionAssignedTechnicianIds({
        assignedTechnicianId: existing.assignedTechnicianId,
        technicianAssignments: readTechnicianAssignments(existing)
        }),
        inspectionClassification: existing.inspectionClassification,
        isPriority: existing.isPriority,
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
        inspectionClassification: input.inspectionClassification,
        isPriority: input.isPriority,
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
          inspectionClassification: input.inspectionClassification,
          isPriority: input.isPriority,
          priorityAssignedAt: input.isPriority ? new Date() : null,
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd ?? null,
          status: InspectionStatus.to_be_completed,
        notes: input.notes,
        claimable: assignedTechnicianIds.length === 0
      }
    });

    await syncInspectionTechnicianAssignments(tx, replacementInspection.id, tenantId, assignedTechnicianIds);
    await writeInspectionTasks(
      tx,
      replacementInspection.id,
      tenantId,
      input.scheduledStart,
      input.scheduledStart,
      taskDefinitions
    );

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
        previousSnapshot: previousSnapshot as JsonInputValue,
        replacementSnapshot: { ...replacementSnapshot, inspectionId: replacementInspection.id } as JsonInputValue
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

export async function approveInspectionCloseoutRequest(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only office administrators can approve technician closeout requests.");
  }

  const tenantId = parsedActor.tenantId as string;

  return prisma.$transaction(async (tx) => {
    const inspection = await tx.inspection.findFirst({
      where: { id: inspectionId, tenantId },
      include: {
        tasks: { include: { recurrence: true } },
        closeoutRequest: true
      }
    });

    if (!inspection?.closeoutRequest) {
      throw new Error("No technician closeout request is pending for this inspection.");
    }

    if (inspection.closeoutRequest.status !== InspectionCloseoutRequestStatus.pending) {
      throw new Error("This closeout request has already been resolved.");
    }

    const closeoutRequest = inspection.closeoutRequest;

    const createdInspection = await tx.inspection.create({
      data: {
        tenantId,
        customerCompanyId: inspection.customerCompanyId,
        siteId: inspection.siteId,
        createdByUserId: parsedActor.userId,
        inspectionClassification: closeoutRequest.requestType === InspectionCloseoutRequestType.follow_up_inspection
          ? InspectionClassification.follow_up
          : InspectionClassification.standard,
        scheduledStart: inspection.scheduledStart,
        scheduledEnd: inspection.scheduledEnd,
        status: InspectionStatus.to_be_completed,
        notes: closeoutRequest.note,
        claimable: true
      }
    });

    await writeInspectionTasks(
      tx,
      createdInspection.id,
      tenantId,
      createdInspection.scheduledStart,
      createdInspection.scheduledStart,
      inspection.tasks.map((task) => ({
        inspectionType: task.inspectionType,
        frequency: task.recurrence?.frequency ?? getDefaultInspectionRecurrenceFrequency(task.inspectionType),
        assignedTechnicianId: null,
        dueMonth: task.dueMonth ?? format(createdInspection.scheduledStart, "yyyy-MM"),
        dueDate: task.dueDate ?? createdInspection.scheduledStart,
        schedulingStatus: "scheduled_now" as const,
        notes: task.notes ?? closeoutRequest.note
      }))
    );

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.created",
      entityId: createdInspection.id,
      metadata: {
        customerCompanyId: inspection.customerCompanyId,
        siteId: inspection.siteId,
        inspectionClassification: closeoutRequest.requestType === InspectionCloseoutRequestType.follow_up_inspection
          ? InspectionClassification.follow_up
          : InspectionClassification.standard,
        isPriority: false,
        status: InspectionStatus.to_be_completed,
        taskCount: inspection.tasks.length,
        sourceInspectionId: inspection.id,
        closeoutRequestId: closeoutRequest.id
      }
    });

    await tx.inspectionCloseoutRequest.update({
      where: { inspectionId: inspection.id },
      data: {
        status: InspectionCloseoutRequestStatus.approved,
        createdInspectionId: createdInspection.id,
        approvedByUserId: parsedActor.userId,
        approvedAt: new Date()
      }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.closeout_request_approved",
      entityId: inspection.id,
      metadata: serializeCloseoutRequestMetadata({
        requestType: closeoutRequest.requestType,
        note: closeoutRequest.note,
        createdInspectionId: createdInspection.id
      })
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.created_from_closeout_request",
      entityId: createdInspection.id,
      metadata: {
        sourceInspectionId: inspection.id,
        closeoutRequestId: closeoutRequest.id,
        requestType: closeoutRequest.requestType
      }
    });

    return createdInspection;
  });
}

export async function dismissInspectionCloseoutRequest(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only office administrators can dismiss technician closeout requests.");
  }

  const tenantId = parsedActor.tenantId as string;

  return prisma.$transaction(async (tx) => {
    const closeoutRequest = await tx.inspectionCloseoutRequest.findFirst({
      where: { tenantId, inspectionId }
    });

    if (!closeoutRequest) {
      throw new Error("No technician closeout request is pending for this inspection.");
    }

    if (closeoutRequest.status !== InspectionCloseoutRequestStatus.pending) {
      throw new Error("This closeout request has already been resolved.");
    }

    const dismissed = await tx.inspectionCloseoutRequest.update({
      where: { id: closeoutRequest.id },
      data: {
        status: InspectionCloseoutRequestStatus.dismissed,
        dismissedByUserId: parsedActor.userId,
        dismissedAt: new Date()
      }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "inspection.closeout_request_dismissed",
      entityId: inspectionId,
      metadata: serializeCloseoutRequestMetadata({
        requestType: closeoutRequest.requestType,
        note: closeoutRequest.note
      })
    });

    return dismissed;
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
      closeoutRequest: {
        include: {
          requestedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          dismissedBy: { select: { id: true, name: true } },
          createdInspection: {
            include: {
              site: true,
              customerCompany: true
            }
          }
        }
      },
      documents: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          fileName: true,
          label: true,
          requiresSignature: true,
          status: true,
          uploadedAt: true,
          signedAt: true
        }
      },
      attachments: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          fileName: true,
          createdAt: true,
          customerVisible: true
        }
      },
      replacementAmendments: {
        include: {
          inspection: {
            include: {
              site: true,
              customerCompany: true,
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
              customerCompany: true,
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
        { status: reportStatuses.finalized },
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
    include: {
      actor: { select: { id: true, name: true } }
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
  const reviewSummary = getReviewCompletionSummary({
    tasks: inspection.tasks,
    deficiencies,
    documents: inspection.documents,
    attachments: inspection.attachments
  });

  return {
    ...inspection,
    originalAmendment,
    outgoingAmendment,
    ...getInspectionDisplayLabels({
      siteName: inspection.site.name,
      customerName: inspection.customerCompany.name
    }),
    lifecycle,
    displayStatus: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart }),
    assignedTechnicianNames: formatAssignedTechnicianNames({
      assignedTechnician: inspection.assignedTechnician,
      technicianAssignments: readTechnicianNameAssignments(inspection)
    }),
    auditTrail,
    deficiencies,
    deficiencyCount: deficiencies.length,
    reviewSummary,
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
      where: { tenantId, status: { in: [...activeOperationalInspectionStatuses] } },
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
      where: { tenantId, status: { in: [...completedOperationalInspectionStatuses] } },
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
    prisma.inspection.count({ where: { tenantId, status: { in: [...completedOperationalInspectionStatuses] } } })
  ]);

  const inspections = [...activeInspections, ...completedInspections];
  const reportActivityCounts = await getInspectionReportActivityCountMap(tenantId, inspections.map((inspection) => inspection.id));

  function mapInspectionForDashboard<
    T extends (typeof inspections)[number]
  >(inspection: T) {
    const inspectionWithOptionalBillingSummary = inspection as T & {
      billingSummary?: { status?: string | null } | null;
    };
    const displayLabels = getInspectionDisplayLabels({
      siteName: inspection.site.name,
      customerName: inspection.customerCompany.name
    });

    return {
      ...inspection,
      tasks: withInspectionTaskDisplayLabels(inspection.tasks),
      ...displayLabels,
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

export async function getAdminSchedulingQueueData(
  actor: ActorContext,
  input?: {
    statuses?: string[] | InspectionFilterStatus[];
    classifications?: string[] | InspectionClassificationValue[];
    priority?: InspectionPriorityFilterValue;
  }
) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only tenant and office administrators can access the scheduling queue.");
  }

  const tenantId = parsedActor.tenantId as string;
  const requestedStatuses = normalizeInspectionStatusFilters(input?.statuses ?? []);
  const requestedClassifications = normalizeInspectionClassificationFilters(input?.classifications ?? []);
  const requestedPriority = normalizeInspectionPriorityFilter(input?.priority);
  const statusFilter = requestedStatuses.length
    ? { in: requestedStatuses as InspectionStatus[] }
    : undefined;
  const classificationFilter = requestedClassifications.length
    ? { in: requestedClassifications as InspectionClassification[] }
    : undefined;
  const priorityFilter = requestedPriority === "all"
    ? undefined
    : requestedPriority === "priority";

  const inspections = await prisma.inspection.findMany({
    where: {
      tenantId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(classificationFilter ? { inspectionClassification: classificationFilter } : {}),
      ...(typeof priorityFilter === "boolean" ? { isPriority: priorityFilter } : {})
    },
    include: {
      site: true,
      customerCompany: true,
      assignedTechnician: true,
      technicianAssignments: { include: { technician: true } },
      tasks: { include: { recurrence: true, report: true, assignedTechnician: true } }
    },
    orderBy: [{ scheduledStart: "asc" }],
    take: 40
  });

  const mapped = inspections.map((inspection) => {
    const currentTasks = withInspectionTaskDisplayLabels(
      inspection.tasks.filter((task) => isCurrentVisitTaskSchedulingStatus(task.schedulingStatus ?? "scheduled_now"))
    );

    return {
      ...inspection,
      tasks: currentTasks,
    ...getInspectionDisplayLabels({
      siteName: inspection.site.name,
      customerName: inspection.customerCompany.name
    }),
    displayStatus: getInspectionDisplayStatus({
      status: inspection.status,
      scheduledStart: inspection.scheduledStart
    }),
      assignedTechnicianNames: formatAssignedTechnicianNames({
        assignedTechnician: inspection.assignedTechnician,
        technicianAssignments: readTechnicianNameAssignments(inspection)
      })
    };
  }).filter((inspection) => inspection.tasks.length > 0);

  return {
    filters: {
      statuses: requestedStatuses,
      classifications: requestedClassifications,
      priority: requestedPriority
    },
    counts: {
      toBeCompleted: mapped.filter((inspection) => inspection.status === InspectionStatus.to_be_completed).length,
      scheduled: mapped.filter((inspection) => inspection.status === InspectionStatus.scheduled).length,
      inProgress: mapped.filter((inspection) => inspection.status === InspectionStatus.in_progress).length,
      completed: mapped.filter((inspection) => inspection.status === InspectionStatus.completed).length,
      invoiced: mapped.filter((inspection) => inspection.status === InspectionStatus.invoiced).length,
      cancelled: mapped.filter((inspection) => inspection.status === InspectionStatus.cancelled).length,
      followUpRequired: mapped.filter((inspection) => inspection.status === InspectionStatus.follow_up_required).length,
      open: mapped.filter((inspection) => isActiveOperationalInspectionStatus(inspection.status)).length,
      sharedQueue: mapped.filter((inspection) => inspection.tasks.every((task) => !task.assignedTechnicianId)).length
    },
    inspections: mapped
  };
}

export async function getAdminReportReviewQueueData(
  actor: ActorContext,
  input?: { status?: string }
) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only tenant and office administrators can access the report review queue.");
  }

  const tenantId = parsedActor.tenantId as string;
  const requestedStatus = (input?.status ?? "awaiting-review").trim().toLowerCase();

  const inspections = await prisma.inspection.findMany({
    where: { tenantId, status: { in: [...completedOperationalInspectionStatuses] } },
    include: {
      site: true,
      customerCompany: true,
      assignedTechnician: true,
      technicianAssignments: { include: { technician: true } },
      billingSummary: {
        select: {
          status: true
        }
      },
      tasks: {
        include: {
          recurrence: true,
          report: true
        }
      }
    },
    orderBy: [{ scheduledStart: "desc" }],
    take: 40
  });

  const mapped = inspections
    .map((inspection) => {
      const tasks = withInspectionTaskDisplayLabels(inspection.tasks);
      const reviewTasks = tasks.filter(
        (task) => task.report && task.report.status === reportStatuses.finalized
      );

      return {
        ...inspection,
        tasks,
        reviewTasks,
        billingStatus: inspection.billingSummary?.status ?? null,
        ...getInspectionDisplayLabels({
          siteName: inspection.site.name,
          customerName: inspection.customerCompany.name
        }),
        assignedTechnicianNames: formatAssignedTechnicianNames({
          assignedTechnician: inspection.assignedTechnician,
          technicianAssignments: readTechnicianNameAssignments(inspection)
        })
      };
    })
    .filter((inspection) => inspection.reviewTasks.length > 0);

  const queue = requestedStatus === "awaiting-review"
    ? mapped.filter((inspection) => inspection.billingStatus !== "invoiced")
    : mapped;

  return {
    filters: {
      status: requestedStatus
    },
    counts: {
      awaitingReview: mapped.filter((inspection) => inspection.billingStatus !== "invoiced").length,
      completed: mapped.length
    },
    inspections: queue
  };
}

export async function getAdminAmendmentManagementData(
  actor: ActorContext,
  input?: { lifecycle?: "all" | AdminInspectionLifecycle; filter?: "all" | InspectionReviewFilterValue }
) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only tenant and office administrators can access amendment management.");
  }

  const tenantId = parsedActor.tenantId as string;
  const reviewFilter = inspectionReviewFilterSchema.parse(input?.filter ?? "all");

  const inspections = await prisma.inspection.findMany({
    where: { tenantId },
    include: {
      site: true,
      customerCompany: true,
      assignedTechnician: true,
      technicianAssignments: { include: { technician: true } },
      closeoutRequest: {
        include: {
          requestedBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          dismissedBy: { select: { id: true, name: true } },
          createdInspection: {
            include: {
              site: true,
              customerCompany: true
            }
          }
        }
      },
      tasks: {
        include: {
          report: {
            select: {
              id: true,
              status: true,
              finalizedAt: true
            }
          }
        }
      },
      documents: {
        select: {
          id: true,
          requiresSignature: true,
          status: true
        }
      },
      attachments: {
        select: {
          id: true
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
  const filterCounts = {
    needs_review: 0,
    pending_follow_up_request: 0,
    approved_created: 0,
    dismissed: 0,
    has_amendment_linkage: 0
  } satisfies Record<InspectionReviewFilterValue, number>;

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
    const reviewSummary = getReviewCompletionSummary({
      tasks: inspection.tasks,
      deficiencies: [],
      documents: inspection.documents,
      attachments: inspection.attachments
    });
    const hasAmendmentLinkage = Boolean(originalAmendment || outgoingAmendment);
    const needsReview = !reviewSummary.readyForOfficeReview || inspection.closeoutRequest?.status === InspectionCloseoutRequestStatus.pending;

    if (needsReview) {
      filterCounts.needs_review += 1;
    }
    if (inspection.closeoutRequest?.status === InspectionCloseoutRequestStatus.pending) {
      filterCounts.pending_follow_up_request += 1;
    }
    if (inspection.closeoutRequest?.status === InspectionCloseoutRequestStatus.approved) {
      filterCounts.approved_created += 1;
    }
    if (inspection.closeoutRequest?.status === InspectionCloseoutRequestStatus.dismissed) {
      filterCounts.dismissed += 1;
    }
    if (hasAmendmentLinkage) {
      filterCounts.has_amendment_linkage += 1;
    }

    return {
      ...inspection,
      lifecycle,
      displayStatus: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart }),
      assignedTechnicianNames: formatAssignedTechnicianNames({
        assignedTechnician: inspection.assignedTechnician,
        technicianAssignments: readTechnicianNameAssignments(inspection)
      }),
      hasStartedWork,
      needsReview,
      reviewSummary,
      hasAmendmentLinkage,
      reportActivityCount: reportActivityCounts.get(inspection.id) ?? 0,
      originalAmendment,
      outgoingAmendment,
      latestAuditEntry: latestAuditByInspectionId.get(inspection.id) ?? null
    };
  }).filter((inspection) => {
    if (reviewFilter === "all") {
      return true;
    }
    if (reviewFilter === "needs_review") {
      return inspection.needsReview;
    }
    if (reviewFilter === "pending_follow_up_request") {
      return inspection.closeoutRequest?.status === InspectionCloseoutRequestStatus.pending;
    }
    if (reviewFilter === "approved_created") {
      return inspection.closeoutRequest?.status === InspectionCloseoutRequestStatus.approved;
    }
    if (reviewFilter === "dismissed") {
      return inspection.closeoutRequest?.status === InspectionCloseoutRequestStatus.dismissed;
    }
    if (reviewFilter === "has_amendment_linkage") {
      return inspection.hasAmendmentLinkage;
    }
    return true;
  });

  return {
    filter: reviewFilter,
    lifecycleCounts,
    filterCounts,
    items
  };
}

function buildMonthCalendar(inspections: Array<{
  scheduledStart: Date;
  status: InspectionStatus;
  inspectionClassification: InspectionClassification;
  isPriority: boolean;
  site: { name: string };
  customerCompany: { name: string };
}>) {
  return inspections.map((inspection) => ({
    ...getInspectionDisplayLabels({
      siteName: inspection.site.name,
      customerName: inspection.customerCompany.name
    }),
    dayKey: format(inspection.scheduledStart, "yyyy-MM-dd"),
    label: format(inspection.scheduledStart, "MMM d"),
    siteName: inspection.site.name,
    status: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart }),
    inspectionClassification: inspection.inspectionClassification,
    isPriority: inspection.isPriority
  }));
}

function filterTasksForTechnician<T extends {
  assignedTechnicianId?: string | null;
  schedulingStatus?: string | null;
}>(tasks: T[], technicianId: string) {
  return tasks.filter((task) => {
    const matchesAssignment = !task.assignedTechnicianId || task.assignedTechnicianId === technicianId;
    return matchesAssignment && isCurrentVisitTaskSchedulingStatus(task.schedulingStatus ?? "scheduled_now");
  });
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
        status: { in: [...activeOperationalInspectionStatuses] },
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
        closeoutRequest: {
          include: {
            requestedBy: { select: { id: true, name: true } }
          }
        },
        tasks: { include: { recurrence: true, report: true, assignedTechnician: true } },
        documents: {
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            label: true,
            fileName: true,
            requiresSignature: true,
            status: true,
            annotatedStorageKey: true,
            signedStorageKey: true,
            signedAt: true
          }
        }
      },
      orderBy: [{ scheduledStart: "asc" }]
    }),
    prisma.inspection.findMany({
      where: { tenantId, assignedTechnicianId: null, technicianAssignments: { none: {} }, claimable: true, status: { in: [...claimableInspectionStatuses] } },
      include: { site: true, customerCompany: true, assignedTechnician: true, technicianAssignments: { include: { technician: true } }, tasks: { include: { recurrence: true, report: true, assignedTechnician: true } } },
      orderBy: [{ scheduledStart: "asc" }]
    })
  ]);

  const assignedQueue = assignedInspections
    .map((inspection) => ({
      ...inspection,
      tasks: withInspectionTaskDisplayLabels(filterTasksForTechnician(inspection.tasks, parsedActor.userId))
    }))
    .filter((inspection) => inspection.tasks.length > 0);
  const monthAssigned = assignedQueue.filter((inspection) => inspection.scheduledStart >= monthStart && inspection.scheduledStart <= monthEnd);

  return {
    today: assignedQueue.filter((inspection) => isSameDay(inspection.scheduledStart, now)),
    thisWeek: assignedQueue.filter((inspection) => inspection.scheduledStart >= dayStart && inspection.scheduledStart <= weekEnd),
    thisMonth: monthAssigned,
    assigned: assignedQueue.map((inspection) => ({
      ...inspection,
      ...getInspectionDisplayLabels({
        siteName: inspection.site.name,
        customerName: inspection.customerCompany.name
      }),
      closeoutRequest: inspection.closeoutRequest,
      displayStatus: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart }),
      assignedTechnicianNames: formatAssignedTechnicianNames({
        assignedTechnician: inspection.assignedTechnician,
        technicianAssignments: readTechnicianNameAssignments(inspection)
      })
    })),
    unassigned: unassignedInspections
      .map((inspection) => ({
        ...inspection,
        tasks: withInspectionTaskDisplayLabels(
          inspection.tasks.filter((task) => isCurrentVisitTaskSchedulingStatus(task.schedulingStatus ?? "scheduled_now"))
        ),
        ...getInspectionDisplayLabels({
          siteName: inspection.site.name,
          customerName: inspection.customerCompany.name
        }),
        displayStatus: getInspectionDisplayStatus({ status: inspection.status, scheduledStart: inspection.scheduledStart }),
        assignedTechnicianNames: formatAssignedTechnicianNames({
          assignedTechnician: inspection.assignedTechnician,
          technicianAssignments: readTechnicianNameAssignments(inspection)
        })
      }))
      .filter((inspection) => inspection.tasks.length > 0),
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
