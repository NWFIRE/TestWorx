import { addDays, endOfDay, format, startOfDay, startOfWeek } from "date-fns";
import { prisma, type Prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";
import { assertTenantContext } from "./permissions";
import { DEFAULT_TENANT_TIMEZONE, formatTenantDate, formatTenantDateTime, normalizeTenantTimezone } from "./timezone";

const DEFAULT_LUNCH_DEDUCTION_MINUTES = 30;
const adminRoles = new Set(["tenant_admin", "office_admin", "platform_admin"]);
const internalRoles = new Set(["tenant_admin", "office_admin", "platform_admin", "technician"]);

const correctionSchema = z.object({
  timeEntryId: z.string().trim().min(1),
  clockInAt: z.coerce.date(),
  clockOutAt: z.coerce.date(),
  notes: z.string().trim().max(1000).optional().nullable(),
  correctionReason: z.string().trim().min(1).max(1000)
}).refine((input) => input.clockOutAt >= input.clockInAt, {
  message: "Clock-out must be after clock-in.",
  path: ["clockOutAt"]
});

export type TimesheetEntrySummary = {
  id: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  clockInLabel: string;
  clockOutLabel: string;
  grossMinutes: number;
  lunchDeductionMinutes: number;
  netMinutes: number;
  status: string;
  notes: string | null;
};

export type TimesheetDaySummary = {
  date: Date;
  dateKey: string;
  label: string;
  clockInLabel: string;
  clockOutLabel: string;
  grossMinutes: number;
  lunchDeductionMinutes: number;
  netMinutes: number;
  notes: string;
  entries: TimesheetEntrySummary[];
};

export type TimesheetTotals = {
  grossMinutes: number;
  lunchDeductionMinutes: number;
  netMinutes: number;
};

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  if (!internalRoles.has(parsed.role)) {
    throw new Error("Timesheets are only available to internal users.");
  }
  return parsed;
}

function requireTenantId(parsedActor: ReturnType<typeof parseActor>) {
  if (!parsedActor.tenantId) {
    throw new Error("Tenant context is required.");
  }
  return parsedActor.tenantId;
}

function ensureAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!adminRoles.has(parsedActor.role)) {
    throw new Error("Only admins can manage employee timesheets.");
  }
}

export function calculateTimeEntryMinutes(
  clockInAt: Date,
  clockOutAt: Date,
  lunchDeductionMinutes = DEFAULT_LUNCH_DEDUCTION_MINUTES
) {
  const grossMinutes = Math.max(0, Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60000));
  const appliedLunchDeductionMinutes = grossMinutes > 0 ? Math.min(lunchDeductionMinutes, grossMinutes) : 0;
  return {
    grossMinutes,
    lunchDeductionMinutes: appliedLunchDeductionMinutes,
    netMinutes: Math.max(0, grossMinutes - appliedLunchDeductionMinutes)
  };
}

function getWeekStart(value?: Date | string | null) {
  const parsed = value instanceof Date ? value : value ? new Date(`${value}T00:00:00`) : new Date();
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return startOfWeek(safeDate, { weekStartsOn: 1 });
}

function weekRange(weekStart: Date) {
  const start = startOfDay(weekStart);
  const end = endOfDay(addDays(start, 6));
  return { start, end };
}

function formatTime(value: Date | null | undefined, timezone: string) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(value);
}

function minutesToHours(minutes: number) {
  return Number((minutes / 60).toFixed(2));
}

export function formatTimesheetHours(minutes: number) {
  return minutesToHours(minutes).toFixed(2);
}

async function getTenantTimezone(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true }
  });
  return normalizeTenantTimezone(tenant?.timezone ?? DEFAULT_TENANT_TIMEZONE);
}

async function writeTimesheetAuditLog(
  actor: ReturnType<typeof parseActor>,
  action: string,
  entityId: string,
  metadata?: Prisma.InputJsonValue
) {
  await prisma.auditLog.create({
    data: {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action,
      entityType: "TimeEntry",
      entityId,
      metadata: metadata ?? {}
    }
  });
}

function serializeEntry(entry: {
  id: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  grossMinutes: number;
  lunchDeductionMinutes: number;
  netMinutes: number;
  status: string;
  notes: string | null;
}, timezone: string): TimesheetEntrySummary {
  return {
    id: entry.id,
    clockInAt: entry.clockInAt,
    clockOutAt: entry.clockOutAt,
    clockInLabel: formatTime(entry.clockInAt, timezone),
    clockOutLabel: formatTime(entry.clockOutAt, timezone),
    grossMinutes: entry.grossMinutes,
    lunchDeductionMinutes: entry.lunchDeductionMinutes,
    netMinutes: entry.netMinutes,
    status: entry.status,
    notes: entry.notes
  };
}

