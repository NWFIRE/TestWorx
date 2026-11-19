import "server-only";
import { prisma } from "@testworx/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { serviceDestination } from "./service-directions";
import { normalizeTenantTimezone } from "./timezone";
import { localDateTime, schedulerInstant, schedulerRange, type SchedulerData, type SchedulerJob } from "./scheduler-shared";

type Actor = { userId: string; tenantId?: string | null; role: string };
const assignableRoles = ["technician", "office_admin", "tenant_admin"] as const;
const officeRoles = ["office_admin", "tenant_admin"];
async function authorize(actor: Actor) {
  if (!actor.tenantId || !officeRoles.includes(actor.role)) throw new Error("Only office administrators can access Scheduler.");
  const user = await prisma.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId, isActive: true, role: { in: ["office_admin", "tenant_admin"] } }, select: { id: true } });
  if (!user) throw new Error("Scheduler access is unavailable.");
  return actor.tenantId;
}
const select = {
  id: true, scheduledStart: true, scheduledEnd: true, updatedAt: true, status: true, archivedAt: true, assignedTechnicianId: true,
  customerCompany: { select: { id: true, name: true, serviceAddressLine1: true, serviceAddressLine2: true, serviceCity: true, serviceState: true, servicePostalCode: true, serviceCountry: true, billingAddressLine1: true, billingAddressLine2: true, billingCity: true, billingState: true, billingPostalCode: true, billingCountry: true } },
  site: { select: { id: true, name: true, addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true, latitude: true, longitude: true } },
  tasks: { select: { inspectionType: true } }, technicianAssignments: { select: { technicianId: true } },
  jobTimeSessions: { select: { technicianId: true, startedAt: true, endedAt: true, endReason: true } }
} satisfies Prisma.InspectionSelect;
function serialize(job: Prisma.InspectionGetPayload<{ select: typeof select }>): SchedulerJob {
  return { id: job.id, customer: job.customerCompany.name, site: /general.*no fixed|no fixed site/i.test(job.site.name) ? "" : job.site.name,
    serviceLocation: job.site,
    customerLocation: job.customerCompany,
    address: serviceDestination(job.site, job.customerCompany).address,
    types: [...new Set(job.tasks.map((t) => t.inspectionType))],
    technicianIds: [...new Set([job.assignedTechnicianId, ...job.technicianAssignments.map((a) => a.technicianId)].filter((id): id is string => Boolean(id)))],
    scheduledStart: job.scheduledStart.toISOString(), scheduledEnd: job.scheduledEnd?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(), status: job.status,
    sessions: job.jobTimeSessions.map((s) => ({ ...s, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null })) };
}

