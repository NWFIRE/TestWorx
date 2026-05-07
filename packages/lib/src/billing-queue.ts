export type BillingQueueSummaryLike = {
  status?: string | null;
  metrics?: {
    missingPriceCount?: number | null;
  } | null;
};

export function isOpenBillingQueueStatus(status: string | null | undefined) {
  return status !== "invoiced";
}

export function filterBillingSummariesForQueue<TSummary extends BillingQueueSummaryLike>(
  summaries: TSummary[],
  selectedStatus: string
) {
  if (selectedStatus === "all") {
    return summaries.filter((summary) => isOpenBillingQueueStatus(summary.status));
  }

  if (selectedStatus === "needs_pricing") {
    return summaries.filter((summary) =>
      isOpenBillingQueueStatus(summary.status) && (summary.metrics?.missingPriceCount ?? 0) > 0
    );
  }

  return summaries.filter((summary) => summary.status === selectedStatus);
}
