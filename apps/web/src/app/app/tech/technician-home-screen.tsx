/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { format } from "date-fns";

import { useSyncSummary } from "./offline/use-sync-summary";
import { useOfflineScreenSnapshot } from "./offline/use-offline-screen-snapshot";
import { useTechnicianNotifications } from "./technician-notifications-client";

function QueueStatusCard({
  title,
  count,
  href,
  helper
}: {
  title: string;
  count: number;
  href: string;
  helper: string;
}) {
  return (
    <Link
      className="rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition hover:border-[color:var(--tenant-primary-border)] hover:bg-[var(--tenant-primary-soft)]"
      href={href}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{count}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </Link>
  );
}

function NeedsAttentionCard({
  eyebrow,
  title,
  body,
  href,
  tone = "default"
}: {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  tone?: "default" | "priority" | "warning" | "danger";
}) {
  const toneClasses = {
    default: "border-slate-200 bg-white",
    priority: "border-amber-200 bg-amber-50/70",
    warning: "border-orange-200 bg-orange-50/70",
    danger: "border-rose-200 bg-rose-50/70"
  } as const;

  return (
    <Link className={`block rounded-[1.5rem] border p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] ${toneClasses[tone]}`} href={href}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
      <p className="mt-2 text-base font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </Link>
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
  const syncSummary = useSyncSummary();
  const notifications = useTechnicianNotifications();

  if (!snapshot) {
    return <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading field workspace...</div>;
  }

  const dashboard = snapshot.dashboard;
  const assignedOpen = dashboard.assigned.filter((inspection: any) =>
    inspection.tasks.some((task: any) => task.report?.status !== "finalized")
  );
  const inProgress = dashboard.assigned.filter((inspection: any) =>
    inspection.tasks.some((task: any) => task.report?.status === "draft" || task.report?.status === "submitted")
  );

  const attentionItems = [
    ...notifications.items
      .filter((item) => !item.isRead)
      .slice(0, 5)
      .map((item) => ({
        key: item.id,
        eyebrow:
          item.type === "priority_inspection_assigned"
            ? "Priority inspection assigned"
            : item.type === "inspection_reissued_for_correction"
              ? "Correction required"
              : item.type === "work_order_reassigned"
                ? "Work order reassigned"
                : item.type === "inspection_overdue"
                  ? "Overdue inspection"
                  : "Needs attention",
        title: item.title,
        body: item.body,
        href: item.href,
        tone:
          item.priority === "urgent"
            ? ("priority" as const)
            : item.type === "inspection_overdue"
              ? ("danger" as const)
              : item.type === "inspection_reissued_for_correction"
                ? ("warning" as const)
                : ("default" as const)
      })),
    (syncSummary.failed > 0 || syncSummary.conflict > 0 || syncSummary.pending > 0)
      ? {
          key: "sync-attention",
          eyebrow: "Sync attention",
          title: syncSummary.failed > 0 || syncSummary.conflict > 0 ? "Sync needs review" : "Changes still pending",
          body:
            syncSummary.failed > 0 || syncSummary.conflict > 0
              ? "Open Profile to review failed or conflicting sync activity."
              : `${syncSummary.pending} local change${syncSummary.pending === 1 ? "" : "s"} still need to sync.`,
          href: "/app/tech/profile",
          tone: syncSummary.failed > 0 || syncSummary.conflict > 0 ? "danger" as const : "default" as const
        }
      : null
  ].filter(Boolean);

  return (
    <div className="space-y-6 pb-4">
      <section
        className="rounded-[2rem] p-5 text-[var(--tenant-primary-contrast)] shadow-[0_24px_60px_rgb(var(--tenant-primary-rgb)/0.22)]"
        style={{
          background: "linear-gradient(180deg, rgb(var(--tenant-primary-rgb) / 0.96), rgb(var(--tenant-primary-rgb) / 0.82))"
        }}
      >
        <p className="text-sm text-white/70">{format(new Date(), "EEEE, MMMM d")}</p>
        <h2 className="mt-2 text-[28px] font-semibold leading-tight">
          {userFirstName ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${userFirstName}.` : "Ready for the field."}
        </h2>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Your field queue</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Current technician workload</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QueueStatusCard
            count={assignedOpen.length}
            helper="Assigned work that still needs action."
            href="/app/tech/work?filter=open"
            title="Assigned"
          />
          <QueueStatusCard
            count={dashboard.unassigned.length}
            helper="Shared queue work you can claim."
            href="/app/tech/work?filter=claimable"
            title="Ready to Claim"
          />
          <QueueStatusCard
            count={inProgress.length}
            helper="Inspections already started in the field."
            href="/app/tech/inspections?filter=active"
            title="In Progress"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Needs attention</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">What needs attention right now</h3>
        </div>
        <div className="space-y-3">
          {attentionItems.length > 0 ? attentionItems.map((item: any) => (
            <NeedsAttentionCard
              body={item.body}
              eyebrow={item.eyebrow}
              href={item.href}
              key={item.key}
              title={item.title}
              tone={item.tone}
            />
          )) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
              No technician action items need attention right now.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
