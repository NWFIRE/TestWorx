/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { ClaimButton } from "./claim-button";
import { useOfflineScreenSnapshot } from "./offline/use-offline-screen-snapshot";
import { toDateValue } from "./date-value";

type WorkFilter = "today" | "upcoming" | "overdue" | "completed";

function firstOpenTask(inspection: any) {
  return inspection.tasks.find((task: any) => task.report?.status !== "finalized") ?? inspection.tasks[0] ?? null;
}

function matchesQuery(inspection: any, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    inspection.site?.name,
    inspection.customerCompany?.name,
    inspection.primaryTitle,
    inspection.secondaryTitle,
    ...inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " "))
  ].filter(Boolean).join(" ").toLowerCase();

  return haystack.includes(query);
}

export function TechnicianWorkScreen({ initialData }: { initialData: any }) {
  const snapshot = useOfflineScreenSnapshot("technician-work", initialData);
  const searchParams = useSearchParams();

  const filter = (searchParams.get("filter") as WorkFilter | null) ?? "today";
  const query = (searchParams.get("query") ?? "").trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!snapshot) {
      return { assigned: [], claimable: [], completed: [] };
    }

    const dashboard = snapshot.dashboard;
    if (filter === "completed") {
      return {
        assigned: [],
        claimable: [],
        completed: dashboard.recentCompleted.filter((inspection: any) => matchesQuery(inspection, query))
      };
    }

    const todayKey = format(new Date(), "yyyy-MM-dd");
    const assignedSource =
      filter === "today"
        ? dashboard.today
        : filter === "upcoming"
          ? dashboard.assigned.filter((inspection: any) => !dashboard.today.some((todayInspection: any) => todayInspection.id === inspection.id))
          : dashboard.assigned.filter((inspection: any) => inspection.displayStatus === "past_due");

    const claimableSource =
      filter === "today"
        ? dashboard.unassigned.filter((inspection: any) => format(toDateValue(inspection.scheduledStart), "yyyy-MM-dd") === todayKey)
        : filter === "upcoming"
          ? dashboard.unassigned.filter((inspection: any) => format(toDateValue(inspection.scheduledStart), "yyyy-MM-dd") > todayKey)
          : dashboard.unassigned.filter((inspection: any) => inspection.displayStatus === "past_due");

    return {
      assigned: assignedSource.filter((inspection: any) => matchesQuery(inspection, query)),
      claimable: claimableSource.filter((inspection: any) => matchesQuery(inspection, query)),
      completed: []
    };
  }, [filter, query, snapshot]);

  if (!snapshot) {
    return <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading work queue…</div>;
  }

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
          {filtered.completed.length > 0 ? filtered.completed.map((inspection: any) => (
            <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
              <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
              {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
              <p className="mt-3 text-sm text-slate-600">
                Completed {format(toDateValue(inspection.scheduledStart), "MMM d, h:mm a")}
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
            {filtered.assigned.length > 0 ? filtered.assigned.map((inspection: any) => {
              const action = firstOpenTask(inspection);
              return (
                <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                      {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                    </div>
                    <span className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                      {format(toDateValue(inspection.scheduledStart), "MMM d")}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
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
            {filtered.claimable.length > 0 ? filtered.claimable.map((inspection: any) => (
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
                <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
                {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
                <p className="mt-3 text-sm text-slate-600">{inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
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
