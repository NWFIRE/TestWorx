import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LiveUrlSelectFilter } from "@/app/live-url-select-filter";
import {
  billingQueueSortOptions,
  filterBillingSummariesForQueue,
  getAdminBillingSummaries,
  isOpenBillingQueueStatus,
  sortBillingSummaries,
  type BillingQueueSort
} from "@testworx/lib/server/index";

import {
  AppPageShell,
  EmptyState,
  FilterChipLink,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge
} from "../operations-ui";

type AdminBillingSummary = Awaited<ReturnType<typeof getAdminBillingSummaries>>[number];

const statusTones = {
  draft: "blue",
  reviewed: "blue",
  invoiced: "violet"
} as const;

const statusOptions = [
  { value: "all", label: "Ready To Bill" },
  { value: "needs_pricing", label: "Needs setup" },
  { value: "invoiced", label: "Invoiced" }
] as const;

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "alphabetical", label: "Customer A-Z" }
] as const;

function normalizeBillingStatus(status?: string) {
  if (status === "ready") {
    return "reviewed";
  }
  return status;
}

function buildBillingHref(status: string | undefined, sort: BillingQueueSort) {
  const params = new URLSearchParams();
  if (status && status !== "all") {
    params.set("status", status);
  }
  if (sort !== "newest") {
    params.set("sort", sort);
  }
  const query = params.toString();
  return query ? `/app/admin/billing?${query}` : "/app/admin/billing";
}

function formatBillingSummaryStatus(status: string) {
  if (status === "reviewed" || status === "draft") {
    return "Ready To Bill";
  }
  if (status === "invoiced") {
    return "Invoiced";
  }
  return status.replaceAll("_", " ");
}

function formatQuickBooksSummaryStatus(summary: AdminBillingSummary) {
  if (summary.quickbooksInvoiceNumber) {
    return summary.quickbooksInvoiceNumber;
  }

  if (summary.metrics.missingPriceCount > 0) {
    return "Needs setup";
  }

  if (summary.quickbooksSyncStatus === "synced" || summary.quickbooksSyncStatus === "sent") {
    return "Synced";
  }

  return "Ready to sync";
}

