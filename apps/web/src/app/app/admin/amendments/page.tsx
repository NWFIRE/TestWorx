import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getAdminAmendmentManagementData } from "@testworx/lib";

const lifecycleOptions = [
  { value: "all", label: "All lifecycle states" },
  { value: "original", label: "Original" },
  { value: "amended", label: "Amended" },
  { value: "replacement", label: "Replacement" },
  { value: "superseded", label: "Superseded" }
] as const;

const lifecycleClasses: Record<string, string> = {
  original: "bg-slate-100 text-slate-700",
  amended: "bg-amber-50 text-amber-800",
  replacement: "bg-blue-50 text-blue-800",
  superseded: "bg-rose-50 text-rose-800"
};

function formatLifecycle(value: string) {
  return value.replaceAll("_", " ");
}

function formatAuditAction(value: string) {
  return value.replaceAll(".", " ").replaceAll("_", " ");
}

function getRelationshipSummary(item: Awaited<ReturnType<typeof getAdminAmendmentManagementData>>["items"][number]) {
  if (item.originalAmendment) {
    return {
      label: "Replacement for",
      inspectionId: item.originalAmendment.inspection.id,
      href: `/app/admin/inspections/${item.originalAmendment.inspection.id}`,
      siteName: item.originalAmendment.inspection.site.name,
      scheduledStart: item.originalAmendment.inspection.scheduledStart
    };
  }

  if (item.outgoingAmendment) {
    return {
      label: "Superseded by",
      inspectionId: item.outgoingAmendment.replacementInspection.id,
      href: `/app/admin/inspections/${item.outgoingAmendment.replacementInspection.id}`,
      siteName: item.outgoingAmendment.replacementInspection.site.name,
      scheduledStart: item.outgoingAmendment.replacementInspection.scheduledStart
    };
  }

  return null;
}

export default async function AdminAmendmentsPage({
  searchParams
}: {
  searchParams: Promise<{ lifecycle?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = await searchParams;
  const lifecycle = lifecycleOptions.some((option) => option.value === params.lifecycle) ? params.lifecycle : "all";
  const data = await getAdminAmendmentManagementData(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    { lifecycle: lifecycle as "all" | "original" | "amended" | "replacement" | "superseded" }
  );

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Amendment center</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">Replacement and superseded visit management</h2>
            <p className="mt-3 max-w-3xl text-slate-500">Track original visits, started-work amendments, and replacement scheduling from one view so dispatch can follow the full chain without rewriting history.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(["original", "amended", "replacement", "superseded"] as const).map((key) => (
            <div key={key} className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm text-slate-500">{formatLifecycle(key)}</p>
              <p className="mt-2 text-3xl font-semibold text-ink">{data.lifecycleCounts[key]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Lifecycle filters</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {lifecycleOptions.map((option) => {
            const isActive = data.lifecycleFilter === option.value;
            return (
              <Link
                key={option.value}
                className={`inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-semibold ${isActive ? "bg-slateblue text-white" : "border border-slate-200 text-slate-600"}`}
                href={option.value === "all" ? "/app/admin/amendments" : `/app/admin/amendments?lifecycle=${option.value}`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Inspection relationships</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">Recent amendment activity</h3>
          </div>
          <p className="text-sm text-slate-500">{data.items.length} inspection record{data.items.length === 1 ? "" : "s"}</p>
        </div>

        <div className="mt-5 space-y-4">
          {data.items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No inspections matched this lifecycle filter.</p>
          ) : (
            data.items.map((inspection) => {
              const relationship = getRelationshipSummary(inspection);
              const amendmentReason = inspection.originalAmendment?.reason ?? inspection.outgoingAmendment?.reason ?? null;

              return (
                <div key={inspection.id} className="rounded-[1.5rem] border border-slate-200 p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-ink">{inspection.site.name}</p>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${lifecycleClasses[inspection.lifecycle]}`}>
                          {formatLifecycle(inspection.lifecycle)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">{inspection.customerCompany.name} | {format(inspection.scheduledStart, "MMM d, yyyy h:mm a")}</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Visit status</p>
                          <p className="mt-2 text-sm text-slate-700">{(inspection.displayStatus ?? inspection.status).replaceAll("_", " ")}</p>
                          <p className="mt-1 text-sm text-slate-500">Assigned: {(inspection.assignedTechnicianNames ?? []).length ? inspection.assignedTechnicianNames.join(", ") : "Shared queue"}</p>
                          <p className="mt-1 text-sm text-slate-500">Report activity markers: {inspection.reportActivityCount}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relationship</p>
                          {relationship ? (
                            <>
                              <p className="mt-2 text-sm text-slate-700">{relationship.label}: {relationship.siteName}</p>
                              <p className="mt-1 text-sm text-slate-500">{format(relationship.scheduledStart, "MMM d, yyyy h:mm a")}</p>
                              <p className="mt-1 text-xs text-slate-400">Inspection id: {relationship.inspectionId}</p>
                            </>
                          ) : (
                            <p className="mt-2 text-sm text-slate-700">No linked replacement or superseding visit yet.</p>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Amendment reason</p>
                          <p className="mt-2 text-sm text-slate-700">{amendmentReason ?? "No amendment reason recorded on this inspection."}</p>
                          {(inspection.originalAmendment?.createdAt ?? inspection.outgoingAmendment?.createdAt) ? (
                            <p className="mt-2 text-xs text-slate-400">
                              Logged {format(inspection.originalAmendment?.createdAt ?? inspection.outgoingAmendment?.createdAt ?? inspection.createdAt, "MMM d, yyyy h:mm a")}
                            </p>
                          ) : null}
                        </div>
                        <div className="rounded-2xl border border-slate-200 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Latest audit note</p>
                          {inspection.latestAuditEntry ? (
                            <>
                              <p className="mt-2 text-sm text-slate-700">{formatAuditAction(inspection.latestAuditEntry.action)}</p>
                              <p className="mt-1 text-xs text-slate-400">{format(inspection.latestAuditEntry.createdAt, "MMM d, yyyy h:mm a")}</p>
                            </>
                          ) : (
                            <p className="mt-2 text-sm text-slate-700">No amendment-related audit entries yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex min-w-56 flex-col gap-3">
                      <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white" href={`/app/admin/inspections/${inspection.id}`}>
                        Open inspection
                      </Link>
                      {relationship ? (
                        <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={relationship.href}>
                          Open linked inspection
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
