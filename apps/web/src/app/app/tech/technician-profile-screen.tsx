/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { DeviceSyncStatusCard } from "./device-sync-status-card";
import { useOfflineScreenSnapshot } from "./offline/use-offline-screen-snapshot";

export function TechnicianProfileScreen({ initialData }: { initialData: any }) {
  const snapshot = useOfflineScreenSnapshot("technician-profile", initialData);

  if (!snapshot) {
    return <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading technician profile…</div>;
  }

  const { dashboard, manuals, user } = snapshot;
  const pendingCount = dashboard.assigned
    .flatMap((inspection: any) => inspection.tasks)
    .filter((task: any) => task.report?.status === "draft" || task.report?.status === "submitted").length;
  const savedManualCount = manuals.manuals.filter((manual: any) => manual.savedOfflineAt).length;
  const favoriteManualCount = manuals.manuals.filter((manual: any) => manual.isFavorite).length;
  const lastManualActivity = [...manuals.recent].sort((left: any, right: any) => {
    const leftTime = left.lastViewedAt ? new Date(left.lastViewedAt).getTime() : 0;
    const rightTime = right.lastViewedAt ? new Date(right.lastViewedAt).getTime() : 0;
    return rightTime - leftTime;
  })[0]?.lastViewedAt ?? null;

  return (
    <div className="space-y-5 pb-4">
      <section className="rounded-[1.85rem] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Technician profile</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">{user.name ?? "Technician"}</h2>
        <p className="mt-1 text-sm text-slate-500">Technician access</p>
        {user.email ? <p className="mt-3 text-sm text-slate-600">{user.email}</p> : null}
      </section>

      <DeviceSyncStatusCard pendingCount={pendingCount} savedManualCount={savedManualCount} />

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pending sync</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{pendingCount}</p>
          <p className="mt-2 text-sm text-slate-500">Drafts and local changes waiting to sync.</p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Saved manuals</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{savedManualCount}</p>
          <p className="mt-2 text-sm text-slate-500">Offline-ready manuals available in the field.</p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Favorites</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{favoriteManualCount}</p>
          <p className="mt-2 text-sm text-slate-500">Pinned references for fast lookup on site.</p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Last manual activity</p>
          <p className="mt-2 text-base font-semibold text-slate-950">
            {lastManualActivity ? `${formatDistanceToNow(new Date(lastManualActivity), { addSuffix: true })}` : "No recent manual opens"}
          </p>
          <p className="mt-2 text-sm text-slate-500">Recent field reference activity from local mobile data.</p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quick links</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Field essentials</h3>
        </div>
        <div className="grid gap-3">
          <Link className="flex min-h-12 items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href="/app/tech/work?filter=overdue">
            <span>Review pending sync work</span>
            <span className="text-slate-400">{pendingCount}</span>
          </Link>
          <Link className="flex min-h-12 items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href="/app/manuals">
            <span>Open manuals</span>
            <span className="text-slate-400">{savedManualCount}</span>
          </Link>
          <Link className="flex min-h-12 items-center justify-between rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.05)]" href="/app/tech/inspections">
            <span>Open inspection workflow</span>
            <span className="text-slate-400">{dashboard.assigned.length}</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
