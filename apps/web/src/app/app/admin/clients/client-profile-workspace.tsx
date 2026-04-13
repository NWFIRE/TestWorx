"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { ReactNode } from "react";

import { ActionButton } from "@/app/action-button";
import { SearchInput } from "@/app/search-input";
import type { getClientProfileData } from "@testworx/lib";

import {
  EmptyState,
  KPIStatCard,
  SectionCard,
  StatusBadge,
  WorkspaceSplit
} from "../operations-ui";

type ClientProfileData = NonNullable<Awaited<ReturnType<typeof getClientProfileData>>>;
type ClientProfileTab = "overview" | "inspections" | "quotes" | "work" | "billing" | "documents" | "notes" | "activity";
type BillingStatusFilter = "all" | "paid" | "partial" | "open" | "overdue";
type BillingSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "status";

const tabLabels: Array<{ id: ClientProfileTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "inspections", label: "Inspections" },
  { id: "quotes", label: "Quotes" },
  { id: "work", label: "Work History" },
  { id: "billing", label: "Billing" },
  { id: "documents", label: "Documents" },
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" }
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatDate(value: Date | string | null | undefined, fallback = "—") {
  if (!value) {
    return fallback;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return format(parsed, "MMM d, yyyy");
}

function formatDateTime(value: Date | string | null | undefined, fallback = "—") {
  if (!value) {
    return fallback;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return format(parsed, "MMM d, yyyy h:mm a");
}

function formatMoney(value: number | null | undefined) {
  return currencyFormatter.format(value ?? 0);
}

function sanitizeText(value: string | null | undefined, fallback = "—") {
  if (!value) {
    return fallback;
  }

  return value.replaceAll("â€¢", "-").replaceAll("•", "-");
}

function matchesQuery(query: string, ...values: Array<string | null | undefined>) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function toneForInvoiceStatus(status: "paid" | "partial" | "open" | "overdue") {
  if (status === "paid") {
    return "emerald" as const;
  }
  if (status === "overdue") {
    return "rose" as const;
  }
  if (status === "partial") {
    return "amber" as const;
  }
  return "blue" as const;
}

function toneForQuoteStatus(status: string) {
  if (status === "approved") {
    return "emerald" as const;
  }
  if (status === "expired" || status === "rejected" || status === "cancelled") {
    return "rose" as const;
  }
  if (status === "draft") {
    return "slate" as const;
  }
  return "blue" as const;
}

function toneForInspectionStatus(status: string) {
  if (status === "completed" || status === "invoiced") {
    return "emerald" as const;
  }
  if (status === "follow_up_required") {
    return "amber" as const;
  }
  if (status === "cancelled") {
    return "rose" as const;
  }
  return "blue" as const;
}

function QuickActionLink({
  href,
  label,
  tone = "secondary"
}: {
  href: string;
  label: string;
  tone?: "primary" | "secondary";
}) {
  return (
    <Link
      className={cn(
        "pressable inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition",
        tone === "primary"
          ? "btn-brand-primary border border-transparent"
          : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      )}
      href={href}
    >
      {label}
    </Link>
  );
}

function SummaryMetric({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{note}</p>
    </div>
  );
}

function DetailField({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "pressable inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm font-semibold transition",
        active
          ? "border-[var(--tenant-primary)] bg-[var(--tenant-primary)] text-[var(--tenant-primary-contrast)]"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function SectionHeader({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-3">{children}</div> : null}
    </div>
  );
}

function FilterToolbar({
  query,
  onChange,
  placeholder,
  children
}: {
  query: string;
  onChange: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-xl flex-1">
        <SearchInput
          onChange={(event) => onChange(event.target.value)}
          onClear={() => onChange("")}
          placeholder={placeholder}
          value={query}
        />
      </div>
      {children ? <div className="flex flex-wrap items-center gap-3">{children}</div> : null}
    </div>
  );
}

export function ClientProfileWorkspace({ data }: { data: ClientProfileData }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ClientProfileTab>("overview");
  const [query, setQuery] = useState("");
  const [billingStatusFilter, setBillingStatusFilter] = useState<BillingStatusFilter>("all");
  const [billingSort, setBillingSort] = useState<BillingSort>("date_desc");
  const deferredQuery = useDeferredValue(query);
  const [isRefreshingBilling, startRefreshBilling] = useTransition();

  const filteredInspections = useMemo(
    () =>
      data.inspectionHistory.filter((inspection) =>
        matchesQuery(
          deferredQuery,
          inspection.inspectionNumber,
          inspection.siteName,
          inspection.technicianName,
          inspection.statusLabel,
          inspection.resultLabel,
          ...inspection.inspectionTypes.map((type) => type.label)
        )
      ),
    [data.inspectionHistory, deferredQuery]
  );

  const filteredQuotes = useMemo(
    () =>
      data.quoteHistory.filter((quote) =>
        matchesQuery(
          deferredQuery,
          quote.quoteNumber,
          quote.siteName,
          quote.statusLabel,
          quote.quickbooksEstimateNumber ?? undefined
        )
      ),
    [data.quoteHistory, deferredQuery]
  );

  const filteredWorkHistory = useMemo(
    () =>
      data.workHistory.filter((workItem) =>
        matchesQuery(
          deferredQuery,
          workItem.inspectionNumber,
          workItem.siteName,
          workItem.technicianName,
          workItem.summary,
          workItem.statusLabel
        )
      ),
    [data.workHistory, deferredQuery]
  );

  const filteredDocuments = useMemo(
    () =>
      data.documents.filter((document) =>
        matchesQuery(deferredQuery, document.title, document.type, document.siteName)
      ),
    [data.documents, deferredQuery]
  );

  const filteredActivity = useMemo(
    () =>
      data.activity.filter((item) =>
        matchesQuery(deferredQuery, item.type, item.title, item.detail)
      ),
    [data.activity, deferredQuery]
  );

  const filteredInvoices = useMemo(() => {
    const invoices = data.billing.invoices.filter((invoice) => {
      if (billingStatusFilter !== "all" && invoice.paymentStatus !== billingStatusFilter) {
        return false;
      }

      return matchesQuery(
        deferredQuery,
        invoice.invoiceNumber ?? invoice.invoiceId,
        invoice.memo,
        invoice.statusLabel,
        ...invoice.lineItemSummary
      );
    });

    return [...invoices].sort((left, right) => {
      if (billingSort === "amount_desc") {
        return right.totalAmount - left.totalAmount;
      }
      if (billingSort === "amount_asc") {
        return left.totalAmount - right.totalAmount;
      }
      if (billingSort === "status") {
        return left.statusLabel.localeCompare(right.statusLabel);
      }

      const leftDate = left.invoiceDate?.getTime() ?? 0;
      const rightDate = right.invoiceDate?.getTime() ?? 0;
      return billingSort === "date_asc" ? leftDate - rightDate : rightDate - leftDate;
    });
  }, [billingSort, billingStatusFilter, data.billing.invoices, deferredQuery]);

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={data.customer.isActive ? "Active account" : "Inactive account"} tone={data.customer.isActive ? "emerald" : "slate"} />
              <StatusBadge label={data.customer.quickbooksCustomerId ? "QuickBooks linked" : "QuickBooks not linked"} tone={data.customer.quickbooksCustomerId ? "violet" : "slate"} />
              {data.overview.overdueInvoiceCount > 0 ? (
                <StatusBadge label={`${data.overview.overdueInvoiceCount} overdue invoice${data.overview.overdueInvoiceCount === 1 ? "" : "s"}`} tone="rose" />
              ) : null}
              {data.customer.isTaxExempt ? <StatusBadge label="Tax exempt" tone="blue" /> : null}
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              {data.customer.name}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              One complete account workspace for operational history, billing visibility, site context, and customer communication.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <DetailField label="Primary contact" value={data.customer.contactName ?? "No contact saved"} />
              <DetailField label="Phone" value={data.customer.phone ?? "No phone saved"} />
              <DetailField label="Billing email" value={data.customer.billingEmail ?? "No billing email saved"} />
              <DetailField label="Payment terms" value={data.customer.paymentTermsLabel} />
            </div>
          </div>

          <div className="xl:max-w-md">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <QuickActionLink
                href={`/app/admin/quotes/new?customerCompanyId=${encodeURIComponent(data.customer.id)}`}
                label="Create quote"
                tone="primary"
              />
              <QuickActionLink
                href={`/app/admin/billing/create?customerCompanyId=${encodeURIComponent(data.customer.id)}`}
                label="Create invoice"
              />
              <QuickActionLink
                href={`/app/admin/upcoming-inspections?customerCompanyId=${encodeURIComponent(data.customer.id)}#schedule-inspection`}
                label="Schedule inspection"
              />
              <QuickActionLink
                href={`/app/admin/email-reminders?query=${encodeURIComponent(data.customer.name)}`}
                label="Send email"
              />
              <button
                className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                onClick={() => setActiveTab("billing")}
                type="button"
              >
                View invoices
              </button>
              <QuickActionLink
                href={`/app/admin/clients?customersQuery=${encodeURIComponent(data.customer.name)}`}
                label="Edit customer"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <KPIStatCard
          label="Open Quotes"
          note="Draft, sent, or viewed proposals still in flight."
          tone="blue"
          value={data.overview.openQuoteCount}
        />
        <KPIStatCard
          label="Upcoming Inspections"
          note="Operational visits that are still active or upcoming."
          tone="amber"
          value={data.overview.upcomingInspectionCount}
        />
        <KPIStatCard
          label="Unpaid Invoices"
          note="Open, partial, or overdue QuickBooks balances."
          tone="rose"
          value={data.overview.unpaidInvoiceCount}
        />
        <KPIStatCard
          label="Total Invoiced"
          note="Historical QuickBooks invoiced revenue for this customer."
          tone="emerald"
          value={formatMoney(data.overview.totalInvoiced)}
        />
        <KPIStatCard
          label="Total Paid"
          note="Recognized paid amount based on synced invoice balances."
          tone="violet"
          value={formatMoney(data.overview.totalPaid)}
        />
        <KPIStatCard
          label="Sites"
          note="Customer service locations active in TradeWorx."
          tone="slate"
          value={data.overview.siteCount}
        />
      </section>

      <SectionCard>
        <div className="flex flex-wrap gap-3">
          {tabLabels.map((tab) => (
            <TabButton
              active={activeTab === tab.id}
              key={tab.id}
              label={tab.label}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
      </SectionCard>

      {activeTab === "overview" ? (
        <div className="space-y-6">
          <WorkspaceSplit variant="content-heavy">
            <div className="space-y-6">
              <SectionCard>
                <SectionHeader
                  title="Account overview"
                  description="Quick operational and billing context so office staff can understand the customer at a glance."
                />
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <SummaryMetric label="Last inspection" note="Most recent scheduled or completed inspection date." value={formatDate(data.overview.lastInspectionAt)} />
                  <SummaryMetric label="Last invoice" note="Most recent QuickBooks invoice date available." value={formatDate(data.overview.lastInvoiceAt)} />
                  <SummaryMetric label="Last activity" note="Most recent account activity across inspections, quotes, and billing." value={formatDate(data.overview.lastActivityAt)} />
                  <SummaryMetric label="Overdue total" note="Outstanding overdue balance currently visible in QuickBooks." value={formatMoney(data.overview.overdueTotal)} />
                  <SummaryMetric label="Historical revenue" note="Total invoiced revenue currently synced for this customer." value={formatMoney(data.overview.totalHistoricalRevenue)} />
                  <SummaryMetric label="QuickBooks customer" note="Linked customer reference used for billing sync." value={data.customer.quickbooksCustomerId ?? "Not linked"} />
                </div>
              </SectionCard>

              <SectionCard>
                <SectionHeader
                  title="Sites and service locations"
                  description="Every location tied to this account, with inspection and asset counts for fast operational context."
                />
                <div className="mt-5 space-y-3">
                  {data.sites.length === 0 ? (
                    <EmptyState
                      title="No sites on this account yet"
                      description="This customer does not have dedicated site records yet. Scheduling can still use the generic site option when needed."
                    />
                  ) : (
                    data.sites.map((site) => (
                      <div key={site.id} className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-lg font-semibold text-slate-950">{site.name}</p>
                            <p className="mt-2 text-sm text-slate-500">{site.address || "No address saved"}</p>
                          </div>
                          <div className="grid min-w-[15rem] gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                              <p className="font-semibold text-slate-900">{site.inspectionCount}</p>
                              <p className="mt-1">Inspections</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                              <p className="font-semibold text-slate-900">{site.assetCount}</p>
                              <p className="mt-1">Assets</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </SectionCard>
            </div>

            <div className="space-y-6">
              <SectionCard>
                <SectionHeader
                  title="Contact and billing context"
                  description="The key account details office staff needs before quoting, dispatching, or invoicing."
                />
                <div className="mt-5 space-y-4">
                  <DetailField label="Billing address" value={data.customer.billingAddress || "No billing address saved"} />
                  <DetailField label="Primary service address" value={data.customer.serviceAddress || "No primary service address saved"} />
                  <DetailField label="Internal notes" value={sanitizeText(data.customer.notes, "No customer notes saved")} />
                </div>
              </SectionCard>

              <SectionCard>
                <SectionHeader
                  title="Recent account activity"
                  description="The latest cross-functional signals from operational work, billing, and internal admin actions."
                />
                <div className="mt-5 space-y-3">
                  {data.activity.slice(0, 8).map((item) => (
                    <div key={item.id} className="rounded-[20px] border border-slate-200/80 bg-slate-50/70 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label={item.type} tone="slate" />
                        <p className="text-sm text-slate-500">{formatDateTime(item.timestamp)}</p>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-950">{sanitizeText(item.title)}</p>
                      <p className="mt-1 text-sm text-slate-500">{sanitizeText(item.detail)}</p>
                      {item.href ? (
                        <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={item.href}>
                          Open record
                        </Link>
                      ) : null}
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </WorkspaceSplit>
        </div>
      ) : null}

      {activeTab === "inspections" ? (
        <SectionCard>
          <SectionHeader
            title="Inspection history"
            description="Completed, in-flight, and archived inspection history with site, technician, result, and report access."
          />
          <div className="mt-5">
            <FilterToolbar
              onChange={setQuery}
              placeholder="Search inspection number, site, technician, type, or result"
              query={query}
            />
          </div>
          <div className="mt-5 overflow-x-auto">
            {filteredInspections.length === 0 ? (
              <EmptyState
                title="No inspection history matches this search"
                description="Try a broader search or switch tabs to review quotes, billing, documents, or account activity."
              />
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4 font-semibold">Date</th>
                    <th className="pb-3 pr-4 font-semibold">Inspection</th>
                    <th className="pb-3 pr-4 font-semibold">Site</th>
                    <th className="pb-3 pr-4 font-semibold">Types</th>
                    <th className="pb-3 pr-4 font-semibold">Technician</th>
                    <th className="pb-3 pr-4 font-semibold">Result</th>
                    <th className="pb-3 pr-4 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInspections.map((inspection) => (
                    <tr key={inspection.id} className="align-top">
                      <td className="py-4 pr-4 text-slate-600">{formatDateTime(inspection.scheduledStart)}</td>
                      <td className="py-4 pr-4 font-semibold text-slate-900">{inspection.inspectionNumber}</td>
                      <td className="py-4 pr-4 text-slate-600">{inspection.siteName}</td>
                      <td className="py-4 pr-4 text-slate-600">{inspection.inspectionTypes.map((type) => type.label).join(", ")}</td>
                      <td className="py-4 pr-4 text-slate-600">{inspection.technicianName}</td>
                      <td className="py-4 pr-4 text-slate-600">{inspection.resultLabel}</td>
                      <td className="py-4 pr-4"><StatusBadge label={inspection.statusLabel} tone={toneForInspectionStatus(inspection.status)} /></td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-3">
                          <Link className="font-semibold text-slateblue" href={inspection.inspectionLink}>Open</Link>
                          {inspection.reportLink ? <Link className="font-semibold text-slateblue" href={inspection.reportLink}>Report</Link> : null}
                          {inspection.archiveLink ? <Link className="font-semibold text-slateblue" href={inspection.archiveLink}>Archive</Link> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "quotes" ? (
        <SectionCard>
          <SectionHeader
            title="Quote and proposal history"
            description="Every proposal issued for this customer, including hosted links, expiration visibility, and QuickBooks estimate references."
          />
          <div className="mt-5">
            <FilterToolbar
              onChange={setQuery}
              placeholder="Search quote number, site, status, or estimate number"
              query={query}
            />
          </div>
          <div className="mt-5 overflow-x-auto">
            {filteredQuotes.length === 0 ? (
              <EmptyState
                title="No quotes match this search"
                description="This customer either has no proposals yet or the current search is too narrow."
              />
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4 font-semibold">Issued</th>
                    <th className="pb-3 pr-4 font-semibold">Proposal #</th>
                    <th className="pb-3 pr-4 font-semibold">Site</th>
                    <th className="pb-3 pr-4 font-semibold">Status</th>
                    <th className="pb-3 pr-4 font-semibold">Expires</th>
                    <th className="pb-3 pr-4 font-semibold">Total</th>
                    <th className="pb-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQuotes.map((quote) => (
                    <tr key={quote.id} className="align-top">
                      <td className="py-4 pr-4 text-slate-600">{formatDate(quote.issuedAt)}</td>
                      <td className="py-4 pr-4 font-semibold text-slate-900">{quote.quoteNumber}</td>
                      <td className="py-4 pr-4 text-slate-600">{quote.siteName}</td>
                      <td className="py-4 pr-4"><StatusBadge label={quote.statusLabel} tone={toneForQuoteStatus(quote.status)} /></td>
                      <td className="py-4 pr-4 text-slate-600">{formatDate(quote.expiresAt)}</td>
                      <td className="py-4 pr-4 text-slate-600">{formatMoney(quote.total)}</td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-3">
                          <Link className="font-semibold text-slateblue" href={quote.detailLink}>Open</Link>
                          {quote.hostedQuoteUrl ? <Link className="font-semibold text-slateblue" href={quote.hostedQuoteUrl}>Hosted</Link> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "work" ? (
        <SectionCard>
          <SectionHeader
            title="Work and service history"
            description="Service-style history tied to work-order tasks or non-inspection operational visits."
          />
          <div className="mt-5">
            <FilterToolbar
              onChange={setQuery}
              placeholder="Search work number, site, technician, summary, or status"
              query={query}
            />
          </div>
          <div className="mt-5 overflow-x-auto">
            {filteredWorkHistory.length === 0 ? (
              <EmptyState
                title="No work history matches this search"
                description="There are no work-order style records for this customer yet, or the current search is too narrow."
              />
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4 font-semibold">Date</th>
                    <th className="pb-3 pr-4 font-semibold">Work #</th>
                    <th className="pb-3 pr-4 font-semibold">Site</th>
                    <th className="pb-3 pr-4 font-semibold">Technician</th>
                    <th className="pb-3 pr-4 font-semibold">Summary</th>
                    <th className="pb-3 pr-4 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWorkHistory.map((workItem) => (
                    <tr key={workItem.id} className="align-top">
                      <td className="py-4 pr-4 text-slate-600">{formatDateTime(workItem.scheduledStart)}</td>
                      <td className="py-4 pr-4 font-semibold text-slate-900">{workItem.inspectionNumber}</td>
                      <td className="py-4 pr-4 text-slate-600">{workItem.siteName}</td>
                      <td className="py-4 pr-4 text-slate-600">{workItem.technicianName}</td>
                      <td className="py-4 pr-4 text-slate-600">{workItem.summary}</td>
                      <td className="py-4 pr-4 text-slate-600">{workItem.statusLabel}</td>
                      <td className="py-4">
                        <Link className="font-semibold text-slateblue" href={workItem.inspectionLink}>Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "billing" ? (
        <SectionCard>
          <SectionHeader
            title="Billing and invoice history"
            description="QuickBooks invoice visibility, balances, payment posture, and invoice access in one customer-specific billing workspace."
          >
            <ActionButton
              onClick={() => {
                startRefreshBilling(() => {
                  router.refresh();
                });
              }}
              pending={isRefreshingBilling}
              pendingLabel="Refreshing..."
            >
              Refresh invoices
            </ActionButton>
          </SectionHeader>

          <div className="mt-5 space-y-4">
            {!data.billing.connection.connected ? (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                {data.billing.connection.guidance ?? "Reconnect QuickBooks to load invoice history for this customer."}
              </div>
            ) : null}
            {data.billing.connection.connected && !data.billing.customerLinked ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
                This customer is not linked to a QuickBooks customer record yet, so invoice history cannot be loaded.
              </div>
            ) : null}
            {data.billing.syncError ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {data.billing.syncError}
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric label="Unpaid invoices" note="Open, partial, and overdue balances." value={String(data.overview.unpaidInvoiceCount)} />
            <SummaryMetric label="Overdue invoices" note="Invoices already past due in QuickBooks." value={String(data.overview.overdueInvoiceCount)} />
            <SummaryMetric label="Total invoiced" note="Historical invoiced total visible in sync." value={formatMoney(data.overview.totalInvoiced)} />
            <SummaryMetric label="Last synced" note="Customer invoice history freshness." value={formatDateTime(data.billing.lastSyncedAt)} />
          </div>

          <div className="mt-5">
            <FilterToolbar
              onChange={setQuery}
              placeholder="Search invoice number, memo, line items, or status"
              query={query}
            >
              <select
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                onChange={(event) => setBillingStatusFilter(event.target.value as BillingStatusFilter)}
                value={billingStatusFilter}
              >
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="partial">Partial</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
              </select>
              <select
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                onChange={(event) => setBillingSort(event.target.value as BillingSort)}
                value={billingSort}
              >
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="amount_desc">Highest amount</option>
                <option value="amount_asc">Lowest amount</option>
                <option value="status">Status</option>
              </select>
            </FilterToolbar>
          </div>

          <div className="mt-5 overflow-x-auto">
            {filteredInvoices.length === 0 ? (
              <EmptyState
                title="No invoices match this billing view"
                description="Try a broader search, clear the status filter, or refresh QuickBooks invoice history."
              />
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4 font-semibold">Invoice #</th>
                    <th className="pb-3 pr-4 font-semibold">Date</th>
                    <th className="pb-3 pr-4 font-semibold">Due</th>
                    <th className="pb-3 pr-4 font-semibold">Amount</th>
                    <th className="pb-3 pr-4 font-semibold">Balance</th>
                    <th className="pb-3 pr-4 font-semibold">Status</th>
                    <th className="pb-3 pr-4 font-semibold">Summary</th>
                    <th className="pb-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.invoiceId} className="align-top">
                      <td className="py-4 pr-4 font-semibold text-slate-900">{invoice.invoiceNumber ?? invoice.invoiceId}</td>
                      <td className="py-4 pr-4 text-slate-600">{formatDate(invoice.invoiceDate)}</td>
                      <td className="py-4 pr-4 text-slate-600">{formatDate(invoice.dueDate)}</td>
                      <td className="py-4 pr-4 text-slate-600">{formatMoney(invoice.totalAmount)}</td>
                      <td className="py-4 pr-4 text-slate-600">{formatMoney(invoice.balanceDue)}</td>
                      <td className="py-4 pr-4"><StatusBadge label={invoice.statusLabel} tone={toneForInvoiceStatus(invoice.paymentStatus)} /></td>
                      <td className="py-4 pr-4 text-slate-600">
                        {invoice.lineItemSummary.length > 0 ? invoice.lineItemSummary.join(", ") : sanitizeText(invoice.memo, "No summary")}
                      </td>
                      <td className="py-4">
                        <Link className="font-semibold text-slateblue" href={invoice.invoiceUrl} target="_blank">
                          Open invoice
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "documents" ? (
        <SectionCard>
          <SectionHeader
            title="Documents and files"
            description="Reports, proposal PDFs, signed documents, and inspection attachments connected to this customer."
          />
          <div className="mt-5">
            <FilterToolbar
              onChange={setQuery}
              placeholder="Search document title, type, or site"
              query={query}
            />
          </div>
          <div className="mt-5 space-y-3">
            {filteredDocuments.length === 0 ? (
              <EmptyState
                title="No documents match this search"
                description="This customer does not have matching files in TradeWorx yet, or the current search is too narrow."
              />
            ) : (
              filteredDocuments.map((document) => (
                <div key={document.id} className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{document.title}</p>
                      <p className="mt-2 text-sm text-slate-500">{document.type} - {document.siteName}</p>
                      <p className="mt-1 text-sm text-slate-500">Added {formatDateTime(document.uploadedAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Link className="font-semibold text-slateblue" href={document.href}>Open file</Link>
                      <Link className="font-semibold text-slateblue" href={document.relatedLink}>Open record</Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "notes" ? (
        <WorkspaceSplit variant="balanced">
          <SectionCard>
            <SectionHeader
              title="Internal notes"
              description="Persistent internal customer context for dispatch, billing, access, and service instructions."
            />
            <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5 text-sm leading-7 text-slate-700">
              {sanitizeText(data.notes.customerNotes, "No internal customer notes have been saved yet.")}
            </div>
          </SectionCard>

          <SectionCard>
            <SectionHeader
              title="Recent note-adjacent activity"
              description="Recent internal changes and account actions that help explain current context."
            />
            <div className="mt-5 space-y-3">
              {data.notes.recentActivity.length === 0 ? (
                <EmptyState
                  title="No recent internal activity"
                  description="Internal account events will appear here as admins work inside the customer record, inspections, quotes, and billing."
                />
              ) : (
                data.notes.recentActivity.map((entry) => (
                  <div key={entry.id} className="rounded-[20px] border border-slate-200/80 bg-slate-50/70 p-4">
                    <p className="text-sm font-semibold text-slate-950">{entry.action}</p>
                    <p className="mt-1 text-sm text-slate-500">{entry.actorName} - {formatDateTime(entry.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </WorkspaceSplit>
      ) : null}

      {activeTab === "activity" ? (
        <SectionCard>
          <SectionHeader
            title="Customer activity timeline"
            description="A unified operational timeline across inspections, quotes, invoices, and internal admin events."
          />
          <div className="mt-5">
            <FilterToolbar
              onChange={setQuery}
              placeholder="Search activity title, detail, or type"
              query={query}
            />
          </div>
          <div className="mt-5 space-y-3">
            {filteredActivity.length === 0 ? (
              <EmptyState
                title="No activity matches this search"
                description="Try a broader search to see the full operational and billing timeline for this customer."
              />
            ) : (
              filteredActivity.map((item) => (
                <div key={item.id} className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={item.type} tone="slate" />
                    <p className="text-sm text-slate-500">{formatDateTime(item.timestamp)}</p>
                  </div>
                  <p className="mt-3 text-base font-semibold text-slate-950">{sanitizeText(item.title)}</p>
                  <p className="mt-1 text-sm text-slate-500">{sanitizeText(item.detail)}</p>
                  {item.href ? (
                    <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={item.href}>
                      Open related record
                    </Link>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