export async function getScheduler(actor: Actor, raw: { date?: string; view?: string }): Promise<SchedulerData> {
  const tenantId = await authorize(actor);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } });
  const timezone = normalizeTenantTimezone(tenant.timezone), today = localDateTime(new Date(), timezone).slice(0, 10);
  const view = z.enum(["day", "week"]).parse(raw.view || "day");
  const range = schedulerRange(raw.date || today, view, timezone);
  const jobs = await prisma.inspection.findMany({ where: { tenantId, status: { not: "cancelled" }, OR: [
    { scheduledStart: { lt: range.end }, OR: [{ scheduledEnd: { gt: range.start } }, { scheduledStart: { gte: range.start } }] },
    ...(range.days.includes(today) ? [{ jobTimeSessions: { some: { tenantId, endedAt: null } } }] : [])
  ] }, select, orderBy: [{ scheduledStart: "asc" }, { id: "asc" }], take: 2001 });
  const assigned = [...new Set(jobs.flatMap((j) => [j.assignedTechnicianId, ...j.technicianAssignments.map((a) => a.technicianId)]).filter((id): id is string => Boolean(id)))];
  const technicians = await prisma.user.findMany({ where: { tenantId, OR: [
    { isActive: true, role: { in: [...assignableRoles] } }, { id: { in: assigned } }
  ] }, select: { id: true, name: true, isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  return { timezone, days: range.days, fetchedAt: new Date().toISOString(), truncated: jobs.length > 2000,
    technicians: technicians.map((t) => ({ ...t, name: t.name || "Team member" })), jobs: jobs.slice(0, 2000).map(serialize) };
}

export async function getSchedulerJob(actor: Actor, id: string) {
  const tenantId = await authorize(actor);
  const job = await prisma.inspection.findFirst({ where: { tenantId, id }, select });
  if (!job) throw new Error("Inspection no longer available.");
  return serialize(job);
}

export async function searchSchedulerJobs(actor: Actor, query: string) {
  const tenantId = await authorize(actor);
  const q = z.string().trim().min(2).max(100).parse(query);
  return (await prisma.inspection.findMany({ where: { tenantId, archivedAt: null, status: { notIn: ["completed", "invoiced", "cancelled"] }, OR: [
    { id: { contains: q, mode: "insensitive" } }, { customerCompany: { name: { contains: q, mode: "insensitive" } } }, { site: { name: { contains: q, mode: "insensitive" } } }
  ] }, select, take: 25, orderBy: [{ scheduledStart: "asc" }, { id: "asc" }] })).map(serialize);
}

export const schedulerSaveSchema = z.object({ inspectionId: z.string().min(1), updatedAt: z.string().datetime(),
  start: z.string(), end: z.string(), technicianIds: z.array(z.string().min(1)).min(1).max(50), allowOverlap: z.boolean().default(false) });

export async function saveSchedulerJob(actor: Actor, raw: unknown) {
  const tenantId = await authorize(actor), input = schedulerSaveSchema.parse(raw);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } });
  const timezone = normalizeTenantTimezone(tenant.timezone), start = schedulerInstant(input.start, timezone), end = schedulerInstant(input.end, timezone);
  if (end <= start || end.getTime() - start.getTime() > 7 * 86400000) throw new Error("End must follow start, within seven days.");
  const ids = [...new Set(input.technicianIds)];
  return prisma.$transaction(async (tx) => {
    // Serialize dispatch edits so two overlapping bookings cannot both pass the conflict check.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext('scheduler'))`;
    const existing = await tx.inspection.findFirst({ where: { id: input.inspectionId, tenantId }, select });
    if (!existing) throw new Error("Inspection not found.");
    if (existing.archivedAt || ["completed", "invoiced", "cancelled"].includes(existing.status)) throw new Error("Closed inspections cannot be rescheduled.");
    if (existing.updatedAt.toISOString() !== input.updatedAt) throw new Error("This job changed. Reload its details before saving.");
    const technicians = await tx.user.findMany({ where: { tenantId, id: { in: ids }, isActive: true, role: { in: [...assignableRoles] } }, select: { id: true } });
    if (technicians.length !== ids.length) throw new Error("Choose active technicians from your organization.");
    const conflicts = await tx.inspection.findMany({ where: { tenantId, id: { not: existing.id }, status: { notIn: ["completed", "invoiced", "cancelled"] },
      scheduledStart: { lt: end }, scheduledEnd: { gt: start }, OR: [{ assignedTechnicianId: { in: ids } }, { technicianAssignments: { some: { tenantId, technicianId: { in: ids } } } }]
    }, select: { id: true, customerCompany: { select: { name: true } } }, take: 10 });
    if (conflicts.length && !input.allowOverlap) return { ok: false as const, conflicts: conflicts.map((c) => ({ id: c.id, customer: c.customerCompany.name })) };
    const result = await tx.inspection.updateMany({ where: { tenantId, id: existing.id, updatedAt: new Date(input.updatedAt) },
      data: { scheduledStart: start, scheduledEnd: end, assignedTechnicianId: ids.includes(existing.assignedTechnicianId ?? "") ? existing.assignedTechnicianId : ids[0], claimable: false } });
    if (result.count !== 1) throw new Error("This job changed. Reload its details before saving.");
    await tx.inspectionTechnicianAssignment.deleteMany({ where: { tenantId, inspectionId: existing.id, technicianId: { notIn: ids } } });
    await tx.inspectionTechnicianAssignment.createMany({ data: ids.map((technicianId) => ({ tenantId, inspectionId: existing.id, technicianId })), skipDuplicates: true });
    // Preserve task due periods: they identify the recurring occurrence, not its appointment time.
    await tx.auditLog.create({ data: { tenantId, actorUserId: actor.userId, action: "inspection.scheduler_updated", entityType: "Inspection", entityId: existing.id,
      metadata: { before: { start: existing.scheduledStart.toISOString(), end: existing.scheduledEnd?.toISOString() ?? null, technicianIds: serialize(existing).technicianIds },
        after: { start: start.toISOString(), end: end.toISOString(), technicianIds: ids }, occurrenceOnly: true, overlapAcknowledged: input.allowOverlap } } });
    return { ok: true as const, job: serialize(await tx.inspection.findFirstOrThrow({ where: { id: existing.id, tenantId }, select })) };
  });
}
