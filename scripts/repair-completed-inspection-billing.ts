import { prisma } from "../packages/db/src";
import { ensureCompletedInspectionBillingSummaryTx } from "../packages/lib/src/inspection-billing-readiness";

async function main() {
  const [tenantId, actorUserId, mode] = process.argv.slice(2);
  if (!tenantId || !actorUserId || (mode && mode !== "--apply")) {
    throw new Error("Usage: tsx scripts/repair-completed-inspection-billing.ts TENANT_ID ADMIN_USER_ID [--apply]");
  }
  const actor = await prisma.user.findFirst({
    where: { id: actorUserId, tenantId, role: { in: ["office_admin", "tenant_admin", "platform_admin"] } },
    select: { id: true }
  });
  if (!actor) throw new Error("A matching tenant administrator is required.");
  const candidates = await prisma.inspection.findMany({
    where: { tenantId, status: "completed", billingSummary: { is: null } },
    select: { id: true }, orderBy: { id: "asc" }
  });
  console.log(JSON.stringify({ mode: mode ?? "dry-run", tenantId, count: candidates.length, candidates }));
  if (mode !== "--apply") return;

  let restored = 0;
  for (const candidate of candidates) {
    const summary = await prisma.$transaction(async (tx) => {
      const result = await ensureCompletedInspectionBillingSummaryTx(tx, { tenantId, inspectionId: candidate.id });
      if (result) {
        await tx.auditLog.create({ data: {
          tenantId, actorUserId, action: "billing.missing_summary_restored", entityType: "InspectionBillingSummary", entityId: result.id,
          metadata: { inspectionId: candidate.id, source: "completed_inspection_billing_repair" }
        } });
      }
      return result;
    }, { timeout: 60_000 });
    if (summary) restored++;
    console.log(JSON.stringify({ inspectionId: candidate.id, summaryId: summary?.id ?? null }));
  }
  const remaining = await prisma.inspection.count({ where: { tenantId, status: "completed", billingSummary: { is: null } } });
  console.log(JSON.stringify({ restored, remaining }));
  if (remaining) throw new Error("Some completed inspections still lack billing summaries.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
