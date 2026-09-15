import { beforeEach, describe, expect, it, vi } from "vitest";
const { sync } = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock("../inspection-billing", () => ({ syncInspectionBillingSummaryTx: sync }));
import { ensureCompletedInspectionBillingSummaryTx } from "../inspection-billing-readiness";

describe("completed inspection billing recovery", () => {
  const input = { tenantId: "tenant_1", inspectionId: "inspection_1" };
  beforeEach(() => vi.resetAllMocks());
  const tx = (inspection: unknown) => ({
    $queryRaw: vi.fn().mockResolvedValue([{ id: input.inspectionId }]),
    inspection: { findFirst: vi.fn().mockResolvedValue(inspection) },
    inspectionBillingSummary: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }
  });

  it("recovers missing historical billing on hold, not ready to invoice again", async () => {
    const db = tx({ status: "completed", billingSummary: null });
    sync.mockResolvedValue({ id: "summary_1" });
    await expect(ensureCompletedInspectionBillingSummaryTx(db as never, input)).resolves.toEqual({ id: "summary_1", status: "billing_review" });
    expect(db.inspectionBillingSummary.updateMany).toHaveBeenCalledWith({
      where: { id: "summary_1", tenantId: input.tenantId, status: "draft", quickbooksInvoiceId: null },
      data: { status: "billing_review" }
    });
    expect(db.inspection.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: input.inspectionId, tenantId: input.tenantId } }));
    expect(db.$queryRaw).toHaveBeenCalledWith(expect.anything(), input.inspectionId, input.tenantId);
    expect(sync).toHaveBeenCalledWith(db, input);
  });

  it.each(["draft", "reviewed", "invoiced", "billing_review"])("preserves an existing %s summary on retries", async (status) => {
    const db = tx({ status: "completed", billingSummary: { id: "summary_1", status } });
    await expect(ensureCompletedInspectionBillingSummaryTx(db as never, input)).resolves.toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  it.each(["to_be_completed", "in_progress", "cancelled", "invoiced"])("does not bill %s inspections", async (status) => {
    await ensureCompletedInspectionBillingSummaryTx(tx({ status, billingSummary: null }) as never, input);
    expect(sync).not.toHaveBeenCalled();
  });

  it("does not bill a missing or cross-tenant inspection", async () => {
    await ensureCompletedInspectionBillingSummaryTx(tx(null) as never, input);
    expect(sync).not.toHaveBeenCalled();
  });

  it("rolls recovery back if a concurrent change prevents the hold", async () => {
    const db = tx({ status: "completed", billingSummary: null });
    sync.mockResolvedValue({ id: "summary_1" });
    db.inspectionBillingSummary.updateMany.mockResolvedValue({ count: 0 });
    await expect(ensureCompletedInspectionBillingSummaryTx(db as never, input)).rejects.toThrow("Billing changed during recovery");
  });

  it("propagates failure so completion and billing roll back together", async () => {
    sync.mockRejectedValue(new Error("billing unavailable"));
    await expect(ensureCompletedInspectionBillingSummaryTx(tx({ status: "completed", billingSummary: null }) as never, input)).rejects.toThrow("billing unavailable");
  });
});
