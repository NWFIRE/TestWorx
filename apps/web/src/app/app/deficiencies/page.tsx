import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAdminDeficiencyDashboardData } from "@testworx/lib";

import { updateDeficiencyStatusAction } from "../admin/actions";

type DeficiencyListItem = {
  id: string;
  inspectionId: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  assetTag: string | null;
  deviceType: string | null;
  location: string | null;
  section: string;
  notes: string | null;
  photoStorageKey: string | null;
  siteName: string;
  inspection: { scheduledStart: Date };
};

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "quoted", label: "Quoted" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" }
] as const;

const severityOptions = [
  { value: "all", label: "All severities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" }
] as const;

export default async function DeficienciesPage({
  searchParams
}: {
  searchParams: Promise<{ siteId?: string; status?: string; severity?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = await searchParams;
  const data = await getAdminDeficiencyDashboardData(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    {
      siteId: params.siteId,
      status: params.status && params.status !== "all" ? params.status : undefined,
      severity: params.severity && params.severity !== "all" ? params.severity : undefined
    }
  );
  const deficiencies = data.deficiencies as unknown as DeficiencyListItem[];

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Deficiency center</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">Inspection failures ready for quote or repair follow-up</h2>
            <p className="mt-3 max-w-3xl text-slate-500">Review issues captured from inspection results, update workflow status, and jump back into the originating inspection when dispatch or estimating needs context.</p>
          </div>
          <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href="/app/admin">
            Open scheduling
          </Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Open", data.counts.open],
            ["Quoted", data.counts.quoted],
            ["Approved", data.counts.approved],
            ["Scheduled", data.counts.scheduled],
            ["Resolved", data.counts.resolved],
            ["Ignored", data.counts.ignored]
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Filters</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {statusOptions.map((option) => (
            <Link
              key={option.value}
              className={`inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-semibold ${data.filters.status === (option.value === "all" ? undefined : option.value) ? "bg-slateblue text-white" : "border border-slate-200 text-slate-600"}`}
              href={option.value === "all" ? "/app/deficiencies" : `/app/deficiencies?status=${option.value}${data.filters.severity ? `&severity=${data.filters.severity}` : ""}${data.filters.siteId ? `&siteId=${data.filters.siteId}` : ""}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {severityOptions.map((option) => (
            <Link
              key={option.value}
              className={`inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-semibold ${data.filters.severity === (option.value === "all" ? undefined : option.value) ? "bg-ink text-white" : "border border-slate-200 text-slate-600"}`}
              href={option.value === "all" ? `/app/deficiencies${data.filters.status ? `?status=${data.filters.status}` : ""}` : `/app/deficiencies?severity=${option.value}${data.filters.status ? `&status=${data.filters.status}` : ""}${data.filters.siteId ? `&siteId=${data.filters.siteId}` : ""}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Active list</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">Deficiency records</h3>
          </div>
          <p className="text-sm text-slate-500">{deficiencies.length} record{deficiencies.length === 1 ? "" : "s"}</p>
        </div>

        <div className="mt-5 space-y-4">
          {deficiencies.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No deficiencies matched these filters.</p>
          ) : (
            deficiencies.map((deficiency) => (
              <div key={deficiency.id} className="rounded-[1.5rem] border border-slate-200 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-ink">{deficiency.title}</p>
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">{deficiency.severity}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{deficiency.status}</span>
                    </div>
                    <p className="text-sm text-slate-500">{deficiency.siteName} | {format(deficiency.inspection.scheduledStart, "MMM d, yyyy h:mm a")}</p>
                    <p className="text-sm text-slate-700">{deficiency.description}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                        <p>Device: {deficiency.deviceType ?? "Not recorded"}</p>
                        <p className="mt-1">Location: {deficiency.location ?? "Not recorded"}</p>
                        <p className="mt-1">Section: {deficiency.section.replaceAll("-", " ")}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                        <p>Notes: {deficiency.notes ?? "No follow-up notes yet."}</p>
                        {deficiency.photoStorageKey ? (
                          <a className="mt-3 inline-flex font-semibold text-slateblue" href={`/api/deficiencies/${deficiency.id}/photo`}>
                            View photo evidence
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-64 flex-col gap-3">
                    <form action={updateDeficiencyStatusAction}>
                      <input name="deficiencyId" type="hidden" value={deficiency.id} />
                      <input name="status" type="hidden" value="quoted" />
                      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                        Generate quote
                      </button>
                    </form>
                    <form action={updateDeficiencyStatusAction}>
                      <input name="deficiencyId" type="hidden" value={deficiency.id} />
                      <input name="status" type="hidden" value="scheduled" />
                      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                        Create repair work order
                      </button>
                    </form>
                    <form action={updateDeficiencyStatusAction}>
                      <input name="deficiencyId" type="hidden" value={deficiency.id} />
                      <input name="status" type="hidden" value="resolved" />
                      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-emerald-700" type="submit">
                        Mark resolved
                      </button>
                    </form>
                    <form action={updateDeficiencyStatusAction}>
                      <input name="deficiencyId" type="hidden" value={deficiency.id} />
                      <input name="status" type="hidden" value="ignored" />
                      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600" type="submit">
                        Ignore
                      </button>
                    </form>
                    <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white" href={`/app/admin/inspections/${deficiency.inspectionId}`}>
                      View inspection
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
