"use client";

import Link from "next/link";
import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

function formatCorrectionState(state: string) {
  return state.replaceAll("_", " ");
}

function formatActionType(actionType: string) {
  return actionType.replaceAll("_", " ");
}

const stateClasses: Record<string, string> = {
  none: "bg-slate-100 text-slate-700",
  admin_edit_in_progress: "bg-amber-50 text-amber-800",
  reissued_to_technician: "bg-blue-50 text-blue-800"
};

const reportStatusClasses: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700",
  submitted: "bg-sky-50 text-sky-700",
  finalized: "bg-emerald-50 text-emerald-700"
};

export function InspectionReportCorrectionsCard({
  inspectionId,
  reports,
  action,
  regenerateAction
}: {
  inspectionId: string;
  reports: Array<{
    taskId: string;
    inspectionType: string;
    displayLabel: string;
    report: {
      id: string;
      status: string;
      finalizedAt: string | null;
      correctionState: string;
      correctionReason: string | null;
      correctionRequestedAt: string | null;
      correctionResolvedAt: string | null;
      correctionRequestedBy: { id: string; name: string } | null;
      correctionResolvedBy: { id: string; name: string } | null;
      correctionEvents: Array<{
        id: string;
        actionType: string;
        reason: string | null;
        previousStatus: string | null;
        newStatus: string | null;
        createdAt: string;
        actedBy: { id: string; name: string };
      }>;
  } | null;
  }>;
  action: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  regenerateAction: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [regenerateState, regenerateFormAction, regeneratePending] = useActionState(regenerateAction, initialState);

  return (
    <div className="space-y-5 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Completed report corrections</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Report correction controls</h3>
        <p className="mt-2 text-sm text-slate-500">Reopen completed reports for correction, or regenerate their stored PDF when you need older visits reissued through the current v2 document engine.</p>
      </div>
      {state.error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</p> : null}
      {state.success ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{state.success}</p> : null}
      {regenerateState.error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{regenerateState.error}</p> : null}
      {regenerateState.success ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{regenerateState.success}</p> : null}
      <div className="space-y-4">
        {reports.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No report tasks found for this inspection.</p>
        ) : (
          reports.map((task) => {
            const report = task.report;
            const hasActiveCorrection = Boolean(report && report.correctionState !== "none");

            return (
              <div key={task.taskId} className="space-y-4 rounded-[1.5rem] border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-ink">{task.displayLabel}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${reportStatusClasses[report?.status ?? "draft"] ?? reportStatusClasses.draft}`}>
                        {(report?.status ?? "draft").replaceAll("_", " ")}
                      </span>
                      {report ? (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${stateClasses[report.correctionState] ?? stateClasses.none}`}>
                          {formatCorrectionState(report.correctionState)}
                        </span>
                      ) : null}
                    </div>
                    {report?.finalizedAt ? <p className="mt-2 text-sm text-slate-500">Finalized {new Date(report.finalizedAt).toLocaleString()}</p> : null}
                    {report?.correctionReason ? <p className="mt-2 text-sm text-slate-700">Current correction note: {report.correctionReason}</p> : null}
                    {report?.correctionRequestedAt ? (
                      <p className="mt-1 text-sm text-slate-500">
                        Requested {new Date(report.correctionRequestedAt).toLocaleString()}
                        {report.correctionRequestedBy ? ` by ${report.correctionRequestedBy.name}` : ""}
                      </p>
                    ) : null}
                    {report?.correctionResolvedAt ? (
                      <p className="mt-1 text-sm text-slate-500">
                        Last resolved {new Date(report.correctionResolvedAt).toLocaleString()}
                        {report.correctionResolvedBy ? ` by ${report.correctionResolvedBy.name}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
                      href={`/app/admin/reports/${inspectionId}/${task.taskId}`}
                    >
                      {hasActiveCorrection || report?.status === "draft" ? "Open correction editor" : "View report"}
                    </Link>
                  </div>
                </div>

                {report?.status === "finalized" && !hasActiveCorrection ? (
                  <form action={formAction} className="space-y-3 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                    <input name="inspectionId" type="hidden" value={inspectionId} />
                    <input name="inspectionReportId" type="hidden" value={report.id} />
                    <input name="taskId" type="hidden" value={task.taskId} />
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`reason-${report.id}`}>Correction reason</label>
                      <textarea
                        className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                        id={`reason-${report.id}`}
                        name="reason"
                        placeholder="Explain what needs to be corrected before this report becomes current again."
                        required
                      />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="inline-flex rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                        disabled={pending}
                        name="correctionMode"
                        type="submit"
                        value="admin_edit"
                      >
                        {pending ? "Working..." : "Edit completed report"}
                      </button>
                      <button
                        className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink disabled:opacity-60"
                        disabled={pending}
                        name="correctionMode"
                        type="submit"
                        value="reissue_to_technician"
                      >
                        {pending ? "Working..." : "Re-issue to technician"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {report?.status === "finalized" ? (
                  <form action={regenerateFormAction} className="rounded-[1.25rem] border border-slate-200 bg-white p-4">
                    <input name="inspectionId" type="hidden" value={inspectionId} />
                    <input name="inspectionReportId" type="hidden" value={report.id} />
                    <input name="taskId" type="hidden" value={task.taskId} />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">Regenerate customer PDF</p>
                        <p className="mt-1 text-sm text-slate-500">Replace the stored generated PDF with a fresh v2 version without reopening the report.</p>
                      </div>
                      <button
                        className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink disabled:opacity-60"
                        disabled={regeneratePending}
                        type="submit"
                      >
                        {regeneratePending ? "Regenerating..." : "Regenerate PDF"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {report?.correctionEvents?.length ? (
                  <div className="space-y-2 rounded-[1.25rem] border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Correction history</p>
                    {report.correctionEvents.map((event) => (
                      <div key={event.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink">{formatActionType(event.actionType)}</p>
                          <p className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</p>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">By {event.actedBy.name}</p>
                        {event.previousStatus || event.newStatus ? (
                          <p className="mt-1 text-sm text-slate-500">
                            {event.previousStatus ?? "unknown"} to {event.newStatus ?? "unknown"}
                          </p>
                        ) : null}
                        {event.reason ? <p className="mt-1 text-sm text-slate-700">{event.reason}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
