import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LiveUrlSelectFilter } from "@/app/live-url-select-filter";
import { LiveUrlSearchSelect } from "@/app/live-url-search-select";
import { getAdminReportReviewQueueData } from "@testworx/lib/server/index";

import {
  AppPageShell,
  EmptyState,
  FilterBar,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge,
  WorkQueueNav
} from "../operations-ui";

function taskDisplayLabel(task: { inspectionType: string; displayLabel?: string }) {
  return task.displayLabel ?? task.inspectionType.replaceAll("_", " ");
}

function buildReadyToBillHref(input: { month?: string; query?: string }) {
  const search = new URLSearchParams();
  if (input.month) {
    search.set("month", input.month);
  }
  if (input.query?.trim()) {
    search.set("q", input.query.trim());
  }

  const query = search.toString();
  return query ? `/app/admin/reports?${query}` : "/app/admin/reports";
}

function uniqueSearchOptions<T extends { value: string }>(options: T[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.value.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export default async function AdminReportsQueuePage({
  searchParams
}: {
  searchParams?: Promise<{ month?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const month = typeof params.month === "string" ? params.month : undefined;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const currentPath = buildReadyToBillHref({ month, query });

  const data = await getAdminReportReviewQueueData(
    {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    },
    { month, query }
  );
  const readyToBillSearchOptions = uniqueSearchOptions([
    ...data.inspections.map((inspection) => ({
      value: inspection.customerCompany.name,
      label: inspection.customerCompany.name,
      secondaryLabel: "Customer",
      badge: "Customer"
    })),
    ...data.inspections.map((inspection) => ({
      value: inspection.primaryTitle ?? inspection.site.name,
      label: inspection.primaryTitle ?? inspection.site.name,
      secondaryLabel: [inspection.secondaryTitle, inspection.site.city].filter(Boolean).join(" | ") || "Inspection location",
      badge: "Location"
    })),
    ...data.inspections.map((inspection) => ({
      value: inspection.id,
      label: `Inspection ${inspection.id.slice(0, 8)}`,
      secondaryLabel: [inspection.customerCompany.name, inspection.primaryTitle, format(inspection.completedAt ?? inspection.scheduledStart, "MMM d, yyyy")].filter(Boolean).join(" | "),
      badge: "Inspection"
    })),
    ...data.inspections.flatMap((inspection) =>
      inspection.reviewTasks.map((task) => ({
        value: taskDisplayLabel(task),
        label: taskDisplayLabel(task),
        secondaryLabel: inspection.customerCompany.name,
        badge: "Report"
      }))
    )
  ]);

  return (
    <AppPageShell>
      <PageHeader
        backNavigation={{ label: "Back to admin", fallbackHref: "/app/admin" }}
        description="Completed inspections with finalized reports that still require invoice action. Invoiced and closed work stays out of this queue."
        eyebrow="Ready to bill"
        title="Ready to bill"
      />

      <WorkQueueNav activeKey="review" />

      <section className="grid gap-3 md:grid-cols-2">
        <KPIStatCard
          label="Ready to bill"
          note="Finalized, non-invoiced work requiring invoice follow-through."
          tone="emerald"
          value={data.counts.readyToBill}
        />
        <KPIStatCard
          label="Sync issues"
          note="Finalized work with a sync failure that needs technical review instead of billing action."
          tone="rose"
          value={data.counts.syncIssues}
        />
        <KPIStatCard
          label="Finalized this month"
          note="Completed inspections in the selected month with finalized report history."
          tone="slate"
          value={data.counts.completed}
        />
      </section>

      <FilterBar
        description="Search for a customer or inspection, then switch months only when you need older finalized, non-invoiced work."
        title="Queue filters"
      >
        <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.32fr)_auto]">
          <LiveUrlSearchSelect
            className="min-w-0"
            emptyText="No matching ready-to-bill inspections found"
            initialValue={data.filters.query}
            options={readyToBillSearchOptions}
            paramKey="q"
            placeholder="Search customer, inspection, site, technician, or report type"
          />
          <LiveUrlSelectFilter options={data.options.months} paramKey="month" value={data.filters.month} />
          {data.filters.query ? (
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[color:var(--border-default)] bg-white px-4 py-3 text-sm font-semibold text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-subtle)]"
              href={buildReadyToBillHref({ month: data.filters.month })}
            >
              Clear search
            </Link>
          ) : null}
        </div>
      </FilterBar>

      <SectionCard>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Action queue
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
              Finalized work ready for invoice
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {data.inspections.length} inspection{data.inspections.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {data.inspections.length === 0 ? (
            <EmptyState
              description="No finalized, non-invoiced inspections require billing action for the selected month."
              title="Ready-to-bill queue is clear"
            />
          ) : (
            data.inspections.map((inspection) => (
              <div
                key={inspection.id}
                className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white"
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-950">
                        {inspection.primaryTitle ?? inspection.site.name}
                      </p>
                      <StatusBadge label={inspection.lifecycleSummary.primaryLabel} tone="emerald" />
                    </div>
                    <p className="text-sm leading-5 text-slate-500">
                      {[inspection.secondaryTitle, format(inspection.completedAt ?? inspection.scheduledStart, "MMM d, yyyy")].filter(Boolean).join(" - ")}
                    </p>
                    <p className="text-sm leading-5 text-slate-500">
                      Assigned: {inspection.assignedTechnicianNames.join(", ") || "Shared queue"}
                    </p>
                    <div className="grid gap-2.5 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                        <p className="font-medium text-slate-800">Finalized report types</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {inspection.reviewTasks.map((task) => (
                            <span
                              key={task.id}
                              className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
                            >
                              {taskDisplayLabel(task)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                        <p>Billing status: {inspection.billingStatus ?? "Not started"}</p>
                        <p className="mt-1">Action needed: {inspection.lifecycleSummary.nextAction ?? "Create Invoice"}</p>
                        <p className="mt-1">Finalized reports: {inspection.reviewTasks.length}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-56 flex-col gap-2.5">
                    {inspection.reviewTasks[0] ? (
                      <Link
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white"
                        href={`/app/admin/reports/${inspection.id}/${inspection.reviewTasks[0].id}`}
                      >
                        Open finalized report
                      </Link>
                    ) : null}
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                      href={`/app/admin/billing/${inspection.id}?from=${encodeURIComponent(currentPath)}`}
                    >
                      Create invoice
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

