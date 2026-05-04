import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { filterBillingSummariesForQueue, getAdminBillingSummaries, isOpenBillingQueueStatus } from "@testworx/lib/server/index";

import {
  AppPageShell,
  EmptyState,
  FilterBar,
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
  { value: "invoiced", label: "Invoiced" }
] as const;

function normalizeBillingStatus(status?: string) {
  if (status === "ready") {
    return "reviewed";
  }
  return status;
}

function buildBillingHref(status?: string) {
  return status && status !== "all" ? `/app/admin/billing?status=${status}` : "/app/admin/billing";
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

function SummaryQueueSection({
  title,
  description,
  emptyTitle,
  emptyText,
  summaries,
  ctaLabel
}: {
  title: string;
  description: string;
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
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <p className="text-sm text-slate-500">
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
                      Subtotal:{" "}
                      <span className="font-semibold text-slate-950">
                        {summary.subtotal > 0 ? `$${summary.subtotal.toFixed(2)}` : "Pending pricing"}
                      </span>
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
  searchParams?: Promise<{ status?: string }>;
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

  const summaries = await getAdminBillingSummaries({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  });
  const openSummaries = summaries.filter((summary: AdminBillingSummary) => isOpenBillingQueueStatus(summary.status));
  const invoicedSummaries = summaries.filter((summary: AdminBillingSummary) => summary.status === "invoiced");
  const filteredSummaries = filterBillingSummariesForQueue(summaries, selectedStatus);

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
        description="Review visit-level labor, materials, services, and fees extracted from finalized inspection reports before invoicing."
        eyebrow="Billing"
        title="Inspection billing summaries"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          href={buildBillingHref()}
          label="Ready To Bill"
          note="Completed, finalized work ready for billing follow-through."
          tone="blue"
          value={openSummaries.length}
        />
        <KPIStatCard
          href={buildBillingHref()}
          label="Needs pricing"
          note="Ready-to-bill summaries with missing pricing decisions."
          tone="amber"
          value={openSummaries.filter((summary) => summary.metrics.missingPriceCount > 0).length}
        />
        <KPIStatCard
          href={buildBillingHref("invoiced")}
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

      <FilterBar
        description="Ready To Bill shows summaries that still need billing action. Use Invoiced for completed invoice history."
        title="Queue filters"
      >
        {statusOptions.map((option) => (
          <FilterChipLink
            active={selectedStatus === option.value}
            href={buildBillingHref(option.value)}
            key={option.value}
            label={option.label}
            tone="emerald"
          />
        ))}
      </FilterBar>

      <SummaryQueueSection
        ctaLabel={selectedStatus === "invoiced" ? "View invoice detail" : "Review billing"}
        description={selectedStatus === "all" ? "Completed, finalized work that is ready for pricing, invoice creation, or QuickBooks follow-through. Invoiced work is archived below." : "Billing summaries matching the selected queue."}
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
          summaries={invoicedSummaries}
          title="Invoiced archive"
        />
      ) : null}
    </AppPageShell>
  );
}

