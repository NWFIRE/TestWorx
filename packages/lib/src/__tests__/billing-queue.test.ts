import { describe, expect, it } from "vitest";

import { assertBillingInvoiceCreationAllowed, assertBillingStatusChangeAllowed, buildBillingQueueHref, filterBillingSummariesForQueue, isOpenBillingQueueStatus, searchBillingSummaries, sortBillingSummaries } from "../billing-queue";

describe("billing queue filtering", () => {
  const searchable = [
    { id: "one", status: "invoiced", customerName: "Alpha Safety", siteName: "West", quickbooksInvoiceNumber: "INV-00123", inspectionId: "job-one", reportTypes: ["fire_alarm"] },
    { id: "two", status: "reviewed", customerName: "Beta", quickbooksInvoiceNumber: null, technicianName: "Jane Smith" },
    { id: "three", status: "billing_review", customerName: "Alpha", quickbooksInvoiceNumber: "00124" }
  ];

  it("searches invoice numbers as text, preserving leading zeros and partial matches", () => {
    expect(searchBillingSummaries(searchable, " inv-0012 ").map((row) => row.id)).toEqual(["one"]);
    expect(searchBillingSummaries(searchable, "0012").map((row) => row.id)).toEqual(["one", "three"]);
    expect(searchBillingSummaries(searchable, "does not exist")).toEqual([]);
  });

  it("combines customer, site, report and technician terms without changing queue membership", () => {
    expect(searchBillingSummaries(searchable, "ALPHA alarm").map((row) => row.id)).toEqual(["one"]);
    expect(searchBillingSummaries(searchable, "jane").map((row) => row.id)).toEqual(["two"]);
    expect(searchBillingSummaries(filterBillingSummariesForQueue(searchable, "all"), "00123")).toEqual([]);
    expect(searchBillingSummaries(filterBillingSummariesForQueue(searchable, "invoiced"), "00123").map((row) => row.id)).toEqual(["one"]);
    expect(searchBillingSummaries(searchable, "  ")).toEqual(searchable);
  });

  it("preserves and safely encodes search with status and sort changes", () => {
    const href = buildBillingQueueHref("invoiced", "oldest", " INV #123 & 4 ");
    const params = new URL(href, "https://example.test").searchParams;
    expect(Object.fromEntries(params)).toEqual({ status: "invoiced", sort: "oldest", q: "INV #123 & 4" });
    expect(buildBillingQueueHref("all", "newest", "")).toBe("/app/admin/billing");
  });
  const summaries = [
    { id: "draft_1", status: "draft", metrics: { missingPriceCount: 0 } },
    { id: "ready_1", status: "reviewed", metrics: { missingPriceCount: 0 } },
    { id: "needs_pricing_1", status: "reviewed", metrics: { missingPriceCount: 2 } },
    { id: "invoice_1", status: "invoiced", metrics: { missingPriceCount: 3 } },
    { id: "hold_1", status: "billing_review", metrics: { missingPriceCount: 3 } }
  ];

  it("treats invoiced summaries as closed queue items", () => {
    expect(isOpenBillingQueueStatus("draft")).toBe(true);
    expect(isOpenBillingQueueStatus("reviewed")).toBe(true);
    expect(isOpenBillingQueueStatus("invoiced")).toBe(false);
    expect(isOpenBillingQueueStatus("billing_review")).toBe(false);
    expect(isOpenBillingQueueStatus(undefined)).toBe(false);
  });

  it("keeps recovered work accessible in billing review, outside the ready and setup queues", () => {
    expect(filterBillingSummariesForQueue(summaries, "billing_review").map((s) => s.id)).toEqual(["hold_1"]);
  });

  it.each(["billing_review", "invoiced", "unknown"])("blocks new invoices for %s work", (status) => {
    expect(() => assertBillingInvoiceCreationAllowed({ status })).toThrow();
  });

  it.each(["draft", "reviewed"])("allows unbilled %s work, but never a linked invoice", (status) => {
    expect(() => assertBillingInvoiceCreationAllowed({ status })).not.toThrow();
    expect(() => assertBillingInvoiceCreationAllowed({ status, quickbooksInvoiceId: "existing" })).toThrow();
  });

  it("requires explicit review before releasing recovered work and preserves invoiced history", () => {
    expect(() => assertBillingStatusChangeAllowed("billing_review", "reviewed")).toThrow();
    expect(() => assertBillingStatusChangeAllowed("billing_review", "draft")).toThrow();
    expect(() => assertBillingStatusChangeAllowed("billing_review", "reviewed", true)).not.toThrow();
    expect(() => assertBillingStatusChangeAllowed("billing_review", "invoiced")).not.toThrow();
    expect(() => assertBillingStatusChangeAllowed("invoiced", "draft", true)).toThrow();
    expect(() => assertBillingStatusChangeAllowed("invoiced", "billing_review", true)).toThrow();
    expect(() => assertBillingStatusChangeAllowed("draft", "invalid")).toThrow();
  });

  it("excludes invoiced summaries from the default open work queue", () => {
    expect(filterBillingSummariesForQueue(summaries, "all").map((summary) => summary.id)).toEqual([
      "draft_1",
      "ready_1",
      "needs_pricing_1"
    ]);
  });

  it("filters the needs pricing queue to open summaries with missing pricing", () => {
    expect(filterBillingSummariesForQueue(summaries, "needs_pricing").map((summary) => summary.id)).toEqual([
      "needs_pricing_1"
    ]);
  });

  it("keeps the explicit invoiced queue available", () => {
    expect(filterBillingSummariesForQueue(summaries, "invoiced").map((summary) => summary.id)).toEqual([
      "invoice_1"
    ]);
  });

  it("sorts summaries by newest, oldest, or customer name without mutating the source", () => {
    const source = [
      { id: "2", customerName: "Zulu Fire", siteName: "Main", inspectionDate: new Date("2026-06-01T12:00:00Z") },
      { id: "1", customerName: "Alpha Safety", siteName: "West", inspectionDate: new Date("2026-08-01T12:00:00Z") },
      { id: "3", customerName: "Bravo Systems", siteName: "East", inspectionDate: new Date("2026-07-01T12:00:00Z") }
    ];

    expect(sortBillingSummaries(source, "newest").map((summary) => summary.id)).toEqual(["1", "3", "2"]);
    expect(sortBillingSummaries(source, "oldest").map((summary) => summary.id)).toEqual(["2", "3", "1"]);
    expect(sortBillingSummaries(source, "alphabetical").map((summary) => summary.id)).toEqual(["1", "3", "2"]);
    expect(source.map((summary) => summary.id)).toEqual(["2", "1", "3"]);
  });
});
