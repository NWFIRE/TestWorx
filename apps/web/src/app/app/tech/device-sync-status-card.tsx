"use client";

import { useEffect, useState } from "react";

import { useSyncSummary } from "./offline/use-sync-summary";

const LAST_ONLINE_KEY = "tradeworx.tech.last-online-at";

function formatLastSeen(value: string | null) {
  if (!value) {
    return "No recent sync recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No recent sync recorded";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function DeviceSyncStatusCard({
  pendingCount,
  savedManualCount
}: {
  pendingCount: number;
  savedManualCount: number;
}) {
  const summary = useSyncSummary();
  const [lastOnlineAt, setLastOnlineAt] = useState<string | null>(null);

  useEffect(() => {
    const syncStatus = () => {
      const stored = window.localStorage.getItem(LAST_ONLINE_KEY);
      setLastOnlineAt(stored);

      if (window.navigator.onLine) {
        const now = new Date().toISOString();
        window.localStorage.setItem(LAST_ONLINE_KEY, now);
        setLastOnlineAt(now);
      }
    };

    syncStatus();
    window.addEventListener("online", syncStatus);
    window.addEventListener("offline", syncStatus);

    return () => {
      window.removeEventListener("online", syncStatus);
      window.removeEventListener("offline", syncStatus);
    };
  }, []);

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sync status</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">
            {summary.conflict > 0
              ? "Sync needs review"
              : summary.failed > 0
                ? "Sync retry needed"
                : summary.pending > 0 || summary.syncing > 0
                  ? "Changes waiting to sync"
                  : summary.isOnline
                    ? "Connected and ready"
                    : "Working offline"}
          </h3>
        </div>
        <span
          className={summary.conflict > 0
            ? "inline-flex min-h-10 items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
            : summary.failed > 0
              ? "inline-flex min-h-10 items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
              : summary.pending > 0 || summary.syncing > 0
                ? "inline-flex min-h-10 items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                : summary.isOnline
                  ? "inline-flex min-h-10 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                  : "inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"}
        >
          {summary.conflict > 0
            ? "Conflict"
            : summary.failed > 0
              ? "Failed"
              : summary.pending > 0 || summary.syncing > 0
                ? summary.syncing > 0 ? "Syncing" : "Pending"
                : summary.isOnline
                  ? "Synced"
                  : "Offline"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Last online</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{formatLastSeen(lastOnlineAt)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Pending changes</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{summary.pending + summary.failed + summary.conflict || pendingCount} change{(summary.pending + summary.failed + summary.conflict || pendingCount) === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Last sync</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{formatLastSeen(summary.lastSyncAt)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Saved manuals</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{savedManualCount} offline-ready</p>
        </div>
      </div>
    </div>
  );
}
