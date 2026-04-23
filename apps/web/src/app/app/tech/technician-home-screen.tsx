/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { format } from "date-fns";

import { useOfflineScreenSnapshot } from "./offline/use-offline-screen-snapshot";
import { toDateValue } from "./date-value";

function firstOpenTask(inspection: any) {
  return inspection.tasks.find((task: any) => task.report?.status !== "finalized") ?? inspection.tasks[0] ?? null;
}

function inspectionAction(inspection: any) {
  const task = firstOpenTask(inspection);
  if (!task) {
    return null;
  }

  return {
    href: `/app/tech/reports/${inspection.id}/${task.id}`,
    label: task.report?.status === "draft" || task.report?.status === "submitted" ? "Resume inspection" : "Start inspection"
  };
}

function WorkCard({ inspection, emphasizeToday = false }: { inspection: any; emphasizeToday?: boolean }) {
  const primaryAction = inspectionAction(inspection);

  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
          {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
        </div>
        <span className={emphasizeToday
          ? "inline-flex min-h-9 items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
          : "inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600"}
        >
          {format(toDateValue(inspection.scheduledStart), "h:mm a")}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex min-h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          {String(inspection.displayStatus).replaceAll("_", " ")}
        </span>
        {inspection.isPriority ? (
          <span className="inline-flex min-h-8 items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            Priority
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>{inspection.tasks.map((task: any) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
        <p>{inspection.assignedTechnicianNames.join(", ") || "Assigned technician"}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {primaryAction ? (
          <Link className="flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white" href={primaryAction.href}>
            {primaryAction.label}
          </Link>
        ) : (
          <div className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
            No inspection tasks
          </div>
        )}
        <Link className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" href="/app/tech/work">
          View job
        </Link>
      </div>
    </article>
  );
}

export function TechnicianHomeScreen({
  initialData,
  userFirstName
}: {
  initialData: any;
  userFirstName: string | null;
}) {
  const snapshot = useOfflineScreenSnapshot("technician-home", initialData);

  if (!snapshot) {
    return <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading field workspace…</div>;
  }

  const dashboard = snapshot.dashboard;
  const manuals = snapshot.manuals;
  const draftTaskCount = dashboard.assigned.flatMap((inspection: any) => inspection.tasks).filter((task: any) => task.report?.status === "draft" || task.report?.status === "submitted").length;
  const upcoming = dashboard.assigned.filter((inspection: any) => !dashboard.today.some((todayInspection: any) => todayInspection.id === inspection.id)).slice(0, 4);
  const savedManualCount = manuals.manuals.filter((manual: any) => manual.savedOfflineAt).length;
  const resumeInspection = dashboard.assigned.find((inspection: any) => inspection.tasks.some((task: any) => task.report?.status === "draft" || task.report?.status === "submitted"));
  const resumeAction = resumeInspection ? inspectionAction(resumeInspection) : null;

  return (
    <div className="space-y-6 pb-4">
      <section className="rounded-[2rem] bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92))] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
        <p className="text-sm text-white/70">{format(new Date(), "EEEE, MMMM d")}</p>
        <h2 className="mt-2 text-[28px] font-semibold leading-tight">
          {userFirstName ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${userFirstName}.` : "Ready for the field."}
        </h2>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Today</p>
            <p className="mt-2 text-2xl font-semibold">{dashboard.today.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Drafts</p>
            <p className="mt-2 text-2xl font-semibold">{draftTaskCount}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Manuals</p>
            <p className="mt-2 text-2xl font-semibold">{savedManualCount}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Today’s work</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">Handle what’s due now</h3>
          </div>
          <Link className="text-sm font-semibold text-[var(--tenant-primary)]" href="/app/tech/work">
            View all
          </Link>
        </div>
        <div className="space-y-3">
          {dashboard.today.length > 0 ? dashboard.today.slice(0, 3).map((inspection: any) => (
            <WorkCard emphasizeToday inspection={inspection} key={inspection.id} />
          )) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              No jobs are scheduled for today. Check upcoming work or claim from the shared queue.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Upcoming</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">What’s next after today</h3>
        </div>
        <div className="space-y-3">
          {upcoming.length > 0 ? upcoming.map((inspection: any) => (
            <WorkCard inspection={inspection} key={inspection.id} />
          )) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              No additional upcoming work is assigned yet.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quick actions</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Move faster in the field</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href={resumeAction?.href ?? "/app/tech/inspections"}>
            <p className="text-base font-semibold text-slate-950">{resumeAction ? "Continue inspection" : "Open inspections"}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {resumeAction ? "Jump back into current inspection work without searching through the queue." : "Open active inspections and keep field work moving."}
            </p>
          </Link>
          <Link className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href="/app/manuals">
            <p className="text-base font-semibold text-slate-950">Search manuals</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">Open favorites, recent manuals, and offline-saved references while you’re on site.</p>
          </Link>
          <Link className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href="/app/tech/work?filter=overdue">
            <p className="text-base font-semibold text-slate-950">Open overdue work</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">Focus on overdue assigned jobs that still need field attention.</p>
          </Link>
          <Link className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href="/app/tech/profile">
            <p className="text-base font-semibold text-slate-950">Open profile</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">Check sync details, offline status, saved manuals, and account info.</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
