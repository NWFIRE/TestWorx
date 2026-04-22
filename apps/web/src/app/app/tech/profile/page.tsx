import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { DeviceSyncStatusCard } from "../device-sync-status-card";
import { getManualLibraryData, getTechnicianDashboardData } from "@testworx/lib/server/index";

export default async function TechnicianProfilePage() {
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

  const pendingCount = dashboard.assigned
    .flatMap((inspection) => inspection.tasks)
    .filter((task) => task.report?.status === "draft" || task.report?.status === "submitted").length;
  const savedManualCount = manuals.manuals.filter((manual) => manual.savedOfflineAt).length;
  const favoriteManualCount = manuals.manuals.filter((manual) => manual.isFavorite).length;
  const lastManualActivity = [...manuals.recent]
    .sort((left, right) => {
      const leftTime = left.lastViewedAt ? new Date(left.lastViewedAt).getTime() : 0;
      const rightTime = right.lastViewedAt ? new Date(right.lastViewedAt).getTime() : 0;
      return rightTime - leftTime;
    })[0]?.lastViewedAt ?? null;

  const signOutAction = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <div className="space-y-5 pb-4">
      <section className="rounded-[1.85rem] border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Technician profile</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">{session.user.name ?? "Technician"}</h2>
        <p className="mt-1 text-sm text-slate-500">Technician access</p>
        {session.user.email ? <p className="mt-3 text-sm text-slate-600">{session.user.email}</p> : null}
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
          <p className="mt-2 text-sm text-slate-500">Recent field reference activity from this device session.</p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Readiness</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Before you head into the field</h3>
        </div>
        <div className="space-y-3">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <p className="text-base font-semibold text-slate-950">Assigned work downloaded</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {dashboard.assigned.length > 0
                ? `${dashboard.assigned.length} assigned visits are visible in your mobile queue.`
                : "No assigned visits are currently visible in your mobile queue."}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <p className="text-base font-semibold text-slate-950">Offline references ready</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {savedManualCount > 0
                ? `${savedManualCount} manuals are saved for offline lookup.`
                : "No manuals are saved offline yet. Save the references you need before heading into low-service areas."}
            </p>
          </div>
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

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <form action={signOutAction}>
          <button className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700" type="submit">
            Log out
          </button>
        </form>
      </section>
    </div>
  );
}
