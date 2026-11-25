import { prisma } from "@testworx/db";
import { z } from "zod";
import { supportActor, requireSupportOperator, getSupportTicket } from "./subscriber-support";
import { readStoredFile, assertStorageKeyBelongsToTenant } from "./storage";
import { sendWithResend } from "./account-email";

export async function requestReportDelivery(userId: string, reportId: string) {
  const actor = await supportActor(userId);
  if (!["tenant_admin", "office_admin"].includes(actor.role) || !actor.tenantId) throw new Error("Company administrators send customer reports.");
  const report = await prisma.inspectionReport.findFirst({ where: { id: reportId, tenantId: actor.tenantId, status: "finalized" }, include: {
    inspection: { select: { customerCompany: { select: { billingEmail: true, contactEmails: true } } } },
    attachments: { where: { kind: "pdf", source: "generated", tenantId: actor.tenantId, customerVisible: true }, orderBy: { createdAt: "desc" }, take: 1 }
  } });
  if (!report) throw new Error("A finalized report is required.");
  const attachment = report.attachments[0];
  if (!attachment) throw new Error("Issued PDF is missing. Contact support; no email has been sent.");
  const customer = report.inspection.customerCompany;
  const recipient = z.string().email().parse(customer.contactEmails?.split(/[,;\n]/)[0]?.trim() || customer.billingEmail?.trim()).toLowerCase();
  const delivery = await prisma.reportDelivery.upsert({ where: { attachmentId_recipient: { attachmentId: attachment.id, recipient } },
    create: { tenantId: actor.tenantId, reportId, attachmentId: attachment.id, recipient }, update: {} });
  return deliverIssuedReport(userId, delivery.id, actor.tenantId);
}

export async function retryTicketReportDelivery(userId: string, ticketId: string, deliveryId: string) {
  await requireSupportOperator(userId);
  const ticket = await getSupportTicket(userId, ticketId);
  if (!ticket?.reportId) throw new Error("A report-linked support request is required.");
  const delivery = await prisma.reportDelivery.findFirst({ where: { id: deliveryId, tenantId: ticket.tenantId, reportId: ticket.reportId } });
  if (!delivery || delivery.status !== "failed") throw new Error("Only a confirmed failed delivery can be retried. Sent or uncertain deliveries are never resent.");
  return deliverIssuedReport(userId, delivery.id, ticket.tenantId);
}

async function deliverIssuedReport(userId: string, deliveryId: string, tenantId: string) {
  const claimed = await prisma.reportDelivery.updateMany({ where: { id: deliveryId, tenantId, status: { in: ["pending", "failed"] } }, data: { status: "sending", attemptedAt: new Date(), failureCode: null } });
  if (claimed.count !== 1) return { status: "unchanged" };
  const delivery = await prisma.reportDelivery.findFirstOrThrow({ where: { id: deliveryId, tenantId }, include: { attachment: true } });
  let status = "failed", failureCode: string | null = null, providerMessageId: string | null = null;
  try {
    if (!delivery.attachment) throw new Error("pdf_unavailable");
    if (delivery.attachment.tenantId !== tenantId || delivery.attachment.inspectionReportId !== delivery.reportId) throw new Error("ownership");
    assertStorageKeyBelongsToTenant(delivery.attachment.storageKey, tenantId);
    let file;
    try { file = await readStoredFile(delivery.attachment.storageKey); } catch { throw new Error("pdf_unavailable"); }
    if (Buffer.from(file.bytes.subarray(0, 5)).toString() !== "%PDF-") throw new Error("pdf_unavailable");
    // No regeneration, report mutation, or recipient changes on a retry.
    const result = await sendWithResend({ to: delivery.recipient, from: process.env.RESEND_FROM_EMAIL,
      subject: "Your inspection report", html: "<p>Your completed inspection report is attached.</p>",
      attachments: [{ fileName: delivery.attachment.fileName, content: Buffer.from(file.bytes).toString("base64") }],
      idempotencyKey: `report-delivery-${delivery.id}` });
    status = result.sent ? "sent" : result.reason === "missing_config" ? "failed" : "uncertain";
    failureCode = result.sent ? null : result.reason === "missing_config" ? "email_configuration" : "email_provider_review";
    providerMessageId = result.messageId;
  } catch (error) {
    failureCode = error instanceof Error && error.message === "pdf_unavailable" ? "pdf_unavailable" : "delivery_review";
    if (failureCode !== "pdf_unavailable") status = "uncertain";
  }
  await prisma.$transaction(async tx => {
    await tx.reportDelivery.update({ where: { id: delivery.id }, data: { status, failureCode, providerMessageId, sentAt: status === "sent" ? new Date() : null } });
    await tx.auditLog.create({ data: { tenantId, actorUserId: userId, action: "support.report_delivery_attempt", entityType: "ReportDelivery", entityId: delivery.id,
      metadata: { outcome: status, failureCode, attachmentId: delivery.attachmentId } } });
  });
  return { status };
}
