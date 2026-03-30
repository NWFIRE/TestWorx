import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  formatInspectionStatusLabel,
  getAdminDashboardData,
  isDueAtTimeOfServiceCustomer,
  pickEarliestNextDueAt
} from "@testworx/lib";

import { createInspectionAction } from "./actions";
import { InspectionSchedulerForm } from "./inspection-scheduler-form";

type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;
type CompletedDashboardInspection = AdminDashboardData["completedInspections"][number];
type ActiveDashboardInspection = AdminDashboardData["activeInspections"][number];
type DashboardInspection = CompletedDashboardInspection | ActiveDashboardInspection;
type DashboardTask = DashboardInspection["tasks"][number];

const statusClasses: Record<string, string> = {
  to_be_completed: "bg-sky-50 text-sky-700",
  scheduled: "bg-emerald-50 text-emerald-700",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-slate-100 text-slate-700",
  cancelled: "bg-rose-50 text-rose-700",
  past_due: "bg-rose-50 text-rose-800"
};

const lifecycleClasses: Record<string, string> = {
  original: "bg-slate-100 text-slate-700",
  amended: "bg-amber-50 text-amber-800",
  replacement: "bg-blue-50 text-blue-800",
  superseded: "bg-rose-50 text-rose-800"
};

const billingStatusClasses: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700",
  reviewed: "bg-blue-50 text-blue-700",
  invoiced: "bg-emerald-50 text-emerald-700"
};

function inspectionStatusLabel(status: string) {
  return formatInspectionStatusLabel(status as "past_due" | "to_be_completed" | "scheduled" | "in_progress" | "completed" | "cancelled");
}

function taskDisplayLabel(task: { inspectionType: string; displayLabel?: string }) {
  return task.displayLabel ?? task.inspectionType.replaceAll("_", " ");
}

