import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { addDays, endOfDay, startOfDay } from "date-fns";
import { CalendarDays, ChevronRight, CircleCheck, Inbox, Users, FileText, CreditCard, GitBranch, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import {
  activeOperationalInspectionStatuses, filterSubsetDuplicateOperationalInspections,
  getAdminBillingSummaries, getAdminDeficiencyDashboardData,
  getPendingFieldServiceRequestCount, getAdminSchedulingQueueData, isOpenBillingQueueStatus
} from "@testworx/lib/server/index";
import { getScheduler } from "@testworx/lib/scheduler";
import { fieldProgress } from "@testworx/lib/scheduler-shared";
import { AppPageShell, SectionCard } from "../operations-ui";
import styles from "../../home.module.css";
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
  const schedule = getScheduler(actor, { view: "day" });
  const params = await searchParams;
  return <AppPageShell density="wide" className={styles.home}>
    <header className={styles.welcome}>
      <div><h1>Home</h1><p>Welcome back{session.user.name ? `, ${session.user.name.trim().split(/\s+/)[0]}` : ""}.</p></div>
      <div className={styles.welcomeTools}>
        <Suspense fallback={<div className={styles.date} aria-hidden="true">&nbsp;</div>}><HomeDate schedule={schedule} /></Suspense>
        <DashboardGlobalSearch />
      </div>
    </header>
    {params?.inspection === "deleted" ? <p role="status" className="text-sm text-slate-600">Inspection deleted successfully.</p> : null}
    <div className={styles.grid}>
      <Suspense fallback={<PanelLoading title="Needs Attention" />}><AttentionPanel actor={actor} through={through} /></Suspense>
      <Suspense fallback={<PanelLoading title="Today's Schedule" />}><SchedulePanel schedulePromise={schedule} /></Suspense>
    </div>
  </AppPageShell>;
}

const rowClass = `flex items-center rounded-xl text-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slateblue focus-visible:ring-offset-2 ${styles.row}`;
type SchedulePromise = ReturnType<typeof getScheduler>;

function PanelLoading({ title }: { title: string }) {
  return <SectionCard className={styles.panel}><h2 className="text-xl font-semibold">{title}</h2><p role="status" className="mt-4 text-sm text-slate-500">Loading...</p></SectionCard>;
}

async function HomeDate({ schedule: promise }: { schedule: SchedulePromise }) {
  const schedule = await promise;
  return <div className={styles.date}><CalendarDays aria-hidden="true" size={16} />{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: schedule.timezone }).format(new Date(schedule.fetchedAt))}</div>;
}

async function AttentionPanel({ actor, through }: { actor: Parameters<typeof getAdminSchedulingQueueData>[0]; through: Date }) {
  const [queue, billing, deficiencies, requests] = await Promise.all([
    getAdminSchedulingQueueData(actor, { readOnly: true, statuses: [...activeOperationalInspectionStatuses],
      dueWindowEnd: through, limit: null, includeCounts: false, includeTechnicians: false }),
    getAdminBillingSummaries(actor), getAdminDeficiencyDashboardData(actor, { status: "open" }),
    getPendingFieldServiceRequestCount(actor)
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
  const attentionIcons = { "Unassigned inspections": Users, "Ready to bill": FileText, "Service requests": Inbox, "Payment collection on site": CreditCard, "Linked visit updates": GitBranch, "High-priority deficiencies": ShieldCheck };
  return <SectionCard className={styles.panel} homePanel="attention">
        <div className={styles.panelHeader}><div className={styles.panelTitle}><span className={styles.sectionIcon}><Inbox aria-hidden="true" size={20} /></span><h2>Needs Attention</h2></div></div>
        <div className="my-3 divide-y divide-slate-100">
          {attention.length ? attention.map(row => { const Icon = attentionIcons[row.label as keyof typeof attentionIcons]; return <AttentionLink key={row.href} href={row.href} className={rowClass}>
            <span className={styles.rowIcon}><Icon aria-hidden="true" size={18} /></span>
            <span className="min-w-0 flex-1 font-medium">{row.label}</span>
            <span className={styles.count}>{row.count}</span>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          </AttentionLink>; }) : <div className={styles.empty}><span className={styles.emptyIcon}><CircleCheck aria-hidden="true" size={30} /></span><p>You&apos;re all caught up</p></div>}
        </div>
        <div className={styles.footer}>
          <Link prefetch={false} href="/app/admin/inspections">Inspections</Link>
          <Link prefetch={false} href="/app/admin/reports">Report review</Link>
          <Link prefetch={false} href="/app/admin/amendments">Visit review</Link>
        </div>
      </SectionCard>;
}

async function SchedulePanel({ schedulePromise }: { schedulePromise: SchedulePromise }) {
  const schedule = await schedulePromise;
  const technicianNames = new Map(schedule.technicians.map(tech => [tech.id, tech.name]));
  const jobs = schedule.jobs.slice(0, 8);
  return <SectionCard className={styles.panel} homePanel="schedule">
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}><span className={styles.sectionIcon}><CalendarDays aria-hidden="true" size={20} /></span><h2>Today&apos;s Schedule</h2></div>
          <Link prefetch={false} href="/app/admin/scheduler" target="_blank" rel="opener" className={styles.scheduleLink}>View schedule<ChevronRight aria-hidden="true" size={14} /></Link>
        </div>
        <div className={`${styles.scheduleBody} divide-y divide-slate-100`}>
          {jobs.length ? jobs.map(job => <Link prefetch={false} key={job.id} href={`/app/admin/inspections/${job.id}?from=${encodeURIComponent("/app/admin/dashboard")}`} className={rowClass}>
            <time dateTime={job.scheduledStart} className="w-20 shrink-0 self-start pt-0.5 text-xs tabular-nums text-slate-600">{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: schedule.timezone }).format(new Date(job.scheduledStart))}</time>
            <div className="min-w-0 flex-1 break-words">
              <p className="font-semibold">{job.customer}</p>
              {job.site && job.site !== job.customer ? <p className="text-slate-500">{job.site}</p> : null}
              <p className="mt-1 text-xs text-slate-500">{job.technicianIds.map(id => technicianNames.get(id) ?? "Team member").join(", ") || "Unassigned"}</p>
              <p className={styles.status}>{fieldProgress(job, new Date(schedule.fetchedAt).getTime())}</p>
            </div>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
          </Link>) : <div className={styles.empty}><span className={styles.emptyIcon}><CalendarDays aria-hidden="true" size={30} /></span><p>No jobs scheduled today.</p></div>}
        </div>
        {schedule.jobs.length > jobs.length ? <p className="mt-3 text-xs text-slate-500">Showing {jobs.length} of {schedule.jobs.length}{schedule.truncated ? "+" : ""} jobs. View schedule for the full day.</p> : null}
      </SectionCard>;
}
