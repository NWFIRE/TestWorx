import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { regenerateFinalizedReportPdf } from "../../packages/lib/src/report-service";

const db = new PrismaClient();
export async function prepareSubscriberFixtures() {
  if (process.env.DATABASE_URL !== "postgresql://perf@127.0.0.1:55439/tradeworx_subscriber" || process.env.EMAIL_DRIVER !== "capture") throw new Error("Only the isolated subscriber database is allowed.");
  const companies = [];
  for (const [slug, color, initials] of [["evergreen-fire", "#087f5b", "EF"], ["northshore-life-safety", "#9c36b5", "NS"]]) {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug } });
    const logo = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" rx="16" fill="${color}"/><text x="150" y="70" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="64" fill="white">${initials}</text></svg>`)).png().toBuffer();
    await db.tenant.update({ where: { id: tenant.id }, data: { branding: { ...(tenant.branding as object), logoDataUrl: `data:image/png;base64,${logo.toString("base64")}` }, subscriptionManaged: false } });
    const customer = await db.customerCompany.findFirstOrThrow({ where: { tenantId: tenant.id } });
    await db.customerCompany.update({ where: { id: customer.id }, data: { name: "Pinecrest Commons", contactEmails: `reports-${initials.toLowerCase()}@example.test` } });
    const office = await db.user.findFirstOrThrow({ where: { tenantId: tenant.id, role: "tenant_admin" } });
    const tech = await db.user.findFirstOrThrow({ where: { tenantId: tenant.id, role: "technician", email: slug === "evergreen-fire" ? "tech1@evergreenfire.com" : "tech@northshorelife.com" } });
    // Reuse seeded records rather than newly invited users or field-journey reports.
    const report = await db.inspectionReport.findFirstOrThrow({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
    await db.inspectionReport.update({ where: { id: report.id }, data: { status: "finalized", finalizedAt: report.finalizedAt ?? new Date() } });
    await db.inspection.update({ where: { id: report.inspectionId }, data: { assignedTechnicianId: tech.id } });
    await regenerateFinalizedReportPdf({ userId: office.id, tenantId: tenant.id, role: office.role }, { inspectionReportId: report.id });
    const attachment = await db.attachment.findFirst({ where: { inspectionReportId: report.id, kind: "pdf", source: "generated" }, orderBy: { createdAt: "desc" } });
    if (!attachment) throw new Error("Seeded issued PDF is required.");
    await db.attachment.update({ where: { id: attachment.id }, data: { source: "generated", customerVisible: true } });
    const delivery = await db.reportDelivery.upsert({ where: { attachmentId_recipient: { attachmentId: attachment.id, recipient: `reports-${initials.toLowerCase()}@example.test` } },
      create: { tenantId: tenant.id, reportId: report.id, attachmentId: attachment.id, recipient: `reports-${initials.toLowerCase()}@example.test`, status: "failed", failureCode: "email_configuration" }, update: { status: "failed", failureCode: "email_configuration", sentAt: null, providerMessageId: null } });
    await db.capturedEmail.deleteMany({ where: { dedupeKey: `report-delivery-${delivery.id}` } });
    companies.push({ tenantId: tenant.id, name: tenant.name, officeEmail: office.email, techEmail: tech.email, techId: tech.id, customerId: customer.id, reportId: report.id, inspectionId: report.inspectionId, attachmentId: attachment.id, deliveryId: delivery.id });
  }
  const directory = resolve(__dirname, "results"); mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "fixtures.json"), JSON.stringify({ companies }, null, 2));
  console.log("Two isolated companies, distinct logos, same-name customers, and confirmed failed delivery fixtures prepared.");
  await db.$disconnect();
}
