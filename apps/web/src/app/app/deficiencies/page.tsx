import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAdminDeficiencyDashboardData } from "@testworx/lib/server/index";

import { updateDeficiencyStatusAction } from "../admin/actions";
import {
  AppPageShell,
  EmptyState,
  FilterBar,
  FilterChipLink,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge
} from "../admin/operations-ui";

type DeficiencyListItem = {
  id: string;
  inspectionId: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  assetTag: string | null;
  deviceType: string | null;
  location: string | null;
  section: string;
  notes: string | null;
  photoStorageKey: string | null;
  customerName: string;
  siteName: string;
  inspection: { scheduledStart: Date };
};

const genericSiteName = "General / No Fixed Site";

function isGenericSiteName(siteName: string) {
  return siteName.trim().toLowerCase() === genericSiteName.toLowerCase();
}

function buildDeficiencyContext(deficiency: DeficiencyListItem) {
  const parts = [deficiency.customerName];
  if (deficiency.siteName && !isGenericSiteName(deficiency.siteName)) {
    parts.push(deficiency.siteName);
  }
  parts.push(format(deficiency.inspection.scheduledStart, "MMM d, yyyy h:mm a"));
  return parts.join(" | ");
}

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "quoted", label: "Quoted" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" }
] as const;

const severityOptions = [
  { value: "all", label: "All severities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" }
] as const;

const severityTones = {
  low: "slate",
  medium: "blue",
  high: "amber",
  critical: "rose"
} as const;

const statusTones = {
  open: "amber",
  quoted: "blue",
  approved: "emerald",
  scheduled: "violet",
  resolved: "emerald",
  ignored: "slate"
} as const;