export default async function AdminPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const data = await getAdminDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
  const params = searchParams ? await searchParams : {};
  const inspectionNotice = Array.isArray(params.inspection) ? params.inspection[0] : params.inspection;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.95fr]">
      <section className="space-y-6">
        {inspectionNotice === "deleted" ? (
          <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800 shadow-panel">
            Inspection deleted successfully.
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          {[["Completed visits", data.summary.completedInspections], ["Shared queue", data.summary.unassignedInspections], ["Sites", data.summary.siteCount]].map(([label, value]) => (
            <div key={String(label)} className="rounded-3xl bg-white p-5 shadow-panel">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-panel">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Completed archive</p>
              <h3 className="mt-1 text-2xl font-semibold text-ink">Completed inspections</h3>
            </div>
          </div>
          <div className="space-y-3">
            {data.completedInspections.length === 0 ? (
              <p className="rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No completed inspections yet.</p>
            ) : data.completedInspections.map((inspection: DashboardInspection) => {
              const nextDue = pickEarliestNextDueAt(inspection.tasks.map((task: DashboardTask) => task.recurrence?.nextDueAt));
              return (
                <div key={inspection.id} className="rounded-[1.5rem] border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-ink">{(inspection as typeof inspection & { primaryTitle?: string }).primaryTitle ?? inspection.site.name}</p>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusClasses[(inspection as typeof inspection & { displayStatus?: string }).displayStatus ?? inspection.status]}`}>
                          {inspectionStatusLabel((inspection as typeof inspection & { displayStatus?: string }).displayStatus ?? inspection.status)}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${lifecycleClasses[(inspection as typeof inspection & { lifecycle?: string }).lifecycle ?? "original"]}`}>
                          {((inspection as typeof inspection & { lifecycle?: string }).lifecycle ?? "original").replaceAll("_", " ")}
                        </span>
                        {isDueAtTimeOfServiceCustomer(inspection.customerCompany) ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
                            Payment due on site
                          </span>
                        ) : null}
                        {(inspection as typeof inspection & { billingStatus?: string | null }).billingStatus ? (
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${billingStatusClasses[(inspection as typeof inspection & { billingStatus?: string | null }).billingStatus ?? "draft"] ?? "bg-slate-100 text-slate-700"}`}>
                            {((inspection as typeof inspection & { billingStatus?: string | null }).billingStatus ?? "").replaceAll("_", " ")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {((inspection as typeof inspection & { secondaryTitle?: string }).secondaryTitle ?? inspection.customerCompany.name)} | {format(inspection.scheduledStart, "MMM d, yyyy h:mm a")}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">Assigned: {((inspection as typeof inspection & { assignedTechnicianNames?: string[] }).assignedTechnicianNames ?? []).length ? ((inspection as typeof inspection & { assignedTechnicianNames?: string[] }).assignedTechnicianNames ?? []).join(", ") : "Shared queue"}</p>
                      {isDueAtTimeOfServiceCustomer(inspection.customerCompany) ? (
                        <p className="mt-1 text-sm font-semibold text-amber-800">Technicians must collect payment on site for this customer.</p>
                      ) : null}
                      <p className="mt-1 text-sm text-slate-500">Report types: {inspection.tasks.map((task: DashboardTask) => taskDisplayLabel(task as DashboardTask & { displayLabel?: string })).join(", ")}</p>
                      <p className="mt-1 text-sm text-slate-500">Next due: {nextDue ? format(new Date(nextDue), "MMM d, yyyy") : "One-time"}</p>
                    </div>
                    <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspection.id}`}>
                      View inspection
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-panel">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Scheduled queue</p>
              <h3 className="mt-1 text-2xl font-semibold text-ink">Active inspections</h3>
            </div>
            <p className="text-sm text-slate-500">{data.activeInspections.length} showing of {data.summary.upcomingInspections}</p>
          </div>
          <div className="space-y-3">
            {data.activeInspections.map((inspection: DashboardInspection) => {
              const nextDue = pickEarliestNextDueAt(inspection.tasks.map((task: DashboardTask) => task.recurrence?.nextDueAt));
              return (
                <div key={inspection.id} className="rounded-[1.5rem] border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-ink">{(inspection as typeof inspection & { primaryTitle?: string }).primaryTitle ?? inspection.site.name}</p>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusClasses[(inspection as typeof inspection & { displayStatus?: string }).displayStatus ?? inspection.status]}`}>
                          {inspectionStatusLabel((inspection as typeof inspection & { displayStatus?: string }).displayStatus ?? inspection.status)}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${lifecycleClasses[(inspection as typeof inspection & { lifecycle?: string }).lifecycle ?? "original"]}`}>
                          {((inspection as typeof inspection & { lifecycle?: string }).lifecycle ?? "original").replaceAll("_", " ")}
                        </span>
                        {isDueAtTimeOfServiceCustomer(inspection.customerCompany) ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
                            Payment due on site
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {((inspection as typeof inspection & { secondaryTitle?: string }).secondaryTitle ?? inspection.customerCompany.name)} | {format(inspection.scheduledStart, "MMM d, yyyy h:mm a")}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">Assigned: {((inspection as typeof inspection & { assignedTechnicianNames?: string[] }).assignedTechnicianNames ?? []).length ? ((inspection as typeof inspection & { assignedTechnicianNames?: string[] }).assignedTechnicianNames ?? []).join(", ") : "Shared queue"}</p>
                      {isDueAtTimeOfServiceCustomer(inspection.customerCompany) ? (
                        <p className="mt-1 text-sm font-semibold text-amber-800">Technicians must collect payment on site for this customer.</p>
                      ) : null}
                      <p className="mt-1 text-sm text-slate-500">Report types: {inspection.tasks.map((task: DashboardTask) => taskDisplayLabel(task as DashboardTask & { displayLabel?: string })).join(", ")}</p>
                      <p className="mt-1 text-sm text-slate-500">Next due: {nextDue ? format(new Date(nextDue), "MMM d, yyyy") : "One-time"}</p>
                    </div>
                    <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${inspection.id}`}>
                      Edit inspection
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <section className="space-y-6">
        <InspectionSchedulerForm action={createInspectionAction} title="Create inspection" submitLabel="Create inspection" customers={data.customers} sites={data.sites} technicians={data.technicians} allowDocumentUpload autoSelectGenericSiteOnCustomerChange allowCustomOneTimeSite />
      </section>
    </div>
  );
}
