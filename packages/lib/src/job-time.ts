import { Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";
import { z } from "zod";

type Actor = { userId: string; tenantId?: string | null; role: string };
const officeRoles = ["tenant_admin", "office_admin", "platform_admin"];
const closedStatuses = ["completed", "invoiced", "cancelled"];
function isClosed(inspection: { status: string; archivedAt?: Date | null; reports?: Array<{ correctionState: string; status: string }> }) {
  const correction = inspection.reports?.some((report) => report.correctionState === "reissued_to_technician" && report.status !== "finalized");
  return !correction && (closedStatuses.includes(inspection.status) || Boolean(inspection.archivedAt));
}

async function authorize(actor: Actor, inspectionId: string) {
  if (!actor.tenantId || ![...officeRoles, "technician"].includes(actor.role)) throw new Error("Unauthorized");
  if (!await prisma.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId, isActive: true }, select: { id: true } })) throw new Error("Unauthorized");
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, tenantId: actor.tenantId },
    include: { technicianAssignments: { select: { technicianId: true } }, reports: { select: { correctionState: true, status: true } } }
  });
  if (!inspection) throw new Error("Inspection not found.");
  if (actor.role === "technician" && inspection.assignedTechnicianId !== actor.userId &&
      !inspection.technicianAssignments.some((assignment) => assignment.technicianId === actor.userId)) {
    throw new Error("Technician does not have access to this job.");
  }
  return inspection;
}

export async function getJobTime(actor: Actor, inspectionId: string) {
  const inspection = await authorize(actor, inspectionId);
  const [sessions, active, tenant, timeIssues] = await Promise.all([
    prisma.jobTimeSession.findMany({
      where: { tenantId: actor.tenantId!, inspectionId, ...(actor.role === "technician" ? { technicianId: actor.userId } : {}) },
      orderBy: { startedAt: "asc" }, include: { technician: { select: { name: true } } }
    }),
    prisma.jobTimeSession.findFirst({ where: { tenantId: actor.tenantId!, technicianId: actor.userId, endedAt: null },
      include: { inspection: { select: { customerCompany: { select: { name: true } } } } } }),
    prisma.tenant.findUnique({ where: { id: actor.tenantId! }, select: { timezone: true } }),
    actor.role === "technician" ? Promise.resolve([]) : prisma.auditLog.findMany({ where: { tenantId: actor.tenantId!, entityType: "Inspection", entityId: inspectionId, action: "job.time_conflict" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, createdAt: true, metadata: true } })
  ]);
  return { sessions, active, timeIssues, closed: isClosed(inspection), timezone: tenant?.timezone ?? "America/Chicago" };
}

export async function assertJobStarted(actor: Actor, inspectionId: string, db: Pick<Prisma.TransactionClient, "jobTimeSession"> = prisma) {
  if (actor.role !== "technician") return;
  if (!actor.tenantId || !await db.jobTimeSession.findFirst({ where: {
    tenantId: actor.tenantId, technicianId: actor.userId, inspectionId, endedAt: null
  }, select: { id: true } })) throw new Error("Start or resume this job before editing.");
}

export const jobTimeEventSchema = z.object({
  inspectionId: z.string().min(1), sessionId: z.string().uuid(), action: z.enum(["start", "pause"]),
  occurredAt: z.string().datetime(), offline: z.boolean().default(false), userId: z.string().min(1)
});

export async function recordJobTimeEvent(actor: Actor, raw: unknown) {
  const event = jobTimeEventSchema.parse(raw);
  if (event.userId !== actor.userId || actor.role !== "technician") throw new Error("Unauthorized job time event.");
  await authorize(actor, event.inspectionId);
  const now = new Date();
  const captured = new Date(event.occurredAt);
  if (captured.getTime() > now.getTime() + 60_000 || captured.getTime() < now.getTime() - 30 * 86400_000) {
    throw new Error("Job time needs office review: the device timestamp is outside the allowed range.");
  }
  const delayed = event.offline || now.getTime() - captured.getTime() > 60_000;
  if (delayed && captured > now) throw new Error("Job time needs office review: device time is in the future.");
  const time = delayed ? captured : now;
  return prisma.$transaction(async (tx) => {
    // Serialize starts and corrections across tabs/devices for this technician.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.tenantId!}), hashtext(${actor.userId}))`;
    const existing = await tx.jobTimeSession.findFirst({ where: { id: event.sessionId } });
    if (existing && (existing.tenantId !== actor.tenantId || existing.technicianId !== actor.userId || existing.inspectionId !== event.inspectionId)) {
      throw new Error("Invalid job session.");
    }
    if (event.action === "start") {
      if (existing) return existing;
      await tx.$queryRaw`SELECT "id" FROM "Inspection" WHERE "id" = ${event.inspectionId} AND "tenantId" = ${actor.tenantId!} FOR UPDATE`;
      const inspection = await tx.inspection.findFirst({ where: { id: event.inspectionId, tenantId: actor.tenantId! }, include: { reports: { select: { correctionState: true, status: true } } } });
      if (!inspection || isClosed(inspection)) throw new Error("Closed jobs cannot be started. Contact the office.");
      const overlap = await tx.jobTimeSession.findFirst({ where: { tenantId: actor.tenantId!, technicianId: actor.userId,
        OR: [{ endedAt: null }, { endedAt: { gt: time } }] } });
      if (overlap) throw new Error("Pause your current job first. Overlapping job time needs office review.");
      const session = await tx.jobTimeSession.create({ data: { id: event.sessionId, tenantId: actor.tenantId!, inspectionId: event.inspectionId,
        technicianId: actor.userId, startedAt: time, needsReview: delayed } });
      await tx.inspection.updateMany({ where: { id: event.inspectionId, tenantId: actor.tenantId!, status: { in: ["to_be_completed", "scheduled"] } }, data: { status: "in_progress" } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId!, actorUserId: actor.userId, action: "job.started", entityType: "Inspection", entityId: event.inspectionId, metadata: { sessionId: session.id, offline: event.offline, occurredAt: time.toISOString() } } });
      return session;
    }
    if (!existing) throw new Error("Job start has not synced yet. Retry syncing before pausing.");
    if (existing.endedAt) return existing;
    if (time < existing.startedAt) throw new Error("Job time needs office review: stop time is before start time.");
    const session = await tx.jobTimeSession.update({ where: { id: existing.id }, data: { endedAt: time, endReason: "paused", needsReview: existing.needsReview || delayed } });
    await tx.auditLog.create({ data: { tenantId: actor.tenantId!, actorUserId: actor.userId, action: "job.paused", entityType: "Inspection", entityId: event.inspectionId, metadata: { sessionId: session.id, occurredAt: time.toISOString() } } });
    return session;
  }).catch(async (error: unknown) => {
    await prisma.auditLog.create({ data: { tenantId: actor.tenantId!, actorUserId: actor.userId, action: "job.time_conflict", entityType: "Inspection", entityId: event.inspectionId,
      metadata: { sessionId: event.sessionId, occurredAt: event.occurredAt, message: error instanceof Error ? error.message : "Job time sync failed." } } }).catch(() => undefined);
    throw error;
  });
}

