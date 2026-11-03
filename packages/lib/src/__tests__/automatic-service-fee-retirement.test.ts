import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const { eligibleBilling, eligibleQuote, automaticBillingFee, automaticQuoteFee } = createRequire(import.meta.url)("../../../../scripts/retire-automatic-service-fees.cjs");

describe("automatic service fee retirement", () => {
  const billing = { status: "reviewed", quickbooksSyncStatus: "not_synced", quickbooksSendStatus: "not_sent" };
  it("only touches unbilled unsynced drafts", () => {
    expect(eligibleBilling(billing)).toBe(true);
    expect(eligibleBilling({ ...billing, inspection: { status: "invoiced" } })).toBe(false);
    for (const change of [{ status: "invoiced" }, { quickbooksInvoiceId: "qb1" }, { quickbooksInvoiceNumber: "123" }, { quickbooksSyncedAt: new Date() }, { quickbooksSyncStatus: "syncing" }, { quickbooksSentAt: new Date() }]) {
      expect(eligibleBilling({ ...billing, ...change })).toBe(false);
    }
  });
  it("keeps manual service fees and compliance fees", () => {
    const fee = { sourceSection: "service-fee", sourceField: "serviceFee" };
    expect(automaticBillingFee(fee)).toBe(true);
    expect(automaticBillingFee({ ...fee, metadata: { manualBillingLine: true } })).toBe(false);
    expect(automaticBillingFee({ ...fee, sourceSection: "compliance-reporting-fee" })).toBe(false);
  });
  it("never edits sent, approved, converted or synced quotes", () => {
    const quote = { status: "draft", syncStatus: "not_synced" };
    expect(eligibleQuote(quote)).toBe(true);
    for (const change of [{ status: "approved" }, { sentAt: new Date() }, { quickbooksEstimateId: "qb1" }, { approvedAt: new Date() }, { convertedAt: new Date() }]) {
      expect(eligibleQuote({ ...quote, ...change })).toBe(false);
    }
  });
  it("recognizes legacy generated quote fees conservatively", () => {
    const fee = { category: "service_fee", internalCode: "SERVICE_FEE_OKC", title: "Service Fee", quantity: 1, discountAmount: 0 };
    expect(automaticQuoteFee(fee)).toBe(true);
    expect(automaticQuoteFee({ ...fee, qbItemId: "manual-catalog" })).toBe(false);
    expect(automaticQuoteFee({ ...fee, description: "Manually added trip charge" })).toBe(false);
  });
});
