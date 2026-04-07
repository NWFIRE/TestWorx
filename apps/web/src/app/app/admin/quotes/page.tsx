import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getQuoteStatusTone,
  getQuoteWorkspaceData,
  quoteStatusLabels,
  quoteSyncStatusLabels,
  getQuoteSyncTone
} from "@testworx/lib";

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

const statusOptions = [
  { value: "all", label: "All quotes" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
  { value: "converted", label: "Converted" }
] as const;

const syncOptions = [
  { value: "all", label: "All sync states" },
  { value: "not_synced", label: "Not synced" },
  { value: "synced", label: "Synced" },
  { value: "sync_error", label: "Sync error" }
] as const;

function buildHref(params: { status?: string; syncStatus?: string; query?: string }) {
  const search = new URLSearchParams();
  if (params.status && params.status !== "all") {
    search.set("status", params.status);
  }
  if (params.syncStatus && params.syncStatus !== "all") {
    search.set("syncStatus", params.syncStatus);
  }
  if (params.query) {
    search.set("query", params.query);
  }
  const query = search.toString();
  return query ? `/app/admin/quotes?${query}` : "/app/admin/quotes";
}

export default async function QuotesPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string; syncStatus?: string; query?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const selectedStatus = statusOptions.some((option) => option.value === params.status) ? params.status ?? "all" : "all";
  const selectedSync = syncOptions.some((option) => option.value === params.syncStatus) ? params.syncStatus ?? "all" : "all";
  const query = typeof params.query === "string" ? params.query : "";

  const quotes = await getQuoteWorkspaceData(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    { status: selectedStatus, syncStatus: selectedSync, query }
  );

  return (
    <AppPageShell>
      <PageHeader
        eyebrow="Quotes"
        title="Customer quotes"
        description="Create, send, approve, sync, and convert quotes without leaving the TradeWorx operations workspace."
        actions={(
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#1f4678] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            href="/app/admin/quotes/new"
          >
            New quote
          </Link>
        )}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard label="Draft quotes" note="Still being prepared or waiting on final review." tone="slate" value={quotes.filter((quote) => quote.effectiveStatus === "draft").length} />
        <KPIStatCard label="Sent quotes" note="Already delivered and waiting on the customer." tone="blue" value={quotes.filter((quote) => ["sent", "viewed"].includes(quote.effectiveStatus)).length} />
        <KPIStatCard label="Approved" note="Ready to convert into operational work." tone="emerald" value={quotes.filter((quote) => quote.effectiveStatus === "approved").length} />
        <KPIStatCard label="Sync issues" note="Quotes that still need a QuickBooks fix before sync succeeds." tone="rose" value={quotes.filter((quote) => quote.syncStatus === "sync_error").length} />
      </section>

      <FilterBar title="Quote filters" description="Filter by lifecycle, QuickBooks state, and customer context.">
        {statusOptions.map((option) => (
          <FilterChipLink
            active={selectedStatus === option.value}
            href={buildHref({ status: option.value, syncStatus: selectedSync, query })}
            key={option.value}
            label={option.label}
            tone="blue"
          />
        ))}
      </FilterBar>

      <SectionCard>
        <form action="/app/admin/quotes" className="grid gap-3 lg:grid-cols-[1.2fr_0.9fr_auto]">
          <input
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
            defaultValue={query}
            name="query"
            placeholder="Search quote number, customer, site, or service"
          />
          <select className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900" defaultValue={selectedSync} name="syncStatus">
            {syncOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input name="status" type="hidden" value={selectedStatus} />
          <button className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" type="submit">
            Apply filters
          </button>
        </form>
      </SectionCard>

      <SectionCard>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Quote queue</h2>
            <p className="mt-1 text-sm text-slate-500">Monitor sent, approved, expired, and converted work without losing QuickBooks context.</p>
          </div>
          <p className="text-sm text-slate-500">{quotes.length} quote{quotes.length === 1 ? "" : "s"}</p>
        </div>

        {quotes.length === 0 ? (
          <EmptyState title="No quotes match this workspace filter" description="Adjust the lifecycle or sync filters, or create a new quote to start the workflow." />
        ) : (
          <div className="space-y-4">
            {quotes.map((quote) => (
              <div key={quote.id} className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5 transition hover:border-slate-300 hover:bg-white">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-slate-950">{quote.quoteNumber}</p>
                      <StatusBadge label={quoteStatusLabels[quote.effectiveStatus]} tone={getQuoteStatusTone(quote.effectiveStatus)} />
                      <StatusBadge label={quoteSyncStatusLabels[quote.syncStatus]} tone={getQuoteSyncTone(quote.syncStatus)} />
                    </div>
                    <p className="text-sm text-slate-500">
                      {quote.customerCompany.name}{quote.site ? ` • ${quote.site.name}` : ""} • Issued {format(quote.issuedAt, "MMM d, yyyy")}
                    </p>
                    <div className="grid gap-3 pt-1 md:grid-cols-4">
                      <p className="text-sm text-slate-600">Line items: <span className="font-semibold text-slate-950">{quote.lineItems.length}</span></p>
                      <p className="text-sm text-slate-600">Recipient: <span className="font-semibold text-slate-950">{quote.recipientEmail ?? "—"}</span></p>
                      <p className="text-sm text-slate-600">Expires: <span className="font-semibold text-slate-950">{quote.expiresAt ? format(quote.expiresAt, "MMM d, yyyy") : "—"}</span></p>
                      <p className="text-sm text-slate-600">Total: <span className="font-semibold text-slate-950">${quote.total.toFixed(2)}</span></p>
                    </div>
                    <div className="grid gap-3 pt-1 md:grid-cols-4">
                      <p className="text-sm text-slate-600">Sent: <span className="font-semibold text-slate-950">{quote.lastSentAt ? format(quote.lastSentAt, "MMM d, yyyy") : "—"}</span></p>
                      <p className="text-sm text-slate-600">Viewed: <span className="font-semibold text-slate-950">{quote.firstViewedAt ? format(quote.firstViewedAt, "MMM d, yyyy") : "—"}</span></p>
                      <p className="text-sm text-slate-600">Response: <span className="font-semibold text-slate-950">{quote.approvedAt ? "Approved" : quote.declinedAt ? "Declined" : "Pending"}</span></p>
                      <p className="text-sm text-slate-600">Engagement: <span className="font-semibold capitalize text-slate-950">{quote.engagementStatus.replaceAll("_", " ")}</span></p>
                    </div>
                  </div>

                  <Link
                    className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    href={`/app/admin/quotes/${quote.id}?from=${encodeURIComponent(buildHref({ status: selectedStatus, syncStatus: selectedSync, query }))}`}
                  >
                    Open quote
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </AppPageShell>
  );
}