function buildWeekRows(
  weekStart: Date,
  entries: Array<{
    id: string;
    clockInAt: Date;
    clockOutAt: Date | null;
    grossMinutes: number;
    lunchDeductionMinutes: number;
    netMinutes: number;
    status: string;
    notes: string | null;
  }>,
  timezone: string
) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const dateStart = startOfDay(date);
    const dateEnd = endOfDay(date);
    const dayEntries = entries
      .filter((entry) => entry.clockInAt >= dateStart && entry.clockInAt <= dateEnd)
      .sort((first, second) => first.clockInAt.getTime() - second.clockInAt.getTime());
    const grossMinutes = dayEntries.reduce((total, entry) => total + entry.grossMinutes, 0);
    const lunchDeductionMinutes = grossMinutes > 0 ? Math.min(DEFAULT_LUNCH_DEDUCTION_MINUTES, grossMinutes) : 0;
    const netMinutes = Math.max(0, grossMinutes - lunchDeductionMinutes);
    const firstClockIn = dayEntries[0]?.clockInAt ?? null;
    const lastClockOut = [...dayEntries].reverse().find((entry) => entry.clockOutAt)?.clockOutAt ?? null;

    return {
      date,
      dateKey: format(date, "yyyy-MM-dd"),
      label: `${format(date, "EEEE")} • ${formatTenantDate(date, timezone)}`,
      clockInLabel: formatTime(firstClockIn, timezone),
      clockOutLabel: formatTime(lastClockOut, timezone),
      grossMinutes,
      lunchDeductionMinutes,
      netMinutes,
      notes: dayEntries.map((entry) => entry.notes).filter(Boolean).join("; "),
      entries: dayEntries.map((entry) => serializeEntry(entry, timezone))
    } satisfies TimesheetDaySummary;
  });
}

function summarizeRows(rows: TimesheetDaySummary[]): TimesheetTotals {
  return rows.reduce(
    (totals, row) => ({
      grossMinutes: totals.grossMinutes + row.grossMinutes,
      lunchDeductionMinutes: totals.lunchDeductionMinutes + row.lunchDeductionMinutes,
      netMinutes: totals.netMinutes + row.netMinutes
    }),
    { grossMinutes: 0, lunchDeductionMinutes: 0, netMinutes: 0 }
  );
}

export async function clockInEmployee(actor: ActorContext, now = new Date()) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const existingOpenEntry = await prisma.timeEntry.findFirst({
    where: {
      tenantId,
      employeeId: parsedActor.userId,
      status: "open"
    },
    orderBy: { clockInAt: "desc" }
  });

  if (existingOpenEntry) {
    throw new Error("You are already clocked in. Clock out before starting another time entry.");
  }

  const entry = await prisma.timeEntry.create({
    data: {
      tenantId,
      employeeId: parsedActor.userId,
      clockInAt: now,
      lunchDeductionMinutes: DEFAULT_LUNCH_DEDUCTION_MINUTES,
      status: "open"
    }
  });
  await writeTimesheetAuditLog(parsedActor, "time_entry.clock_in", entry.id, { clockInAt: now.toISOString() });
  return entry;
}

export async function clockOutEmployee(actor: ActorContext, now = new Date()) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const openEntry = await prisma.timeEntry.findFirst({
    where: {
      tenantId,
      employeeId: parsedActor.userId,
      status: "open"
    },
    orderBy: { clockInAt: "desc" }
  });

  if (!openEntry) {
    throw new Error("You are not clocked in.");
  }

  const totals = calculateTimeEntryMinutes(openEntry.clockInAt, now, DEFAULT_LUNCH_DEDUCTION_MINUTES);
  const entry = await prisma.timeEntry.update({
    where: { id: openEntry.id },
    data: {
      clockOutAt: now,
      grossMinutes: totals.grossMinutes,
      lunchDeductionMinutes: totals.lunchDeductionMinutes,
      netMinutes: totals.netMinutes,
      status: "closed"
    }
  });
  await writeTimesheetAuditLog(parsedActor, "time_entry.clock_out", entry.id, {
    clockInAt: openEntry.clockInAt.toISOString(),
    clockOutAt: now.toISOString(),
    ...totals
  });
  return entry;
}

