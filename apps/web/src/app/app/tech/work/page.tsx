import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ClaimButton } from "../claim-button";
import { formatInspectionTaskSummary, getTechnicianDashboardData } from "@testworx/lib/server/index";

type TechnicianDashboardData = Awaited<ReturnType<typeof getTechnicianDashboardData>>;

type WorkFilter = "today" | "upcoming" | "overdue" | "completed";

function normalizeFilter(value: string | string[] | undefined): WorkFilter {
  return value === "today" || value === "upcoming" || value === "overdue" || value === "completed" ? value : "today";
}

function firstOpenTask(inspection: TechnicianDashboardData["assigned"][number] | TechnicianDashboardData["recentCompleted"][number]) {
  return inspection.tasks.find((task) => task.report?.status !== "finalized") ?? inspection.tasks[0] ?? null;
}

function matchesQuery(
  inspection: TechnicianDashboardData["assigned"][number] | TechnicianDashboardData["unassigned"][number] | TechnicianDashboardData["recentCompleted"][number],
  query: string
) {
  if (!query) {
    return true;
  }

  const haystack = [
    inspection.site.name,
    inspection.customerCompany.name,
    inspection.primaryTitle,
    inspection.secondaryTitle,
    ...inspection.tasks.map((task) => task.displayLabel ?? task.inspectionType.replaceAll("_", " "))
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function filterInspectionGroups(
  dashboard: TechnicianDashboardData,
  filter: WorkFilter,
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();

  if (filter === "completed") {
    return {
      assigned: [] as TechnicianDashboardData["assigned"],
      claimable: [] as TechnicianDashboardData["unassigned"],
      completed: dashboard.recentCompleted.filter((inspection) => matchesQuery(inspection, normalizedQuery))
    };
  }

  const assignedSource =
    filter === "today"
      ? dashboard.today
      : filter === "upcoming"
        ? dashboard.assigned.filter((inspection) => !dashboard.today.some((todayInspection) => todayInspection.id === inspection.id))
        : dashboard.assigned.filter((inspection) => inspection.displayStatus === "past_due");

  const claimableSource =
    filter === "today"
      ? dashboard.unassigned.filter((inspection) => {
          const scheduledDay = format(inspection.scheduledStart, "yyyy-MM-dd");
          return scheduledDay === format(new Date(), "yyyy-MM-dd");
        })
      : filter === "upcoming"
        ? dashboard.unassigned.filter((inspection) => format(inspection.scheduledStart, "yyyy-MM-dd") > format(new Date(), "yyyy-MM-dd"))
        : dashboard.unassigned.filter((inspection) => inspection.displayStatus === "past_due");

  return {
    assigned: assignedSource.filter((inspection) => matchesQuery(inspection, normalizedQuery)),
    claimable: claimableSource.filter((inspection) => matchesQuery(inspection, normalizedQuery)),
    completed: [] as TechnicianDashboardData["recentCompleted"]
  };
}

export default async function TechnicianWorkPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "technician") {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const filter = normalizeFilter(params.filter);
  const query = typeof params.query === "string" ? params.query : "";
  const dashboard = await getTechnicianDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
  const filtered = filterInspectionGroups(dashboard, filter, query);

  return (
    <div className="space-y-5 pb-4">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
        <form className="space-y-4">
          <input
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-[15px] text-slate-900 outline-none transition focus:border-[var(--tenant-primary)]/30 focus:bg-white"
            defaultValue={query}
            name="query"
            placeholder="Search by site, customer, or job type"
            type="search"
          />
          <div className="grid grid-cols-2 gap-2">
            {[
              ["today", "Today"],
              ["upcoming", "Upcoming"],
              ["overdue", "Overdue"],
              ["completed", "Completed"]
            ].map(([value, label]) => (
              <button
                key={value}
                className={filter === value
                  ? "min-h-11 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                  : "min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"}
                name="filter"
                type="submit"
                value={value}
              >
                {label}
              </button>
            ))}
          </div>
        </form>
      </section>

      {filter === "completed" ? (
        <section className="space-y-3">
          {filtered.completed.length > 0 ? filtered.completed.map((inspection) => (
            <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
              <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
              {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
              <p className="mt-3 text-sm text-slate-600">
                Completed {format(inspection.scheduledStart, "MMM d, h:mm a")} • {formatInspectionTaskSummary(inspection.tasks)}
              </p>
            </article>
          )) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              No recently completed work matches this filter.
            </div>
          )}
        </section>
      ) : (
        <div className="space-y-5">
          <section className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Your field queue</h2>
            </div>
            {filtered.assigned.length > 0 ? filtered.assigned.map((inspection) => {
              const action = firstOpenTask(inspection);
              return (
                <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                      {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                    </div>
                    <span className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                      {format(inspection.scheduledStart, "MMM d")}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{formatInspectionTaskSummary(inspection.tasks)}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {action ? (
                      <Link className="flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white" href={`/app/tech/reports/${inspection.id}/${action.id}`}>
                        {action.report?.status === "draft" || action.report?.status === "submitted" ? "Resume inspection" : "Start inspection"}
                      </Link>
                    ) : null}
                    <Link className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" href="/app/tech/inspections">
                      Inspection details
                    </Link>
                  </div>
                </article>
              );
            }) : (
              <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
                No assigned work matches this filter.
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Claimable</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Shared queue</h2>
            </div>
            {filtered.claimable.length > 0 ? filtered.claimable.map((inspection) => (
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
                <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                <p className="mt-3 text-sm text-slate-600">{formatInspectionTaskSummary(inspection.tasks)}</p>
                <div className="mt-4">
                  <ClaimButton inspectionId={inspection.id} />
                </div>
              </article>
            )) : (
              <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
                No claimable work matches this filter.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
