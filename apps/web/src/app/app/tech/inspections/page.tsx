import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { formatInspectionTaskSummary, getTechnicianDashboardData } from "@testworx/lib/server/index";

type TechnicianDashboardData = Awaited<ReturnType<typeof getTechnicianDashboardData>>;
type AssignedInspection = TechnicianDashboardData["assigned"][number];

function activeTasks(inspection: AssignedInspection) {
  return inspection.tasks.filter((task) => task.report?.status !== "finalized");
}

function readyToFinalize(inspection: AssignedInspection) {
  return inspection.tasks.length > 0 && inspection.tasks.every((task) => task.report?.status === "finalized");
}

function openTaskLink(inspection: AssignedInspection) {
  const task = activeTasks(inspection)[0] ?? inspection.tasks[0] ?? null;
  return task ? `/app/tech/reports/${inspection.id}/${task.id}` : "/app/tech";
}

export default async function TechnicianInspectionsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "technician") {
    redirect("/app");
  }

  const dashboard = await getTechnicianDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
  const active = dashboard.assigned.filter((inspection) => activeTasks(inspection).length > 0);
  const drafts = dashboard.assigned.filter((inspection) => inspection.tasks.some((task) => task.report?.status === "draft" || task.report?.status === "submitted"));
  const finalizeReady = dashboard.assigned.filter(readyToFinalize);

  return (
    <div className="space-y-5 pb-4">
      <section className="rounded-[1.85rem] bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92))] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Inspection workflow</p>
        <h2 className="mt-2 text-[28px] font-semibold leading-tight">Keep field progress moving, even when service drops.</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
          Draft checklist state, notes, signatures, and final review stay organized around the actual inspection flow so technicians can work fast without hunting through office tools.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Active</p>
            <p className="mt-2 text-2xl font-semibold">{active.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Drafts</p>
            <p className="mt-2 text-2xl font-semibold">{drafts.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Ready</p>
            <p className="mt-2 text-2xl font-semibold">{finalizeReady.length}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Active</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">In field right now</h3>
        </div>
          {active.length > 0 ? active.map((inspection) => (
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
            <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
            {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
            <p className="mt-3 text-sm text-slate-600">{formatInspectionTaskSummary(inspection.tasks)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex min-h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {inspection.displayStatus.replaceAll("_", " ")}
              </span>
              <span className="inline-flex min-h-8 items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Saves locally first
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link className="flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white" href={openTaskLink(inspection)}>
                {inspection.tasks.some((task) => task.report?.status === "draft" || task.report?.status === "submitted") ? "Resume draft" : "Start inspection"}
              </Link>
              <div className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {format(inspection.scheduledStart, "MMM d, h:mm a")}
              </div>
            </div>
          </article>
        )) : (
          <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            No active inspections are in progress right now.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Drafts</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Saved and ready to resume</h3>
        </div>
        {drafts.length > 0 ? drafts.map((inspection) => (
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
            <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
            {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
            <p className="mt-3 text-sm text-slate-600">Draft answers are saved. Reopen the inspection to continue checklist, notes, photos, and signatures.</p>
            <div className="mt-3 inline-flex min-h-8 items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              Saved offline
            </div>
            <div className="mt-4">
              <Link className="flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white" href={openTaskLink(inspection)}>
                Resume inspection
              </Link>
            </div>
          </article>
        )) : (
          <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            Draft inspections will appear here once field work has started.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ready to finalize</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Inspection packets that are nearly done</h3>
        </div>
        {finalizeReady.length > 0 ? finalizeReady.map((inspection) => (
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
            <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
            {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
            <p className="mt-3 text-sm text-slate-600">Checklist work is complete. Review signatures and remaining packet items before closeout.</p>
            <div className="mt-3 inline-flex min-h-8 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Ready to finalize
            </div>
            <div className="mt-4">
              <Link className="flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" href={openTaskLink(inspection)}>
                Review inspection
              </Link>
            </div>
          </article>
        )) : (
          <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            Finalize-ready inspections will show up here once all tasks are completed.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recently completed</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Last two weeks</h3>
        </div>
        {dashboard.recentCompleted.length > 0 ? dashboard.recentCompleted.map((inspection) => (
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
            <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
            {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
            <p className="mt-3 text-sm text-slate-600">
              Completed {format(inspection.scheduledStart, "MMM d, h:mm a")} • {formatInspectionTaskSummary(inspection.tasks)}
            </p>
          </article>
        )) : (
          <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            Completed inspections will appear here after you finish and sync them.
          </div>
        )}
      </section>
    </div>
  );
}
