/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, CircleCheck, Inbox } from "lucide-react";
import styles from "../home.module.css";
import { isCurrentHomeJob, technicianHomeSchedule } from "@testworx/lib/home-schedule";
import { formatInspectionStatusLabel } from "@testworx/lib/scheduling-shared";
import { useSyncSummary } from "./offline/use-sync-summary";
import { useOfflineScreenSnapshot } from "./offline/use-offline-screen-snapshot";
import { useTechnicianNotifications } from "./technician-notifications-client";
import { isTechnicianActionableSchedulingStatus } from "./mobile-inspection-workspace";

export function TechnicianHomeScreen({ initialData, userFirstName }: { initialData: any; userFirstName: string | null }) {
  const snapshot = useOfflineScreenSnapshot("technician-home", initialData);
  const sync = useSyncSummary();
  const notifications = useTechnicianNotifications();
  if (!snapshot) return <p className="p-5 text-sm text-slate-500">Loading Home...</p>;
  const timezone = snapshot.timezone ?? initialData.timezone ?? "America/Chicago";
  const assigned: any[] = Array.from(new Map((snapshot.dashboard.assigned ?? []).map((job: any) => [job.id, job])).values()).filter((job: any) => job.tasks.some((task: any) => task.report?.status !== "finalized" && isTechnicianActionableSchedulingStatus(task.schedulingStatus)));
  const today = technicianHomeSchedule(assigned, timezone);
  const unread = notifications.items.filter(item => !item.isRead);
  const claimable = new Set((snapshot.dashboard.unassigned ?? []).map((job: any) => job.id)).size;
  const saveCount = sync.failed + sync.conflict + sync.pending;
  const rowClass = `flex items-center rounded-xl text-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slateblue focus-visible:ring-offset-2 ${styles.row}`;
  const cardClass = styles.panel;
  return <div className={`${styles.home} pb-4`}>
    <header className={styles.welcome}><div><h1>Home</h1>{userFirstName ? <p>Welcome back, {userFirstName}.</p> : null}</div></header>
    <div className={styles.grid}>
      <section className={cardClass} data-home-panel="schedule">
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}><span className={styles.sectionIcon}><CalendarDays aria-hidden="true" size={20} /></span><h2>Today&apos;s Schedule</h2></div>
          <Link href="/app/tech/work?filter=today" className={styles.scheduleLink}>View schedule<ChevronRight aria-hidden="true" size={14} /></Link>
        </div>
        <div className={`${styles.scheduleBody} divide-y divide-slate-100`}>
          {today.length ? today.slice(0, 8).map((job: any, index) => {
            const task = job.tasks.find((item: any) => item.report?.status !== "finalized" && isTechnicianActionableSchedulingStatus(item.schedulingStatus));
            return <Link key={job.id} href={task ? `/app/tech/reports/${job.id}/${task.id}` : "/app/tech/work?filter=today"} className={rowClass}>
              <time dateTime={new Date(job.scheduledStart).toISOString()} className="w-20 shrink-0 self-start pt-0.5 text-xs tabular-nums text-slate-600">{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(job.scheduledStart))}</time>
              <div className="min-w-0 flex-1 break-words">
                {index === 0 ? <p className="mb-1 text-xs font-medium text-slateblue">{isCurrentHomeJob(job) ? "Current job" : "Next job"}</p> : null}
                <p className="font-semibold">{job.primaryTitle ?? job.customerCompany?.name ?? job.site?.name}</p>
                {job.secondaryTitle ? <p className="text-slate-500">{job.secondaryTitle}</p> : null}
                <p className="mt-1 text-xs text-slate-500">{job.assignedTechnicianNames?.join(", ") || "Assigned to you"}</p>
                <p className={styles.status}>{formatInspectionStatusLabel(job.displayStatus ?? job.status)}</p>
              </div>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
            </Link>;
          }) : <div className={styles.empty}><span className={styles.emptyIcon}><CalendarDays aria-hidden="true" size={30} /></span><p>No jobs scheduled today.</p></div>}
        </div>
        {today.length > 8 ? <p className="mt-3 text-xs text-slate-500">Showing 8 of {today.length} jobs.</p> : null}
      </section>
      <section className={cardClass} data-home-panel="attention">
        <div className={styles.panelHeader}><div className={styles.panelTitle}><span className={styles.sectionIcon}><Inbox aria-hidden="true" size={20} /></span><h2>Needs Attention</h2></div></div>
        <div className="mt-4 divide-y divide-slate-100">
          {assigned.length > 0 ? <Link href="/app/tech/work?filter=open" className={rowClass}><span className="flex-1">Assigned inspections</span><strong className="tabular-nums">{assigned.length}</strong><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" /></Link> : null}
          {claimable > 0 ? <Link href="/app/tech/work?filter=claimable" className={rowClass}><span className="flex-1">Ready to claim</span><strong className="tabular-nums">{claimable}</strong><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" /></Link> : null}
          {saveCount > 0 ? <Link href="/app/tech/profile" className={rowClass}><span className="flex-1">{sync.failed || sync.conflict ? "Saved changes need review" : "Changes waiting to sync"}</span><strong>{saveCount}</strong><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" /></Link> : null}
          {unread.slice(0, 5).map(item => <Link key={item.id} href={item.href} className={rowClass}><span className="min-w-0 flex-1"><span className="block font-medium">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.body}</span></span><ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" /></Link>)}
          {!assigned.length && !claimable && !saveCount && !unread.length ? <div className={styles.empty}><span className={styles.emptyIcon}><CircleCheck aria-hidden="true" size={30} /></span><p>You&apos;re all caught up</p></div> : null}
        </div>
      </section>
    </div>
  </div>;
}