export async function stopJobTimeTx(tx: Prisma.TransactionClient, tenantId: string, inspectionId: string, endedAt: Date) {
  await tx.$queryRaw`SELECT "id" FROM "Inspection" WHERE "id" = ${inspectionId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  await tx.jobTimeSession.updateMany({ where: { tenantId, inspectionId, endedAt: null }, data: { endedAt, endReason: "completed" } });
}

export async function applyJobFinishTimeTx(tx: Prisma.TransactionClient, actor: Actor, inspectionId: string, finalizedAt: Date, capturedTime?: string) {
  if (actor.role !== "technician" || !actor.tenantId || !capturedTime) return;
  const finish = new Date(capturedTime);
  const age = finalizedAt.getTime() - finish.getTime();
  const where = { tenantId: actor.tenantId, inspectionId, technicianId: actor.userId, endReason: "completed", endedAt: finalizedAt };
  let needsReview = !Number.isFinite(age) || age < -60_000 || age > 30 * 86400_000;
  if (!needsReview && age <= 60_000) return;
  if (!needsReview) {
    needsReview = Boolean(await tx.jobTimeSession.findFirst({ where: { ...where, startedAt: { gt: finish } }, select: { id: true } }));
  }
  // Bad device clocks must not roll back a valid report and its billing handoff.
  const result = await tx.jobTimeSession.updateMany({ where, data: {
    ...(needsReview ? {} : { endedAt: finish }), needsReview: true
  } });
  if (needsReview && result.count) {
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, action: "job.time_conflict", entityType: "Inspection", entityId: inspectionId,
      metadata: { occurredAt: capturedTime, message: "Device finish time needs office review. Server completion time was retained." } } });
  }
}

export async function correctJobTime(actor: Actor, raw: unknown) {
  if (!actor.tenantId || !officeRoles.includes(actor.role)) throw new Error("Only office administrators can correct job time.");
  const input = z.object({ id: z.string().min(1), startedAt: z.string().datetime(), endedAt: z.string().datetime(), reason: z.string().trim().min(1).max(1000), updatedAt: z.string().datetime() }).parse(raw);
  const start = new Date(input.startedAt), end = new Date(input.endedAt);
  if (end < start || end > new Date()) throw new Error("Enter a valid start and finish time, not in the future.");
  return prisma.$transaction(async (tx) => {
    const session = await tx.jobTimeSession.findFirst({ where: { id: input.id, tenantId: actor.tenantId! } });
    if (!session) throw new Error("Job time not found.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.tenantId!}), hashtext(${session.technicianId}))`;
    const overlap = await tx.jobTimeSession.findFirst({ where: { tenantId: actor.tenantId!, technicianId: session.technicianId, id: { not: session.id }, startedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gt: start } }] } });
    if (overlap) throw new Error("These times overlap another job session.");
    const result = await tx.jobTimeSession.updateMany({ where: { id: session.id, tenantId: actor.tenantId!, updatedAt: new Date(input.updatedAt) }, data: { startedAt: start, endedAt: end, endReason: "office_corrected", needsReview: false } });
    if (!result.count) throw new Error("This session changed. Refresh before correcting it.");
    await tx.auditLog.create({ data: { tenantId: actor.tenantId!, actorUserId: actor.userId, action: "job.time_corrected", entityType: "Inspection", entityId: session.inspectionId,
      metadata: { sessionId: session.id, reason: input.reason, previousStart: session.startedAt.toISOString(), previousEnd: session.endedAt?.toISOString() ?? null, startedAt: input.startedAt, endedAt: input.endedAt } } });
  });
}
