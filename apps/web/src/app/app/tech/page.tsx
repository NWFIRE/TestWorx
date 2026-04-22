import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DeviceSyncStatusCard } from "./device-sync-status-card";
import {
  formatInspectionTaskSummary,
  getManualLibraryData,
  getTechnicianDashboardData,
  isDueAtTimeOfServiceCustomer
} from "@testworx/lib/server/index";

type TechnicianDashboardData = Awaited<ReturnType<typeof getTechnicianDashboardData>>;
type InspectionRecord = TechnicianDashboardData["assigned"][number];

function firstOpenTask(inspection: InspectionRecord) {
  return inspection.tasks.find((task) => task.report?.status !== "finalized") ?? inspection.tasks[0] ?? null;
}

function inspectionAction(inspection: InspectionRecord) {
  const task = firstOpenTask(inspection);
  if (!task) {
    return null;
  }

  const label = task.report?.status === "draft" || task.report?.status === "submitted"
    ? "Resume inspection"
    : "Start inspection";

  return {
    href: `/app/tech/reports/${inspection.id}/${task.id}`,
    label
  };
}

function WorkCard({
  inspection,
  emphasizeToday = false
}: {
  inspection: InspectionRecord;
  emphasizeToday?: boolean;
}) {
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
          {format(inspection.scheduledStart, "h:mm a")}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex min-h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          {inspection.displayStatus.replaceAll("_", " ")}
        </span>
        {inspection.isPriority ? (
          <span className="inline-flex min-h-8 items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            Priority
          </span>
        ) : null}
        {isDueAtTimeOfServiceCustomer(inspection.customerCompany) ? (
          <span className="inline-flex min-h-8 items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            Payment due on site
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>{formatInspectionTaskSummary(inspection.tasks)}</p>
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

export default async function TechnicianHomePage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "technician") {
    redirect("/app");
  }

  const [dashboard, manuals] = await Promise.all([
    getTechnicianDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    getManualLibraryData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId })
  ]);

  const draftTaskCount = dashboard.assigned.flatMap((inspection) => inspection.tasks).filter((task) => task.report?.status === "draft" || task.report?.status === "submitted").length;
  const upcoming = dashboard.assigned.filter((inspection) => !dashboard.today.some((todayInspection) => todayInspection.id === inspection.id)).slice(0, 4);
  const savedManualCount = manuals.manuals.filter((manual) => manual.savedOfflineAt).length;
  const resumeInspection = dashboard.assigned.find((inspection) => inspection.tasks.some((task) => task.report?.status === "draft" || task.report?.status === "submitted"));
  const resumeAction = resumeInspection ? inspectionAction(resumeInspection) : null;

  return (
    <div className="space-y-6 pb-4">
      <section className="rounded-[2rem] bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92))] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
        <p className="text-sm text-white/70">{format(new Date(), "EEEE, MMMM d")}</p>
        <h2 className="mt-2 text-[28px] font-semibold leading-tight">
          {session.user.name ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${session.user.name.split(" ")[0]}.` : "Ready for the field."}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/72">
          Start with today’s assigned work, resume unfinished inspections quickly, and keep manuals ready when you lose service.
        </p>
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

      <DeviceSyncStatusCard pendingCount={draftTaskCount} savedManualCount={savedManualCount} />

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
          {dashboard.today.length > 0 ? dashboard.today.slice(0, 3).map((inspection) => (
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quick actions</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Move faster in the field</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href={resumeAction?.href ?? "/app/tech/inspections"}>
            <p className="text-base font-semibold text-slate-950">{resumeAction ? "Resume draft inspection" : "Open inspections"}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {resumeAction ? "Jump back into the next in-progress report without hunting through the queue." : "See active work, drafts, and closeout-ready inspections."}
            </p>
          </Link>
          <Link className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href="/app/manuals">
            <p className="text-base font-semibold text-slate-950">Search manuals</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">Open favorites, recent manuals, and offline-saved references while you’re on site.</p>
          </Link>
          <Link className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href="/app/tech/work?filter=overdue">
            <p className="text-base font-semibold text-slate-950">View pending work</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">Focus on overdue or unfinished jobs without paging through every assigned visit.</p>
          </Link>
          <Link className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href="/app/tech/profile">
            <p className="text-base font-semibold text-slate-950">Check sync status</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">Review connection state, draft count, and offline-readiness before heading out.</p>
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Upcoming</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">What’s next after today</h3>
        </div>
        <div className="space-y-3">
          {upcoming.length > 0 ? upcoming.map((inspection) => (
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Recent activity</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Recently completed</h3>
        </div>
        <div className="space-y-3">
          {dashboard.recentCompleted.length > 0 ? dashboard.recentCompleted.slice(0, 3).map((inspection) => (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" key={inspection.id}>
              <p className="text-base font-semibold text-slate-950">{inspection.primaryTitle}</p>
              {inspection.secondaryTitle ? <p className="mt-1 text-sm text-slate-500">{inspection.secondaryTitle}</p> : null}
              <p className="mt-3 text-sm text-slate-600">
                Completed {format(inspection.scheduledStart, "MMM d")} • {formatInspectionTaskSummary(inspection.tasks)}
              </p>
            </div>
          )) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              Completed inspections from the last two weeks will appear here.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
