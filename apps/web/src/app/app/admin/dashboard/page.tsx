import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, endOfDay, startOfDay } from "date-fns";
import { ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import {
  activeOperationalInspectionStatuses, filterSubsetDuplicateOperationalInspections,
  getAdminBillingSummaries, getAdminDeficiencyDashboardData,
  getPendingFieldServiceRequestCount, getAdminSchedulingQueueData, isOpenBillingQueueStatus
} from "@testworx/lib/server/index";
import { getScheduler } from "@testworx/lib/scheduler";
import { fieldProgress } from "@testworx/lib/scheduler-shared";
import { AppPageShell, PageHeader, SectionCard } from "../operations-ui";
import { DashboardGlobalSearch } from "./dashboard-global-search";
import { AttentionLink } from "./attention-link";
import { filterAttentionQueue, isInAttentionWindow } from "../attention-queue";

export const metadata = { title: "Home | TradeWorx" };

export default async function AdminDashboardPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) redirect("/app");
  const actor = { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId };
  const through = endOfDay(addDays(startOfDay(new Date()), 60));
  const [queue, billing, deficiencies, requests, schedule, params] = await Promise.all([
    getAdminSchedulingQueueData(actor, { readOnly: true, statuses: [...activeOperationalInspectionStatuses],
      dueWindowEnd: through, limit: null, includeCounts: false, includeTechnicians: false }),
    getAdminBillingSummaries(actor), getAdminDeficiencyDashboardData(actor, { status: "open" }),
    getPendingFieldServiceRequestCount(actor), getScheduler(actor, { view: "day" }), searchParams
  ]);
  const inspections = filterSubsetDuplicateOperationalInspections(queue.inspections.filter(row => isInAttentionWindow(row, through)));
  const inspectionQueue = (attention: string) => `/app/admin/inspections?status=open&attention=${attention}&through=${encodeURIComponent(through.toISOString())}`;
  const attention = [
    { label: "Unassigned inspections", count: filterAttentionQueue(inspections, "unassigned").length, href: inspectionQueue("unassigned") },
    { label: "Ready to bill", count: billing.filter(row => isOpenBillingQueueStatus(row.status)).length, href: "/app/admin/billing?status=all" },
    { label: "Service requests", count: requests, href: "/app/admin/service-requests?status=pending" },
    { label: "Payment collection on site", count: filterAttentionQueue(inspections, "payment").length, href: inspectionQueue("payment") },
    { label: "Linked visit updates", count: filterAttentionQueue(inspections, "linked").length, href: inspectionQueue("linked") },
    { label: "High-priority deficiencies", count: deficiencies.deficiencies.filter(row => ["high", "critical"].includes(row.severity)).length, href: "/app/deficiencies?status=open&severity=high,critical" }
  ].filter(row => row.count > 0);
  const technicianNames = new Map(schedule.technicians.map(tech => [tech.id, tech.name]));
  const jobs = schedule.jobs.slice(0, 8);
  const rowClass = "flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slateblue focus-visible:ring-offset-2";

  return <AppPageShell density="wide">
    <PageHeader title="Home" contentWidth="full" actions={<DashboardGlobalSearch />} />
    {params?.inspection === "deleted" ? <p role="status" className="text-sm text-slate-600">Inspection deleted successfully.</p> : null}
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
      <SectionCard className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight">Needs Attention</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {attention.length ? attention.map(row => <AttentionLink key={row.href} href={row.href} className={rowClass}>
            <span className="min-w-0 flex-1 font-medium">{row.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{row.count}</span>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          </AttentionLink>) : <p className="py-5 text-sm text-slate-500">You&apos;re all caught up</p>}
        </div>
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slateblue">
          <Link href="/app/admin/inspections">Inspections</Link>
          <Link href="/app/admin/reports">Report review</Link>
          <Link href="/app/admin/amendments">Visit review</Link>
        </div>
      </SectionCard>
      <SectionCard className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Today&apos;s Schedule</h2>
          <Link href="/app/admin/scheduler" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-slateblue focus-visible:outline focus-visible:outline-2">View schedule</Link>
        </div>
        <div className="mt-3 divide-y divide-slate-100">
          {jobs.length ? jobs.map(job => <Link key={job.id} href={`/app/admin/inspections/${job.id}?from=${encodeURIComponent("/app/admin/dashboard")}`} className={rowClass}>
            <time dateTime={job.scheduledStart} className="w-20 shrink-0 self-start pt-0.5 text-xs tabular-nums text-slate-600">{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: schedule.timezone }).format(new Date(job.scheduledStart))}</time>
            <div className="min-w-0 flex-1 break-words">
              <p className="font-semibold">{job.customer}</p>
              {job.site && job.site !== job.customer ? <p className="text-slate-500">{job.site}</p> : null}
              <p className="mt-1 text-xs text-slate-500">{job.technicianIds.map(id => technicianNames.get(id) ?? "Team member").join(", ") || "Unassigned"}</p>
              <p className="mt-1 text-xs font-medium text-slate-600">{fieldProgress(job, new Date(schedule.fetchedAt).getTime())}</p>
            </div>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          </Link>) : <p className="py-5 text-sm text-slate-500">No jobs scheduled today.</p>}
        </div>
        {schedule.jobs.length > jobs.length ? <p className="mt-3 text-xs text-slate-500">Showing {jobs.length} of {schedule.jobs.length}{schedule.truncated ? "+" : ""} jobs. View schedule for the full day.</p> : null}
      </SectionCard>
    </div>
  </AppPageShell>;
}
