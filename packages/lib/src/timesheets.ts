import { addDays, differenceInCalendarDays, endOfDay, format, startOfDay, startOfWeek } from "date-fns";
import { prisma, type Prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";
import { assertTenantContext } from "./permissions";
import { DEFAULT_TENANT_TIMEZONE, formatTenantDateTime, normalizeTenantTimezone } from "./timezone";

const DEFAULT_LUNCH_DEDUCTION_MINUTES = 30;
const MAX_TIME_ENTRY_MINUTES = 24 * 60;
const adminRoles = new Set(["tenant_admin", "office_admin", "platform_admin"]);
const internalRoles = new Set(["tenant_admin", "office_admin", "platform_admin", "technician"]);

const correctionSchema = z.object({
  timeEntryId: z.string().trim().min(1),
  clockInAt: z.union([z.date(), z.string().trim().min(1)]),
  clockOutAt: z.union([z.date(), z.string().trim().min(1)]),
  notes: z.string().trim().max(1000).optional().nullable(),
  correctionReason: z.string().trim().min(1).max(1000)
});

const adminCreateEntrySchema = z.object({
  employeeId: z.string().trim().min(1),
  clockInAt: z.union([z.date(), z.string().trim().min(1)]),
  clockOutAt: z.union([z.date(), z.string().trim().min(1)]),
  notes: z.string().trim().max(1000).optional().nullable(),
  correctionReason: z.string().trim().min(1).max(1000)
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

function calculateRawGrossMinutes(clockInAt: Date, clockOutAt: Date) {
  return Math.max(0, Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60000));
}

function dateTimePartsInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second)
  };
}

function timezoneOffsetMs(timezone: string, value: Date) {
  const parts = dateTimePartsInTimezone(value, timezone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtc - value.getTime();
}

function parseTenantDateTimeLocal(value: Date | string, timezone: string) {
  if (value instanceof Date) {
    return value;
  }
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})/.exec(value.trim());
  if (!match?.groups) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Invalid time entry date.");
    }
    return parsed;
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utc = new Date(localAsUtc - timezoneOffsetMs(timezone, new Date(localAsUtc)));
  utc = new Date(localAsUtc - timezoneOffsetMs(timezone, utc));
  return utc;
}

function validateTimesheetDateRange(clockInAt: Date, clockOutAt: Date) {
  if (clockOutAt < clockInAt) {
    throw new Error("Clock-out must be after clock-in.");
  }
  if (calculateRawGrossMinutes(clockInAt, clockOutAt) > MAX_TIME_ENTRY_MINUTES) {
    throw new Error("Time entries cannot exceed 24 hours. Create separate daily entries for longer work spans.");
  }
}

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
  const grossMinutes = calculateRawGrossMinutes(clockInAt, clockOutAt);
  const appliedLunchDeductionMinutes = grossMinutes > 0 ? Math.min(lunchDeductionMinutes, grossMinutes) : 0;
  return {
    grossMinutes,
    lunchDeductionMinutes: appliedLunchDeductionMinutes,
    netMinutes: Math.max(0, grossMinutes - appliedLunchDeductionMinutes)
  };
}

function parseDateKey(value?: Date | string | null) {
  if (value instanceof Date) {
    return format(value, "yyyy-MM-dd");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const dateOnlyMatch = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/.exec(trimmed);
    if (dateOnlyMatch?.groups) {
      return `${dateOnlyMatch.groups.year}-${dateOnlyMatch.groups.month}-${dateOnlyMatch.groups.day}`;
    }
  }
  return format(new Date(), "yyyy-MM-dd");
}

