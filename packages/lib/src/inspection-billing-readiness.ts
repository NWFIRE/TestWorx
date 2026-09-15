import { InspectionStatus, type Prisma } from "@prisma/client";

/** Missing local billing is not proof that historical work has never been invoiced. */
export async function ensureCompletedInspectionBillingSummaryTx(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; inspectionId: string }
) {
  // Serialize recovery with status changes and other recovery attempts.
  await tx.$queryRaw`
    SELECT "id" FROM "Inspection"
    WHERE "id" = ${input.inspectionId} AND "tenantId" = ${input.tenantId}
    FOR UPDATE
  `;
  const inspection = await tx.inspection.findFirst({
    where: { id: input.inspectionId, tenantId: input.tenantId },
    select: { status: true, billingSummary: { select: { id: true } } }
  });
  if (!inspection || inspection.status !== InspectionStatus.completed || inspection.billingSummary) {
    return null;
  }

  const { syncInspectionBillingSummaryTx } = await import("./inspection-billing");
  const summary = await syncInspectionBillingSummaryTx(tx, input);
  if (!summary) return null;
  const held = await tx.inspectionBillingSummary.updateMany({
    where: { id: summary.id, tenantId: input.tenantId, status: "draft", quickbooksInvoiceId: null },
    data: { status: "billing_review" }
  });
  if (held.count !== 1) throw new Error("Billing changed during recovery. Review the existing summary before retrying.");
  return { ...summary, status: "billing_review" as const };
}
