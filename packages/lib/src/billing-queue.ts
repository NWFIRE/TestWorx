export type BillingQueueSummaryLike = {
  status?: string | null;
  metrics?: {
    missingPriceCount?: number | null;
  } | null;
};

export const billingQueueSortOptions = ["newest", "oldest", "alphabetical"] as const;
export type BillingQueueSort = (typeof billingQueueSortOptions)[number];

type SortableBillingQueueSummary = {
  id: string;
  customerName: string;
  siteName?: string | null;
  inspectionDate: Date | string;
};

export function sortBillingSummaries<TSummary extends SortableBillingQueueSummary>(
  summaries: TSummary[],
  sort: BillingQueueSort
) {
  const compareNames = (left: string, right: string) =>
    left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
  const compareDates = (left: Date | string, right: Date | string) =>
    new Date(left).getTime() - new Date(right).getTime();

  return [...summaries].sort((left, right) => {
    if (sort === "alphabetical") {
      return (
        compareNames(left.customerName, right.customerName) ||
        compareNames(left.siteName ?? "", right.siteName ?? "") ||
        compareDates(right.inspectionDate, left.inspectionDate) ||
        compareNames(left.id, right.id)
      );
    }

    const dateOrder = sort === "oldest"
      ? compareDates(left.inspectionDate, right.inspectionDate)
      : compareDates(right.inspectionDate, left.inspectionDate);

    return (
      dateOrder ||
      compareNames(left.customerName, right.customerName) ||
      compareNames(left.siteName ?? "", right.siteName ?? "") ||
      compareNames(left.id, right.id)
    );
  });
}

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
