import { describe, expect, it } from "vitest";

import { filterBillingSummariesForQueue, isOpenBillingQueueStatus } from "../billing-queue";

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
});
