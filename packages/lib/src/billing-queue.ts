export type BillingQueueSummaryLike = {
  status?: string | null;
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

  return summaries.filter((summary) => summary.status === selectedStatus);
}
