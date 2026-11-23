import { describe, expect, it } from "vitest";
import { billingEditWhere, billingReviewFingerprint, excludedBillingItemIds, validateBillingLineEdit, withExcludedBillingItems } from "../billing-review";
import type { BillableItem } from "../inspection-billing";

describe("billing review persistence", () => {
  it("requires the same tenant, items and status and no invoice for every line mutation", () => {
    expect(billingEditWhere({ id: "summary_1", tenantId: "tenant_1", status: "reviewed", items: [] })).toEqual({
      id: "summary_1", tenantId: "tenant_1", status: { equals: "reviewed", not: "invoiced" },
      quickbooksInvoiceId: null, items: { equals: [] }
    });
  });
  it("preserves existing snapshot data and deduplicates exclusions", () => {
    const snapshot = withExcludedBillingItems({ invoiceTotals: { subtotal: 10 }, billingReviewExcludedItemIds: ["one"] }, ["one", "two"]);
    expect(snapshot).toEqual({ invoiceTotals: { subtotal: 10 }, billingReviewExcludedItemIds: ["one", "two"] });
    expect(excludedBillingItemIds(snapshot)).toEqual(["one", "two"]);
    expect(excludedBillingItemIds(null)).toEqual([]);
    expect(excludedBillingItemIds({ billingReviewExcludedItemIds: [1, "one", null] })).toEqual(["one"]);
  });
  it("rejects invalid quantities, descriptions and categories on the server", () => {
    for (const quantity of [NaN, Infinity, 0, -1]) expect(() => validateBillingLineEdit(quantity)).toThrow();
    expect(() => validateBillingLineEdit(1, " ")).toThrow();
    expect(() => validateBillingLineEdit(1, "x".repeat(2001))).toThrow();
    expect(() => validateBillingLineEdit(1, "Inspection", "unknown")).toThrow();
    expect(() => validateBillingLineEdit(1.5, "Inspection", "service")).not.toThrow();
  });
  it("does not invalidate a review for item ordering or calculated pricing metadata", () => {
    const a = { id: "a", quantity: 1, description: "Inspection", category: "service" } as BillableItem;
    const b = { ...a, id: "b" };
    expect(billingReviewFingerprint([a, b])).toBe(billingReviewFingerprint([b, { ...a, metadata: { sourceQuantity: 1 }, unitPrice: 12 }]));
    expect(billingReviewFingerprint([a])).not.toBe(billingReviewFingerprint([{ ...a, quantity: 2 }]));
    expect(billingReviewFingerprint([a])).not.toBe(billingReviewFingerprint([{ ...a, metadata: { sourceQuantity: 2 } }]));
  });
});
