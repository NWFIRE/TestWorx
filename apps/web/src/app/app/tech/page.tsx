import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  formatInspectionClassificationLabel,
  formatInspectionStatusLabel,
  getInspectionClassificationTone,
  getInspectionStatusTone,
  getTechnicianDashboardData,
  isDueAtTimeOfServiceCustomer,
  pickEarliestNextDueAt
} from "@testworx/lib";

import { AddReportTypeControl } from "./add-report-type-control";
import { ClaimButton } from "./claim-button";
import { CompleteInspectionCard } from "./complete-inspection-card";
import { RemoveReportTypeButton } from "./remove-report-type-button";
import { StatusButton } from "./status-button";
import { PriorityBadge, StatusBadge } from "../admin/operations-ui";

type TechnicianDashboardData = Awaited<ReturnType<typeof getTechnicianDashboardData>>;
type AssignedInspection = TechnicianDashboardData["assigned"][number];
type UnassignedInspection = TechnicianDashboardData["unassigned"][number];
type DashboardTask = AssignedInspection["tasks"][number];
type DashboardDocument = NonNullable<
  (AssignedInspection & {
    documents?: Array<{
      id: string;
      label: string | null;
      fileName: string;
      requiresSignature: boolean;
      status: string;
      annotatedStorageKey: string | null;
      signedStorageKey: string | null;
    }>;
  })["documents"]
>[number];

const reportStatusClasses: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  submitted: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  finalized: "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
};

function inspectionStatusLabel(status: string) {
  return formatInspectionStatusLabel(
    status as
      | "past_due"
      | "to_be_completed"
      | "scheduled"
      | "in_progress"
      | "completed"
      | "invoiced"
      | "cancelled"
      | "follow_up_required"
  );
}

function nextDueLabel(nextDueAt: Date | null | undefined, scheduledStart: Date) {
  return nextDueAt ? format(nextDueAt, "MMM d, yyyy") : format(scheduledStart, "MMM d, yyyy");
}

function serviceLineDueLabel(task: { dueDate?: Date | null; dueMonth?: string | null }, scheduledStart: Date) {
  if (task.dueDate) {
    return format(task.dueDate, "MMM d, yyyy");
  }
  if (task.dueMonth) {
    return task.dueMonth;
  }
  return format(scheduledStart, "MMM d, yyyy");
}

function taskActionLabel(task: { inspectionType: string; displayLabel?: string; report?: { status: string } | null }) {
  const label = task.displayLabel ?? task.inspectionType.replaceAll("_", " ");
  if (task.report?.status === "finalized") {
    return `View ${label}`;
  }

  return `Open ${label}`;
}

function correctionStateLabel(state: string | null | undefined) {
  return state ? state.replaceAll("_", " ") : "";
}

function PaymentCollectionBadge({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
      Payment due on site
    </span>
  );
}

function DispatchNotes({ notes }: { notes: string | null | undefined }) {
  const trimmedNotes = notes?.trim();
  if (!trimmedNotes) {
    return null;
  }

  return (
    <div className="mt-3 rounded-[1.25rem] border border-amber-200 bg-amber-50/80 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-900">Dispatch notes</p>
      <p className="mt-1 text-sm leading-6 text-amber-950 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] overflow-hidden">
        {trimmedNotes}
      </p>
    </div>
  );
}

