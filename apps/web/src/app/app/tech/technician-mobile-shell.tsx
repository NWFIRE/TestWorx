"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useSyncSummary } from "./offline/use-sync-summary";
import { useTechnicianNotifications } from "./technician-notifications-client";

type MobileTab = {
  href: string;
  label: string;
  matchPrefixes?: string[];
};

const technicianTabs: MobileTab[] = [
  { href: "/app/tech", label: "Home" },
  { href: "/app/tech/work", label: "Work", matchPrefixes: ["/app/tech/work"] },
  { href: "/app/tech/inspections", label: "Inspections", matchPrefixes: ["/app/tech/inspections", "/app/tech/reports"] },
  { href: "/app/manuals", label: "Manuals", matchPrefixes: ["/app/manuals"] },
  { href: "/app/tech/profile", label: "Profile", matchPrefixes: ["/app/tech/profile"] }
];

const defaultTechnicianTab: MobileTab = {
  href: "/app/tech",
  label: "Home"
};

function isActive(pathname: string, tab: MobileTab) {
  if (pathname === tab.href) {
    return true;
  }

  return (tab.matchPrefixes ?? []).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function MobileTabIcon({ label, active }: { label: string; active: boolean }) {
  const shared = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.9
  };
  const className = active ? "h-5 w-5 text-[var(--tenant-primary)]" : "h-5 w-5 text-slate-500";

  switch (label) {
    case "Home":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <path {...shared} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "Work":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <rect {...shared} x="4" y="5" width="16" height="15" rx="3" />
          <path {...shared} d="M8 3v4M16 3v4M4 10h16M8 14h3M8 18h6" />
        </svg>
      );
    case "Inspections":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <rect {...shared} x="6" y="4" width="12" height="17" rx="2.5" />
          <path {...shared} d="M9 4.5h6a1.5 1.5 0 0 0-1.5-1.5h-3A1.5 1.5 0 0 0 9 4.5ZM9 10h6M9 14h6M9 18h4" />
        </svg>
      );
    case "Manuals":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <path {...shared} d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5v-16Z" />
          <path {...shared} d="M7.5 3A2.5 2.5 0 0 0 5 5.5V19m4-11h6m-6 4h6" />
        </svg>
      );
    case "Profile":
      return (
        <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
          <circle {...shared} cx="12" cy="8.5" r="3.5" />
          <path {...shared} d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    default:
      return null;
  }
}

export function TechnicianSyncPill() {
  const summary = useSyncSummary();

  return (
    <span
      className={summary.conflict > 0
        ? "inline-flex min-h-9 items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"
        : summary.failed > 0
          ? "inline-flex min-h-9 items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
          : summary.pending > 0 || summary.syncing > 0
            ? "inline-flex min-h-9 items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
            : summary.isOnline
              ? "inline-flex min-h-9 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
              : "inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"}
    >
      {summary.conflict > 0
        ? `${summary.conflict} conflict${summary.conflict === 1 ? "" : "s"}`
        : summary.failed > 0
          ? `${summary.failed} failed`
          : summary.syncing > 0
            ? "Syncing..."
            : summary.pending > 0
              ? `${summary.pending} pending`
              : summary.isOnline
                ? "Synced"
                : "Offline mode"}
    </span>
  );
}

export function TechnicianMobileHeader({
  pathname,
  userName
}: {
  pathname: string;
  userName: string | null;
}) {
  const activeTab = useMemo(
    () => technicianTabs.find((tab) => isActive(pathname, tab)) ?? technicianTabs[0] ?? defaultTechnicianTab,
    [pathname]
  );

  const subtitleByTab: Record<string, string> = {
    Home: "Assignments, progress, and action items",
    Work: "Assigned jobs and claimable field work",
    Inspections: "Drafts, active inspections, and closeout",
    Manuals: "Field manuals and offline-ready references",
    Profile: "Sync, readiness, and technician tools"
  };

  return (
    <div className="flex w-full items-start justify-between gap-3 lg:hidden">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {userName ? `${userName.split(" ")[0]}'s workspace` : "Technician workspace"}
        </p>
        <h1 className="mt-1 truncate text-xl font-semibold text-slate-950">{activeTab.label}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitleByTab[activeTab.label]}</p>
      </div>
      <TechnicianSyncPill />
    </div>
  );
}

export function TechnicianMobileTabBar({ pathname }: { pathname: string }) {
  const notifications = useTechnicianNotifications();

  return (
    <nav
      aria-label="Technician mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="pointer-events-none mx-auto w-full max-w-screen-sm px-2">
        <div className="pointer-events-auto rounded-t-[1.6rem] border border-b-0 border-slate-200 bg-white/96 px-2 pb-3 pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="grid grid-cols-5 gap-1">
            {technicianTabs.map((tab) => {
              const active = isActive(pathname, tab);
              const badgeCount = tab.label === "Work"
                ? notifications.counts.work
                : tab.label === "Inspections"
                  ? notifications.counts.inspections
                  : 0;
              return (
                <Link
                  key={tab.href}
                  className={active
                    ? "relative flex min-h-[64px] flex-col items-center justify-center rounded-2xl bg-[var(--tenant-primary-soft)] px-2 py-2 text-[11px] font-semibold text-[var(--tenant-primary)]"
                    : "relative flex min-h-[64px] flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-medium text-slate-500"}
                  href={tab.href}
                >
                  {badgeCount > 0 ? (
                    <span className="absolute right-3 top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold leading-none text-white">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  ) : null}
                  <MobileTabIcon active={active} label={tab.label} />
                  <span className="mt-1.5 text-center leading-4">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
