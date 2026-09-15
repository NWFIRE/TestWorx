import { InspectionStatus, type Prisma } from "@prisma/client";

/** Recover a missing summary without repricing or changing an existing invoice. */
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
  return syncInspectionBillingSummaryTx(tx, input);
}