export default async function TechnicianPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "technician") {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const reportNotice = Array.isArray(params.report)
    ? params.report[0]
    : params.report;
  const data = await getTechnicianDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });

  return (
    <section className="space-y-5 pb-8">
      <div className="rounded-[2rem] bg-ink p-6 text-white shadow-panel">
        <p className="text-sm uppercase tracking-[0.25em] text-white/60">Technician workspace</p>
        <h2 className="mt-2 text-3xl font-semibold">Field schedule</h2>
        <p className="mt-3 max-w-2xl text-white/75">Claim open work, move visits through the day, and finish reports without losing sight of due dates.</p>
      </div>

      {reportNotice === "finalized" ? (
        <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800 shadow-panel">
          Report finalized successfully. The completed report is now saved and no longer editable from the technician app.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Assigned", data.assigned.length], ["Today", data.today.length], ["This week", data.thisWeek.length], ["Shared queue", data.unassigned.length]].map(([label, value]) => (
          <div key={String(label)} className="rounded-[1.75rem] bg-white p-5 shadow-panel">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[2rem] bg-white p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Month view</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">Assigned this month</h3>
          </div>
          <p className="text-sm text-slate-500">{data.thisMonth.length} scheduled visit{data.thisMonth.length === 1 ? "" : "s"}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.monthCalendar.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No assigned inspections this month.</p>
          ) : (
            data.monthCalendar.map((entry) => (
              <div key={`${entry.dayKey}-${entry.siteName}`} className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm text-slate-500">{entry.label}</p>
                <p className="mt-1 font-semibold text-ink">{(entry as typeof entry & { primaryTitle?: string }).primaryTitle ?? entry.siteName}</p>
                {(entry as typeof entry & { secondaryTitle?: string }).secondaryTitle ? (
                  <p className="mt-1 text-sm text-slate-500">{(entry as typeof entry & { secondaryTitle?: string }).secondaryTitle}</p>
                ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge label={formatInspectionClassificationLabel(entry.inspectionClassification)} tone={getInspectionClassificationTone(entry.inspectionClassification)} />
                    {entry.isPriority ? <PriorityBadge /> : null}
                    <StatusBadge label={inspectionStatusLabel(entry.status)} tone={getInspectionStatusTone(entry.status as Parameters<typeof getInspectionStatusTone>[0])} />
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.25fr)_minmax(24rem,0.9fr)]">
        <div className="rounded-[2rem] bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-ink">Assigned inspections</h3>
              <p className="mt-1 text-sm text-slate-500">Complete all report tasks before marking the visit completed.</p>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            {data.assigned.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No assigned inspections yet.</p>
            ) : (
              data.assigned.map((inspection: AssignedInspection) => {
                const nextDue = pickEarliestNextDueAt(inspection.tasks.map((task: DashboardTask) => task.recurrence?.nextDueAt)) ?? undefined;
                const finalizedTaskCount = inspection.tasks.filter((task: DashboardTask) => task.report?.status === "finalized").length;
                return (
                  <div key={inspection.id} className="rounded-[1.5rem] border border-slate-200 p-4">
                    <div className="flex flex-col gap-4">
                      <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-ink">{(inspection as typeof inspection & { primaryTitle?: string }).primaryTitle ?? inspection.site.name}</p>
                            <StatusBadge label={formatInspectionClassificationLabel(inspection.inspectionClassification)} tone={getInspectionClassificationTone(inspection.inspectionClassification)} />
                            {inspection.isPriority ? <PriorityBadge /> : null}
                            <StatusBadge label={inspectionStatusLabel((inspection as typeof inspection & { displayStatus?: string }).displayStatus ?? inspection.status)} tone={getInspectionStatusTone(((inspection as typeof inspection & { displayStatus?: string }).displayStatus ?? inspection.status) as Parameters<typeof getInspectionStatusTone>[0])} />
                            <PaymentCollectionBadge visible={isDueAtTimeOfServiceCustomer(inspection.customerCompany)} />
                          </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {[format(inspection.scheduledStart, "EEE, MMM d h:mm a"), ((inspection as typeof inspection & { secondaryTitle?: string }).secondaryTitle ?? null)].filter(Boolean).join(" | ")}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">Assigned team: {((inspection as typeof inspection & { assignedTechnicianNames?: string[] }).assignedTechnicianNames ?? []).join(", ")}</p>
                        <p className="mt-1 text-sm text-slate-500">Due date: {nextDueLabel(nextDue, inspection.scheduledStart)}</p>
                        {isDueAtTimeOfServiceCustomer(inspection.customerCompany) ? (
                          <p className="mt-1 text-sm font-semibold text-amber-800">Collect payment before leaving the site.</p>
                        ) : null}
                        <p className="mt-1 text-sm text-slate-500">Report types: {inspection.tasks.map((task: DashboardTask) => task.displayLabel ?? task.inspectionType.replaceAll("_", " ")).join(", ")}</p>
                        <p className="mt-1 text-sm text-slate-500">{finalizedTaskCount} of {inspection.tasks.length} report task{inspection.tasks.length === 1 ? "" : "s"} finalized</p>
                        {inspection.closeoutRequest?.status === "pending" ? (
                          <div className="mt-3 rounded-[1.25rem] border border-blue-200 bg-blue-50/80 px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-900">Follow-up request pending office review</p>
                            <p className="mt-1 text-sm text-blue-950">
                              {inspection.closeoutRequest.requestType === "follow_up_inspection" ? "Follow-up inspection" : "New inspection"} requested.
                            </p>
                          </div>
                        ) : null}
                        <DispatchNotes notes={inspection.notes} />
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {inspection.tasks.map((task: DashboardTask) => (
                            <div key={task.id} className="space-y-2 rounded-[1.25rem] bg-slate-50 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-ink">{task.displayLabel ?? task.inspectionType.replaceAll("_", " ")}</p>
                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${reportStatusClasses[task.report?.status ?? "draft"] ?? reportStatusClasses.draft}`}>{(task.report?.status ?? "draft").replaceAll("_", " ")}</span>
                              </div>
                              {task.report?.correctionState && task.report.correctionState !== "none" ? (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                  <p className="font-semibold uppercase tracking-[0.16em]">{correctionStateLabel(task.report.correctionState)}</p>
                                  {task.report.correctionReason ? <p className="mt-1 normal-case">{task.report.correctionReason}</p> : null}
                                </div>
                              ) : null}
                              <p className="text-xs text-slate-500">Due: {serviceLineDueLabel(task, inspection.scheduledStart)}</p>
                              <Link className="inline-flex min-h-12 w-full items-center justify-center rounded-[1.25rem] bg-white px-4 py-3 text-center text-sm font-semibold text-slateblue ring-1 ring-slate-200" href={`/app/tech/reports/${inspection.id}/${task.id}`}>
                                {taskActionLabel(task)}
                              </Link>
                              {task.addedByUserId === session.user.id ? (
                                <RemoveReportTypeButton
                                  inspectionId={inspection.id}
                                  inspectionTaskId={task.id}
                                  taskLabel={task.displayLabel ?? task.inspectionType.replaceAll("_", " ")}
                                />
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 space-y-2">
                          {((inspection as typeof inspection & {
                            documents?: Array<{
                              id: string;
                              label: string | null;
                              fileName: string;
                              requiresSignature: boolean;
                              status: string;
                            }>;
                          }).documents ?? []).length ? (
                            <>
                              <p className="text-sm font-semibold text-ink">External documents</p>
                              {((inspection as typeof inspection & {
                                documents?: Array<{
                                  id: string;
                                  label: string | null;
                                  fileName: string;
                                  requiresSignature: boolean;
                                  status: string;
                                  annotatedStorageKey?: string | null;
                                  signedStorageKey?: string | null;
                                }>;
                              }).documents ?? []).map((document: DashboardDocument) => (
                                <div key={document.id} className="flex flex-col gap-2 rounded-[1.25rem] border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <p className="text-sm font-semibold text-ink">{document.label || document.fileName}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {document.requiresSignature ? "Requires signature" : "Reference only"} | {document.status.replaceAll("_", " ")}
                                    </p>
                                  </div>
                                  <Link className="inline-flex min-h-12 items-center justify-center rounded-[1.25rem] bg-white px-4 py-3 text-center text-sm font-semibold text-slateblue ring-1 ring-slate-200" href={`/app/tech/inspections/${inspection.id}/documents/${document.id}`}>
                                    {document.requiresSignature
                                      ? (document.status !== "SIGNED" && document.status !== "EXPORTED" ? "Sign PDF" : "View signed PDF")
                                      : (document.annotatedStorageKey ? "View annotated PDF" : "Mark up PDF")}
                                  </Link>
                                </div>
                              ))}
                            </>
                          ) : null}
                        </div>
                        <div className="mt-3">
                          <AddReportTypeControl inspectionId={inspection.id} />
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {inspection.status === "to_be_completed" || inspection.status === "scheduled" ? <StatusButton inspectionId={inspection.id} status="in_progress" label="Start inspection" /> : null}
                        {inspection.status === "in_progress" ? <CompleteInspectionCard inspectionId={inspection.id} /> : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-5 shadow-panel">
          <h3 className="text-2xl font-semibold text-ink">Shared technician queue</h3>
          <p className="mt-1 text-sm text-slate-500">Unassigned inspections stay claimable until a technician takes ownership.</p>
          <div className="mt-4 space-y-4">
            {data.unassigned.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No open inspections to claim.</p>
            ) : (
              data.unassigned.map((inspection: UnassignedInspection) => {
                const nextDue = pickEarliestNextDueAt(inspection.tasks.map((task: UnassignedInspection["tasks"][number]) => task.recurrence?.nextDueAt)) ?? undefined;
                return (
                  <div key={inspection.id} className="rounded-[1.5rem] border border-slate-200 p-4">
                    <div className="space-y-4">
                      <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-ink">{(inspection as typeof inspection & { primaryTitle?: string }).primaryTitle ?? inspection.site.name}</p>
                            <StatusBadge label={formatInspectionClassificationLabel(inspection.inspectionClassification)} tone={getInspectionClassificationTone(inspection.inspectionClassification)} />
                            {inspection.isPriority ? <PriorityBadge /> : null}
                            <StatusBadge label={inspectionStatusLabel((inspection as typeof inspection & { displayStatus?: string }).displayStatus ?? inspection.status)} tone={getInspectionStatusTone(((inspection as typeof inspection & { displayStatus?: string }).displayStatus ?? inspection.status) as Parameters<typeof getInspectionStatusTone>[0])} />
                            <PaymentCollectionBadge visible={isDueAtTimeOfServiceCustomer(inspection.customerCompany)} />
                          </div>
                        <p className="mt-2 text-sm text-slate-500">
                          {[format(inspection.scheduledStart, "MMM d, h:mm a"), ((inspection as typeof inspection & { secondaryTitle?: string }).secondaryTitle ?? null)].filter(Boolean).join(" | ")}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">Due date: {nextDueLabel(nextDue, inspection.scheduledStart)}</p>
                        {isDueAtTimeOfServiceCustomer(inspection.customerCompany) ? (
                          <p className="mt-1 text-sm font-semibold text-amber-800">Collect payment before leaving the site.</p>
                        ) : null}
                        <p className="mt-1 text-sm text-slate-500">{inspection.tasks.length} report task{inspection.tasks.length === 1 ? "" : "s"} ready to claim</p>
                        <DispatchNotes notes={inspection.notes} />
                      </div>
                      <ClaimButton inspectionId={inspection.id} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