function parseFilterValues(value?: string) {
  if (!value || value === "all") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildFilterHref(
  status: string | undefined,
  severity: string | undefined,
  siteId: string | undefined
) {
  const search = new URLSearchParams();
  if (status) {
    search.set("status", status);
  }
  if (severity) {
    search.set("severity", severity);
  }
  if (siteId) {
    search.set("siteId", siteId);
  }
  const query = search.toString();
  return query ? `/app/deficiencies?${query}` : "/app/deficiencies";
}

export default async function DeficienciesPage({
  searchParams
}: {
  searchParams: Promise<{ siteId?: string; status?: string; severity?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = await searchParams;
  const requestedStatuses = parseFilterValues(params.status);
  const requestedSeverities = parseFilterValues(params.severity);
  const data = await getAdminDeficiencyDashboardData(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    {
      siteId: params.siteId,
      status: requestedStatuses.length === 1 ? requestedStatuses[0] : undefined,
      severity: requestedSeverities.length === 1 ? requestedSeverities[0] : undefined
    }
  );
  const deficiencies = (data.deficiencies as unknown as DeficiencyListItem[]).filter((deficiency) => {
    const matchesStatus =
      requestedStatuses.length === 0 || requestedStatuses.includes(deficiency.status);
    const matchesSeverity =
      requestedSeverities.length === 0 || requestedSeverities.includes(deficiency.severity);

    return matchesStatus && matchesSeverity;
  });
  const activeStatusFilter = requestedStatuses.length > 0 ? requestedStatuses.join(",") : undefined;
  const activeSeverityFilter =
    requestedSeverities.length > 0 ? requestedSeverities.join(",") : undefined;

  return (
    <AppPageShell>
      <PageHeader
        actions={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            href="/app/admin"
          >
            Open scheduling
          </Link>
        }
        description="Review issues captured from inspection results, update workflow status, and jump back into the originating inspection when dispatch or estimating needs context."
        eyebrow="Deficiency center"
        title="Inspection failures ready for quote or repair follow-up"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Open", data.counts.open, "amber"],
          ["Quoted", data.counts.quoted, "blue"],
          ["Approved", data.counts.approved, "emerald"],
          ["Scheduled", data.counts.scheduled, "violet"],
          ["Resolved", data.counts.resolved, "emerald"],
          ["Ignored", data.counts.ignored, "slate"]
        ].map(([label, value, tone]) => (
          <KPIStatCard
            key={String(label)}
            label={String(label)}
            note={`${value} record${value === 1 ? "" : "s"} in this workflow state.`}
            tone={tone as "slate" | "amber" | "blue" | "emerald" | "violet"}
            value={Number(value)}
          />
        ))}
      </section>

      <FilterBar
        description="Combine workflow and severity filters to stay focused on the most urgent open issues."
        title="Filters"
      >
        {statusOptions.map((option) => (
          <FilterChipLink
            active={activeStatusFilter === (option.value === "all" ? undefined : option.value)}
            href={buildFilterHref(
              option.value === "all" ? undefined : option.value,
              activeSeverityFilter,
              data.filters.siteId
            )}
            key={option.value}
            label={option.label}
            tone="blue"
          />
        ))}
        {severityOptions.map((option) => (
          <FilterChipLink
            active={activeSeverityFilter === (option.value === "all" ? undefined : option.value)}
            href={buildFilterHref(
              activeStatusFilter,
              option.value === "all" ? undefined : option.value,
              data.filters.siteId
            )}
            key={option.value}
            label={option.label}
            tone="amber"
          />
        ))}
      </FilterBar>

      <SectionCard>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Active list
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              Deficiency records
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {deficiencies.length} record{deficiencies.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {deficiencies.length === 0 ? (
            <EmptyState
              description="No active deficiencies match the current status and severity filters."
              title="No deficiencies match these filters"
            />
          ) : (
            deficiencies.map((deficiency) => (
              <div
                key={deficiency.id}
                className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-5 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-slate-950">{deficiency.title}</p>
                      <StatusBadge
                        label={deficiency.severity}
                        tone={severityTones[deficiency.severity as keyof typeof severityTones] ?? "slate"}
                      />
                      <StatusBadge
                        label={deficiency.status}
                        tone={statusTones[deficiency.status as keyof typeof statusTones] ?? "slate"}
                      />
                    </div>
                    <p className="text-sm text-slate-500">
                      {buildDeficiencyContext(deficiency)}
                    </p>
                    <p className="text-sm text-slate-700">{deficiency.description}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        <p>Device: {deficiency.deviceType ?? "Not recorded"}</p>
                        <p className="mt-1">Location: {deficiency.location ?? "Not recorded"}</p>
                        <p className="mt-1">Section: {deficiency.section.replaceAll("-", " ")}</p>
                        {deficiency.assetTag ? <p className="mt-1">Asset tag: {deficiency.assetTag}</p> : null}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        <p>Notes: {deficiency.notes ?? "No follow-up notes yet."}</p>
                        {deficiency.photoStorageKey ? (
                          <a
                            className="mt-3 inline-flex font-semibold text-slateblue"
                            href={`/api/deficiencies/${deficiency.id}/photo`}
                          >
                            View photo evidence
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-64 flex-col gap-3">
                    <form action={updateDeficiencyStatusAction}>
                      <input name="deficiencyId" type="hidden" value={deficiency.id} />
                      <input name="status" type="hidden" value="quoted" />
                      <button
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                        type="submit"
                      >
                        Generate quote
                      </button>
                    </form>
                    <form action={updateDeficiencyStatusAction}>
                      <input name="deficiencyId" type="hidden" value={deficiency.id} />
                      <input name="status" type="hidden" value="scheduled" />
                      <button
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                        type="submit"
                      >
                        Create repair work order
                      </button>
                    </form>
                    <form action={updateDeficiencyStatusAction}>
                      <input name="deficiencyId" type="hidden" value={deficiency.id} />
                      <input name="status" type="hidden" value="resolved" />
                      <button
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
                        type="submit"
                      >
                        Mark resolved
                      </button>
                    </form>
                    <form action={updateDeficiencyStatusAction}>
                      <input name="deficiencyId" type="hidden" value={deficiency.id} />
                      <input name="status" type="hidden" value="ignored" />
                      <button
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"
                        type="submit"
                      >
                        Ignore
                      </button>
                    </form>
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white"
                      href={`/app/admin/inspections/${deficiency.inspectionId}`}
                    >
                      View inspection
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </AppPageShell>
  );
}

