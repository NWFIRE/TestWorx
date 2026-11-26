import { prisma } from "@testworx/db";
import { z } from "zod";
import { subscriberFeaturesEnabled, supportPagePath } from "./subscriber-policy";

export async function supportActor(userId: string) {
  if (!subscriberFeaturesEnabled()) throw new Error("Subscriber staging is not enabled.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: {
    id: true, name: true, role: true, tenantId: true, isActive: true
  } });
  if (!user?.isActive || (!user.tenantId && user.role !== "platform_admin")) throw new Error("Access denied.");
  return user;
}

export async function requireSupportOperator(userId: string) {
  const actor = await supportActor(userId);
  if (actor.role !== "platform_admin") throw new Error("Access denied.");
  return actor;
}

export async function listDeliveryDiagnostics(userId: string, query = "") {
  await requireSupportOperator(userId);
  const q = query.trim().slice(0, 100);
  return prisma.reportDelivery.findMany({ where: {
    OR: [{ status: { in: ["failed", "uncertain"] } }, { status: "sending", attemptedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } }],
    ...(q ? { AND: [{ OR: [{ id: q }, { reportId: q }, { tenant: { name: { contains: q, mode: "insensitive" as const } } }] }] } : {})
  }, select: { id: true, reportId: true, status: true, failureCode: true, providerMessageId: true,
    attemptedAt: true, attachmentId: true, tenant: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 100 });
}

export async function getSupportTicket(userId: string, id: string) {
  const actor = await supportActor(userId);
  const operator = actor.role === "platform_admin";
  return prisma.supportTicket.findFirst({ where: { id, ...(operator ? {} : { tenantId: actor.tenantId!, requesterId: actor.id }) },
    include: { tenant: { select: { name: true } }, screenshot: { select: { id: true } },
      messages: { where: operator ? {} : { internal: false }, orderBy: { createdAt: "asc" } } } });
}

export async function listSupportTickets(userId: string, query = "") {
  const actor = await supportActor(userId);
  const operator = actor.role === "platform_admin";
  const q = query.trim().slice(0, 100);
  const number = Number(q.replace(/^SUP-/i, ""));
  return prisma.supportTicket.findMany({ where: {
    ...(operator ? {} : { tenantId: actor.tenantId!, requesterId: actor.id }),
    ...(q ? { OR: [ { tenant: { name: { contains: q, mode: "insensitive" as const } } },
      ...(Number.isSafeInteger(number) && number > 0 ? [{ number }] : []) ] } : {})
  }, select: { id: true, number: true, title: true, blocked: true, status: true, updatedAt: true,
    tenant: { select: { name: true } } }, orderBy: [{ status: "asc" }, { blocked: "desc" }, { updatedAt: "desc" }], take: 100 });
}

const problemSchema = z.object({ title: z.string().trim().min(5).max(160), description: z.string().trim().min(10).max(6000),
  blocked: z.boolean(), pagePath: z.string().max(1000), errorReference: z.string().regex(/^[a-zA-Z0-9_.:-]{0,100}$/).optional(),
  reportId: z.string().max(100).optional() });

export async function createSupportTicket(userId: string, raw: z.input<typeof problemSchema>, screenshot?: { bytes: Buffer; mimeType: string }) {
  const actor = await supportActor(userId);
  if (!actor.tenantId) throw new Error("Select a subscriber workspace to report a problem.");
  const input = problemSchema.parse(raw);
  if (input.reportId) {
    const report = await prisma.inspectionReport.findFirst({ where: { id: input.reportId, tenantId: actor.tenantId,
      ...(actor.role === "technician" ? { inspection: { OR: [{ assignedTechnicianId: actor.id }, { technicianAssignments: { some: { technicianId: actor.id } } }] } } : {}),
      ...(actor.role === "customer_user" ? { id: "__not_permitted__" } : {}) }, select: { id: true } });
    if (!report) throw new Error("Report reference is not accessible in this workspace.");
  }
  if (screenshot) {
    const png = screenshot.bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = screenshot.bytes[0] === 255 && screenshot.bytes[1] === 216 && screenshot.bytes[2] === 255;
    if (screenshot.bytes.length > 2 * 1024 * 1024 || !((png && screenshot.mimeType === "image/png") || (jpg && screenshot.mimeType === "image/jpeg"))) {
      throw new Error("Use a PNG or JPEG screenshot smaller than 2 MB.");
    }
  }
  return prisma.$transaction(async tx => {
    const ticket = await tx.supportTicket.create({ data: { tenantId: actor.tenantId!, requesterId: actor.id, requesterRole: actor.role,
      title: input.title, description: input.description, blocked: input.blocked, pagePath: supportPagePath(input.pagePath),
      appVersion: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_VERSION ?? "staging-unreleased").slice(0, 80),
      errorReference: input.errorReference || null, reportId: input.reportId || null,
      ...(screenshot ? { screenshot: { create: { bytes: new Uint8Array(screenshot.bytes), mimeType: screenshot.mimeType } } } : {}) } });
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.id, action: "support.created", entityType: "SupportTicket", entityId: ticket.id, metadata: { blocked: input.blocked } } });
    return ticket;
  });
}

export async function updateSupportTicket(userId: string, id: string, input: { action: string; body?: string; assigneeId?: string }) {
  const actor = await supportActor(userId);
  const ticket = await getSupportTicket(userId, id);
  if (!ticket) throw new Error("Request not found.");
  const operator = actor.role === "platform_admin";
  const action = z.enum(["reply", "note", "resolve", "reopen", "assign"]).parse(input.action);
  if (["note", "resolve", "assign"].includes(action) && !operator) throw new Error("Access denied.");
  const body = ["reply", "note"].includes(action) ? z.string().trim().min(1).max(6000).parse(input.body) : null;
  if (action === "assign" && input.assigneeId) await requireSupportOperator(input.assigneeId);
  return prisma.$transaction(async tx => {
    if (body) await tx.supportMessage.create({ data: { ticketId: id, authorId: actor.id, authorName: actor.name, internal: action === "note", body } });
    await tx.supportTicket.update({ where: { id }, data: {
      updatedAt: new Date(), ...(action === "resolve" ? { status: "resolved" } : {}),
      ...(action === "reopen" || (!operator && action === "reply") ? { status: "open" } : {}),
      ...(action === "assign" ? { assignedOperatorId: input.assigneeId || null } : {}) } });
    await tx.auditLog.create({ data: { tenantId: ticket.tenantId, actorUserId: actor.id, action: `support.${action}`, entityType: "SupportTicket", entityId: id,
      metadata: action === "assign" ? { assignedOperatorId: input.assigneeId || null } : {} } });
  });
}