function dateKeyToDate(dateKey: string) {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function addDaysToDateKey(dateKey: string, amount: number) {
  return format(addDays(dateKeyToDate(dateKey), amount), "yyyy-MM-dd");
}

function formatDateKeyLabel(dateKey: string) {
  const date = dateKeyToDate(dateKey);
  return `${format(date, "EEEE")} • ${format(date, "MMM d, yyyy")}`;
}

function getWeekStart(value?: Date | string | null) {
  const parsedDateKey = parseDateKey(value);
  const parsed = dateKeyToDate(parsedDateKey);
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

function formatDateKeyInTimezone(value: Date, timezone: string) {
  const parts = dateTimePartsInTimezone(value, timezone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatTimesheetDateTimeLocal(value: Date | null | undefined, timezone: string) {
  if (!value) {
    return "";
  }
  const parts = dateTimePartsInTimezone(value, timezone);
  return [
    `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
  ].join("T");
}

function normalizeEntryForDisplay(entry: {
  clockInAt: Date;
  clockOutAt: Date | null;
  grossMinutes: number;
  lunchDeductionMinutes: number;
  netMinutes: number;
}) {
  if (!entry.clockOutAt || entry.grossMinutes <= MAX_TIME_ENTRY_MINUTES) {
    return {
      grossMinutes: entry.grossMinutes,
      lunchDeductionMinutes: entry.lunchDeductionMinutes,
      netMinutes: entry.netMinutes
    };
  }

  const calendarDaySpan = differenceInCalendarDays(entry.clockOutAt, entry.clockInAt);
  if (calendarDaySpan <= 0) {
    return {
      grossMinutes: entry.grossMinutes,
      lunchDeductionMinutes: entry.lunchDeductionMinutes,
      netMinutes: entry.netMinutes
    };
  }

  const sameDayClockOut = new Date(entry.clockInAt);
  sameDayClockOut.setUTCHours(
    entry.clockOutAt.getUTCHours(),
    entry.clockOutAt.getUTCMinutes(),
    entry.clockOutAt.getUTCSeconds(),
    entry.clockOutAt.getUTCMilliseconds()
  );

  if (sameDayClockOut < entry.clockInAt) {
    return {
      grossMinutes: entry.grossMinutes,
      lunchDeductionMinutes: entry.lunchDeductionMinutes,
      netMinutes: entry.netMinutes
    };
  }

  return calculateTimeEntryMinutes(entry.clockInAt, sameDayClockOut, DEFAULT_LUNCH_DEDUCTION_MINUTES);
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
  const normalizedTotals = normalizeEntryForDisplay(entry);
  return {
    id: entry.id,
    clockInAt: entry.clockInAt,
    clockOutAt: entry.clockOutAt,
    clockInLabel: formatTime(entry.clockInAt, timezone),
    clockOutLabel: formatTime(entry.clockOutAt, timezone),
    grossMinutes: normalizedTotals.grossMinutes,
    lunchDeductionMinutes: normalizedTotals.lunchDeductionMinutes,
    netMinutes: normalizedTotals.netMinutes,
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
  const weekStartKey = format(weekStart, "yyyy-MM-dd");
  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = addDaysToDateKey(weekStartKey, index);
    const date = dateKeyToDate(dateKey);
    const dayEntries = entries
      .filter((entry) => formatDateKeyInTimezone(entry.clockInAt, timezone) === dateKey)
      .sort((first, second) => first.clockInAt.getTime() - second.clockInAt.getTime());
    const serializedEntries = dayEntries.map((entry) => serializeEntry(entry, timezone));
    const grossMinutes = serializedEntries.reduce((total, entry) => total + entry.grossMinutes, 0);
    const lunchDeductionMinutes = grossMinutes > 0 ? Math.min(DEFAULT_LUNCH_DEDUCTION_MINUTES, grossMinutes) : 0;
    const netMinutes = Math.max(0, grossMinutes - lunchDeductionMinutes);
    const firstClockIn = dayEntries[0]?.clockInAt ?? null;
    const lastClockOut = [...dayEntries].reverse().find((entry) => entry.clockOutAt)?.clockOutAt ?? null;

    return {
      date,
      dateKey,
      label: formatDateKeyLabel(dateKey),
      clockInLabel: formatTime(firstClockIn, timezone),
      clockOutLabel: formatTime(lastClockOut, timezone),
      grossMinutes,
      lunchDeductionMinutes,
      netMinutes,
      notes: dayEntries.map((entry) => entry.notes).filter(Boolean).join("; "),
      entries: serializedEntries
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
          gte: addDays(range.start, -1),
          lte: addDays(range.end, 1)
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
            gte: addDays(range.start, -1),
            lte: addDays(range.end, 1)
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
  const timezone = await getTenantTimezone(tenantId);
  const parsedInput = correctionSchema.parse(input);
  const clockInAt = parseTenantDateTimeLocal(parsedInput.clockInAt, timezone);
  const clockOutAt = parseTenantDateTimeLocal(parsedInput.clockOutAt, timezone);
  validateTimesheetDateRange(clockInAt, clockOutAt);
  const existingEntry = await prisma.timeEntry.findFirst({
    where: {
      id: parsedInput.timeEntryId,
      tenantId
    }
  });

  if (!existingEntry) {
    throw new Error("Time entry not found.");
  }

  const totals = calculateTimeEntryMinutes(clockInAt, clockOutAt, DEFAULT_LUNCH_DEDUCTION_MINUTES);
  const updatedEntry = await prisma.timeEntry.update({
    where: { id: existingEntry.id },
    data: {
      clockInAt,
      clockOutAt,
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
    clockInAt: clockInAt.toISOString(),
    clockOutAt: clockOutAt.toISOString(),
    correctionReason: parsedInput.correctionReason,
    ...totals
  });
  return updatedEntry;
}

export async function createAdminTimeEntry(actor: ActorContext, input: unknown) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const tenantId = requireTenantId(parsedActor);
  const timezone = await getTenantTimezone(tenantId);
  const parsedInput = adminCreateEntrySchema.parse(input);
  const clockInAt = parseTenantDateTimeLocal(parsedInput.clockInAt, timezone);
  const clockOutAt = parseTenantDateTimeLocal(parsedInput.clockOutAt, timezone);
  validateTimesheetDateRange(clockInAt, clockOutAt);
  const employee = await prisma.user.findFirst({
    where: {
      id: parsedInput.employeeId,
      tenantId,
      isActive: true,
      role: { in: ["tenant_admin", "office_admin", "technician"] }
    },
    select: { id: true }
  });

  if (!employee) {
    throw new Error("Employee not found.");
  }

  const totals = calculateTimeEntryMinutes(clockInAt, clockOutAt, DEFAULT_LUNCH_DEDUCTION_MINUTES);
  const createdEntry = await prisma.timeEntry.create({
    data: {
      tenantId,
      employeeId: employee.id,
      clockInAt,
      clockOutAt,
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

  await writeTimesheetAuditLog(parsedActor, "time_entry.admin_created", createdEntry.id, {
    employeeId: employee.id,
    clockInAt: clockInAt.toISOString(),
    clockOutAt: clockOutAt.toISOString(),
    correctionReason: parsedInput.correctionReason,
    ...totals
  });

  return createdEntry;
}
