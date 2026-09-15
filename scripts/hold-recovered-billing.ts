import { prisma } from "../packages/db/src";

async function main() {
  const [tenantId, actorUserId, mode] = process.argv.slice(2);
  if (!tenantId || !actorUserId || (mode && mode !== "--apply")) {
    throw new Error("Usage: node scripts/hold-recovered-billing.cjs TENANT_ID ADMIN_USER_ID [--apply]");
  }
  const actor = await prisma.user.findFirst({
    where: { id: actorUserId, tenantId, role: { in: ["office_admin", "tenant_admin", "platform_admin"] } },
    select: { id: true }
  });
  if (!actor) throw new Error("A matching tenant administrator is required.");
  const audits = await prisma.auditLog.findMany({
    where: { tenantId, action: "billing.missing_summary_restored", entityType: "InspectionBillingSummary" },
    select: { entityId: true }
  });
  const candidates = await prisma.inspectionBillingSummary.findMany({
    where: { tenantId, id: { in: audits.map((a) => a.entityId) }, status: "draft", quickbooksInvoiceId: null, quickbooksSyncStatus: "not_synced" },
    select: { id: true, inspectionId: true, updatedAt: true }
  });
  console.log(JSON.stringify({ mode: mode ?? "dry-run", count: candidates.length, candidates }));
  if (mode !== "--apply") return;
  for (const summary of candidates) {
    const changed = await prisma.$transaction(async (tx) => {
      const result = await tx.inspectionBillingSummary.updateMany({
        where: { id: summary.id, tenantId, status: "draft", quickbooksInvoiceId: null, quickbooksSyncStatus: "not_synced", updatedAt: summary.updatedAt },
        data: { status: "billing_review" }
      });
      if (result.count) await tx.auditLog.create({ data: {
        tenantId, actorUserId, action: "billing.recovery_held_for_review", entityType: "InspectionBillingSummary", entityId: summary.id,
        metadata: { inspectionId: summary.inspectionId, previousStatus: "draft", status: "billing_review", reason: "Historical recovery did not verify prior invoicing. Preserve work and reconcile before billing." }
      } });
      return result.count;
    });
    console.log(JSON.stringify({ summaryId: summary.id, held: changed === 1 }));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
