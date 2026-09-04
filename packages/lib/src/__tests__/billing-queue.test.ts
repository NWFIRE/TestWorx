import { describe, expect, it } from "vitest";

import { filterBillingSummariesForQueue, isOpenBillingQueueStatus, sortBillingSummaries } from "../billing-queue";

describe("billing queue filtering", () => {
  const summaries = [
    { id: "draft_1", status: "draft", metrics: { missingPriceCount: 0 } },
    { id: "ready_1", status: "reviewed", metrics: { missingPriceCount: 0 } },
    { id: "needs_pricing_1", status: "reviewed", metrics: { missingPriceCount: 2 } },
    { id: "invoice_1", status: "invoiced", metrics: { missingPriceCount: 3 } }
  ];

  it("treats invoiced summaries as closed queue items", () => {
    expect(isOpenBillingQueueStatus("draft")).toBe(true);
    expect(isOpenBillingQueueStatus("reviewed")).toBe(true);
    expect(isOpenBillingQueueStatus("invoiced")).toBe(false);
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