export async function getEmployeeTimesheet(actor: ActorContext, week?: string | Date | null) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const timezone = await getTenantTimezone(tenantId);
  const weekStart = getWeekStart(week);
  const range = weekRange(weekStart);
  const [activeEntry, weekEntries] = await Promise.all([
    prisma.timeEntry.findFirst({
      where: {
        tenantId,
        employeeId: parsedActor.userId,
        status: "open"
      },
      orderBy: { clockInAt: "desc" }
    }),
    prisma.timeEntry.findMany({
      where: {
        tenantId,
        employeeId: parsedActor.userId,
        clockInAt: {
          gte: range.start,
          lte: range.end
        }
      },
      orderBy: { clockInAt: "asc" }
    })
  ]);
  const rows = buildWeekRows(weekStart, weekEntries, timezone);
  const activeWorkedMinutes = activeEntry ? Math.max(0, Math.round((Date.now() - activeEntry.clockInAt.getTime()) / 60000)) : 0;
  const todayStart = startOfDay(new Date());

  return {
    timezone,
    weekStart,
    weekEnd: range.end,
    weekStartInput: format(weekStart, "yyyy-MM-dd"),
    currentStatus: activeEntry ? "Clocked In" : "Clocked Out",
    currentTimeLabel: formatTenantDateTime(new Date(), timezone),
    todayClockInLabel: activeEntry ? formatTime(activeEntry.clockInAt, timezone) : "—",
    todayWorkedMinutes: activeWorkedMinutes,
    activeEntry: activeEntry ? serializeEntry(activeEntry, timezone) : null,
    activeEntryIsFromPriorDay: activeEntry ? activeEntry.clockInAt < todayStart : false,
    rows,
    totals: summarizeRows(rows)
  };
}

export async function getAdminTimesheetWorkspace(actor: ActorContext, input?: { week?: string | null; employeeId?: string | null }) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const tenantId = requireTenantId(parsedActor);
  const timezone = await getTenantTimezone(tenantId);
  const weekStart = getWeekStart(input?.week);
  const range = weekRange(weekStart);
  const employees = await prisma.user.findMany({
    where: {
      tenantId,
      role: { in: ["tenant_admin", "office_admin", "technician"] },
      isActive: true
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  });
  const visibleEmployees = input?.employeeId
    ? employees.filter((employee) => employee.id === input.employeeId)
    : employees;
  const employeeIds = visibleEmployees.map((employee) => employee.id);
  const entries = employeeIds.length > 0
    ? await prisma.timeEntry.findMany({
        where: {
          tenantId,
          employeeId: { in: employeeIds },
          clockInAt: {
            gte: range.start,
            lte: range.end
          }
        },
        orderBy: [{ employeeId: "asc" }, { clockInAt: "asc" }]
      })
    : [];

  const employeeSummaries = visibleEmployees.map((employee) => {
    const rows = buildWeekRows(
      weekStart,
      entries.filter((entry) => entry.employeeId === employee.id),
      timezone
    );
    return {
      employee,
      rows,
      totals: summarizeRows(rows)
    };
  });

  return {
    timezone,
    filters: {
      weekStartInput: format(weekStart, "yyyy-MM-dd"),
      employeeId: input?.employeeId ?? ""
    },
    employees,
    employeeSummaries,
    totals: employeeSummaries.reduce(
      (total, summary) => ({
        grossMinutes: total.grossMinutes + summary.totals.grossMinutes,
        lunchDeductionMinutes: total.lunchDeductionMinutes + summary.totals.lunchDeductionMinutes,
        netMinutes: total.netMinutes + summary.totals.netMinutes
      }),
      { grossMinutes: 0, lunchDeductionMinutes: 0, netMinutes: 0 }
    )
  };
}

export async function correctTimeEntry(actor: ActorContext, input: unknown) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const tenantId = requireTenantId(parsedActor);
  const parsedInput = correctionSchema.parse(input);
  const existingEntry = await prisma.timeEntry.findFirst({
    where: {
      id: parsedInput.timeEntryId,
      tenantId
    }
  });

  if (!existingEntry) {
    throw new Error("Time entry not found.");
  }

  const totals = calculateTimeEntryMinutes(parsedInput.clockInAt, parsedInput.clockOutAt, DEFAULT_LUNCH_DEDUCTION_MINUTES);
  const updatedEntry = await prisma.timeEntry.update({
    where: { id: existingEntry.id },
    data: {
      clockInAt: parsedInput.clockInAt,
      clockOutAt: parsedInput.clockOutAt,
      grossMinutes: totals.grossMinutes,
      lunchDeductionMinutes: totals.lunchDeductionMinutes,
      netMinutes: totals.netMinutes,
      status: "corrected",
      notes: parsedInput.notes ?? null,
      correctionReason: parsedInput.correctionReason,
      correctedByUserId: parsedActor.userId,
      correctedAt: new Date()
    }
  });
  await writeTimesheetAuditLog(parsedActor, "time_entry.corrected", updatedEntry.id, {
    previousClockInAt: existingEntry.clockInAt.toISOString(),
    previousClockOutAt: existingEntry.clockOutAt?.toISOString() ?? null,
    clockInAt: parsedInput.clockInAt.toISOString(),
    clockOutAt: parsedInput.clockOutAt.toISOString(),
    correctionReason: parsedInput.correctionReason,
    ...totals
  });
  return updatedEntry;
}
