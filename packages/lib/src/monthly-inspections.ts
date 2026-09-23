import "server-only";
import { prisma } from "@testworx/db";
import type { ActorContext } from "@testworx/types";
import { formatInspectionTaskSummary, formatInspectionStatusLabel, formatInspectionClassificationLabel } from "./scheduling";
import { formatTenantDateTime, normalizeTenantTimezone } from "./timezone";

export function inspectionMonthKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}`;
}

export async function getMonthlyInspectionList(actor: ActorContext, requestedMonth?: string) {
  if (!actor.tenantId || !["tenant_admin", "office_admin"].includes(actor.role)) throw new Error("Administrator access required.");
  const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { timezone: true } });
  const timezone = normalizeTenantTimezone(tenant?.timezone);
  const month = requestedMonth ?? inspectionMonthKey(new Date(), timezone);
  if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Select a valid month.");
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  // Pad the indexed query, then apply exact tenant-local month boundaries.
  const start = new Date(Date.UTC(year, monthNumber - 1, 0));
  const end = new Date(Date.UTC(year, monthNumber, 2));
  const inspections = await prisma.inspection.findMany({
    where: { tenantId: actor.tenantId, scheduledStart: { gte: start, lt: end } },
    orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
    select: {
      id: true, scheduledStart: true, status: true, inspectionClassification: true, isPriority: true,
      customerCompany: { select: { name: true } },
      site: { select: { name: true, addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true } },
      assignedTechnician: { select: { name: true } },
      technicianAssignments: { select: { technician: { select: { name: true } } } },
      tasks: { select: { inspectionType: true, customDisplayLabel: true, assignedTechnician: { select: { name: true } } }, orderBy: { sortOrder: "asc" } }
    }
  });
  return {
    month, timezone,
    rows: inspections.filter(row => inspectionMonthKey(row.scheduledStart, timezone) === month).map(row => ({
      id: row.id,
      values: [
        row.id.slice(-8).toUpperCase(), row.customerCompany.name, row.site.name,
        [row.site.addressLine1, row.site.addressLine2, row.site.city, row.site.state, row.site.postalCode].filter(Boolean).join(", "),
        formatTenantDateTime(row.scheduledStart, timezone),
        formatInspectionTaskSummary(row.tasks.map(task => ({ inspectionType: task.inspectionType, displayLabel: task.customDisplayLabel }))),
        formatInspectionStatusLabel(row.status), formatInspectionClassificationLabel(row.inspectionClassification),
        row.isPriority ? "Priority" : "Normal",
        [...new Set([row.assignedTechnician?.name, ...row.technicianAssignments.map(item => item.technician.name), ...row.tasks.map(task => task.assignedTechnician?.name)].filter(Boolean))].join(", ") || "Unassigned"
      ]
    }))
  };
}