function SummaryQueueSection({
  title,
  emptyTitle,
  emptyText,
  summaries,
  ctaLabel
}: {
  title: string;
  description?: string;
  emptyTitle: string;
  emptyText: string;
  summaries: AdminBillingSummary[];
  ctaLabel: string;
}) {
  return (
    <SectionCard>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
        </div>
        <p className="text-sm font-semibold text-slate-600">
          {summaries.length} {summaries.length === 1 ? "summary" : "summaries"}
        </p>
      </div>

      <div className="space-y-4">
        {summaries.length === 0 ? (
          <EmptyState description={emptyText} title={emptyTitle} />
        ) : (
          summaries.map((summary) => (
            <div
              key={summary.id}
              className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5 transition hover:border-slate-300 hover:bg-white"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-slate-950">{summary.customerName}</p>
                    <StatusBadge
                      label={formatBillingSummaryStatus(summary.status)}
                      tone={statusTones[summary.status as keyof typeof statusTones] ?? "slate"}
                    />
                  </div>
                  <p className="text-sm text-slate-500">
                    {summary.siteName} • {format(summary.inspectionDate, "MMM d, yyyy h:mm a")}
                  </p>
                  <p className="text-sm text-slate-500">
                    Reports:{" "}
                    {summary.reportTypes.length > 0
                      ? summary.reportTypes
                          .map((type: AdminBillingSummary["reportTypes"][number]) =>
                            type.replaceAll("_", " ")
                          )
                          .join(", ")
                      : "Inspection-level billing only"}
                  </p>
                  <div className="grid gap-3 pt-1 md:grid-cols-4">
                    <p className="text-sm text-slate-600">
                      Labor hours:{" "}
                      <span className="font-semibold text-slate-950">
                        {summary.metrics.laborHoursTotal}
                      </span>
                    </p>
                    <p className="text-sm text-slate-600">
                      Materials:{" "}
                      <span className="font-semibold text-slate-950">
                        {summary.metrics.materialItemCount}
                      </span>
                    </p>
                    <p className="text-sm text-slate-600">
                      Fees:{" "}
                      <span className="font-semibold text-slate-950">{summary.metrics.feeCount}</span>
                    </p>
                    <p className="text-sm text-slate-600">
                      QuickBooks:{" "}
                      <span className="font-semibold text-slate-950">{formatQuickBooksSummaryStatus(summary)}</span>
                    </p>
                  </div>
                </div>
                <Link
                  className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  href={`/app/admin/billing/${summary.inspectionId}`}
                >
                  {ctaLabel}
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}

export default async function AdminBillingPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string; sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const requestedStatus = typeof params.status === "string" ? normalizeBillingStatus(params.status) : undefined;
  const selectedStatus =
    requestedStatus && statusOptions.some((option) => option.value === requestedStatus)
      ? requestedStatus
      : "all";
  const selectedSort: BillingQueueSort = billingQueueSortOptions.includes(params.sort as BillingQueueSort)
    ? (params.sort as BillingQueueSort)
    : "newest";

  const summaries = await getAdminBillingSummaries({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  });
  const openSummaries = summaries.filter((summary: AdminBillingSummary) => isOpenBillingQueueStatus(summary.status));
  const invoicedSummaries = summaries.filter((summary: AdminBillingSummary) => summary.status === "invoiced");
  const filteredSummaries = sortBillingSummaries(
    filterBillingSummariesForQueue(summaries, selectedStatus),
    selectedSort
  );
  const sortedInvoicedSummaries = sortBillingSummaries(invoicedSummaries, selectedSort);

  return (
    <AppPageShell>
      <PageHeader
        backNavigation={{ label: "Back to admin", fallbackHref: "/app/admin" }}
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              href="/app/admin/billing/create"
            >
              Create invoice
            </Link>
          </div>
        }
        description="Review quantities, item mappings, services, materials, and fees before QuickBooks creates the final invoice pricing."
        eyebrow="Billing"
        title="Inspection billing summaries"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          href={buildBillingHref(undefined, selectedSort)}
          label="Ready To Bill"
          note="Completed, finalized work ready for billing follow-through."
          tone="blue"
          value={openSummaries.length}
        />
        <KPIStatCard
          href={buildBillingHref("needs_pricing", selectedSort)}
          label="Needs setup"
          note="Ready-to-bill summaries that need QuickBooks billing setup before sync."
          tone="amber"
          value={openSummaries.filter((summary) => summary.metrics.missingPriceCount > 0).length}
        />
        <KPIStatCard
          href={buildBillingHref("invoiced", selectedSort)}
          label="Invoiced"
          note="Archived summaries already moved through invoicing."
          tone="emerald"
          value={invoicedSummaries.length}
        />
        <KPIStatCard
          label="Total summaries"
          note="All billing summaries, including archived invoiced work."
          tone="slate"
          value={summaries.length}
        />
      </section>

      <SectionCard>
        <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-[color:var(--text-secondary)]">
          Queue filters
        </p>
        <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <FilterChipLink
                active={selectedStatus === option.value}
                href={buildBillingHref(option.value, selectedSort)}
                key={option.value}
                label={option.label}
                tone="emerald"
              />
            ))}
          </div>
          <div className="w-full lg:w-56">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Sort by
            </p>
            <LiveUrlSelectFilter
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-slateblue"
              options={[...sortOptions]}
              paramKey="sort"
              resetPageKeys={[]}
              value={selectedSort}
            />
          </div>
        </div>
      </SectionCard>

      <SummaryQueueSection
        ctaLabel={selectedStatus === "invoiced" ? "View invoice detail" : "Review billing"}
        description={selectedStatus === "all" ? "Completed, finalized work that is ready for item review, invoice creation, or QuickBooks follow-through. Invoiced work is archived below." : "Billing summaries matching the selected queue."}
        emptyText="No billing summaries match the current queue filter."
        emptyTitle="No billing summaries in this queue"
        summaries={filteredSummaries}
        title={selectedStatus === "all" ? "Ready To Bill queue" : `${statusOptions.find((option) => option.value === selectedStatus)?.label ?? selectedStatus} queue`}
      />

      {selectedStatus === "all" ? (
        <SummaryQueueSection
          ctaLabel="View invoice detail"
          description="Completed billing summaries already marked invoiced."
          emptyText="No inspections have been marked invoiced yet."
          emptyTitle="No invoiced summaries yet"
          summaries={sortedInvoicedSummaries}
          title="Invoiced archive"
        />
      ) : null}
    </AppPageShell>
  );
}

