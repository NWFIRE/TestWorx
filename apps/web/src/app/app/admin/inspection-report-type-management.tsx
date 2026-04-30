"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  addInspectionTaskAdminAction,
  markInspectionTaskNotNeededAdminAction,
  removeInspectionTaskAdminAction
} from "./actions";

type AddInspectionTaskType = Parameters<typeof addInspectionTaskAdminAction>[1];

type ReportTypeOption = {
  label: string;
  value: string;
};

type ManagedReportTask = {
  id: string;
  inspectionType: string;
  label: string;
  assignedTechnicianName: string;
  dueLabel: string;
  reportStatus: string;
  schedulingStatus: string;
  isAddedTask: boolean;
  hasReportActivity: boolean;
  isFinalized: boolean;
};

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function InspectionReportTypeManagement(input: {
  inspectionId: string;
  reportTypes: ReportTypeOption[];
  tasks: ManagedReportTask[];
}) {
  const router = useRouter();
  const [reportTypeQuery, setReportTypeQuery] = useState("");
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);
  const [reasonByTask, setReasonByTask] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeReportTypes = useMemo(
    () => new Set(input.tasks.map((task) => task.inspectionType)),
    [input.tasks]
  );
  const filteredReportTypes = useMemo(() => {
    const query = reportTypeQuery.trim().toLowerCase();
    if (!query) {
      return input.reportTypes;
    }
    return input.reportTypes.filter((reportType) => reportType.label.toLowerCase().includes(query));
  }, [input.reportTypes, reportTypeQuery]);

  return (
    <div className="rounded-[2rem] bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Inspection reports / report types</p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">Current visit scope</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Add work to this inspection while the technician is on-site, or safely remove report types that are no longer needed.
          </p>
        </div>
        <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:max-w-md">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" htmlFor="report-type-search">
            Add report type
          </label>
          <input
            className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-ink outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            disabled={isPending}
            id="report-type-search"
            onChange={(event) => setReportTypeQuery(event.target.value)}
            placeholder="Search report types"
            value={reportTypeQuery}
          />
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {filteredReportTypes.length ? filteredReportTypes.map((reportType) => {
              const alreadyAdded = activeReportTypes.has(reportType.value);
              return (
                <button
                  className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition ${
                    alreadyAdded
                      ? "border-slate-200 bg-white text-slate-400"
                      : "border-blue-100 bg-white text-ink hover:border-blue-300 hover:bg-blue-50"
                  }`}
                  disabled={isPending || alreadyAdded}
                  key={reportType.value}
                  onClick={() => {
                    const confirmed = window.confirm(`Add ${reportType.label} to this inspection?`);
                    if (!confirmed) {
                      return;
                    }
                    startTransition(async () => {
                      setMessage(null);
                      const result = await addInspectionTaskAdminAction(input.inspectionId, reportType.value as AddInspectionTaskType);
                      if (result.ok) {
                        setReportTypeQuery("");
                        setMessage({ tone: "success", text: "Report type added to this inspection." });
                        router.refresh();
                        return;
                      }
                      setMessage({ tone: "error", text: result.error ?? "Unable to add this report type." });
                    });
                  }}
                  type="button"
                >
                  <span>{reportType.label}</span>
                  <span className={`rounded-full px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] ${
                    alreadyAdded ? "bg-slate-100 text-slate-500" : "bg-blue-50 text-blue-700"
                  }`}>
                    {alreadyAdded ? "Already added" : "Add"}
                  </span>
                </button>
              );
            }) : (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                No report types match that search.
              </p>
            )}
          </div>
          {isPending && !actionTaskId ? <p className="mt-2 text-xs font-semibold text-blue-700">Adding report type...</p> : null}
        </div>
      </div>

      {message ? (
        <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
          message.tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-rose-200 bg-rose-50 text-rose-700"
        }`}>
          {message.text}
        </p>
      ) : null}

      <div className="mt-5 space-y-3">
        {input.tasks.length ? input.tasks.map((task) => {
          const reason = reasonByTask[task.id] ?? "";
          return (
            <div key={task.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{task.label}</p>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      {task.reportStatus}
                    </span>
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-blue-700">
                      {statusLabel(task.schedulingStatus)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {task.isAddedTask ? "Added after the original inspection was scheduled." : "Original scheduled report type."}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">Assigned technician: {task.assignedTechnicianName}</p>
                  <p className="mt-1 text-sm text-slate-500">Due: {task.dueLabel}</p>
                  {task.hasReportActivity ? (
                    <p className="mt-2 text-sm text-amber-700">
                      Work exists for this report. It will be preserved if this report is marked not needed.
                    </p>
                  ) : null}
                </div>

                <div className="w-full space-y-2 xl:max-w-md">
                  {task.hasReportActivity || task.isFinalized ? (
                    <>
                      <textarea
                        className="min-h-20 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                        disabled={isPending}
                        onChange={(event) =>
                          setReasonByTask((current) => ({ ...current, [task.id]: event.target.value }))
                        }
                        placeholder={task.isFinalized ? "Reason for voiding this finalized report" : "Reason this report is not needed"}
                        value={reason}
                      />
                      <button
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
                        disabled={isPending || reason.trim().length < 4}
                        onClick={() => {
                          const confirmed = window.confirm(
                            task.isFinalized
                              ? `This report is finalized. Void ${task.label} with the provided reason?`
                              : `Mark ${task.label} as Not Needed and preserve its work history?`
                          );
                          if (!confirmed) {
                            return;
                          }
                          startTransition(async () => {
                            setActionTaskId(task.id);
                            setMessage(null);
                            const result = await markInspectionTaskNotNeededAdminAction(input.inspectionId, task.id, reason);
                            setActionTaskId(null);
                            if (result.ok) {
                              setMessage({ tone: "success", text: task.isFinalized ? "Report voided and preserved in audit history." : "Report marked not needed." });
                              router.refresh();
                              return;
                            }
                            setMessage({ tone: "error", text: result.error ?? "Unable to update this report type." });
                          });
                        }}
                        type="button"
                      >
                        {isPending && actionTaskId === task.id ? "Saving..." : task.isFinalized ? "Void with reason" : "Mark Not Needed"}
                      </button>
                    </>
                  ) : (
                    <button
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                      disabled={isPending}
                      onClick={() => {
                        const confirmed = window.confirm(`Remove ${task.label} from this inspection? No technician work has been recorded for it.`);
                        if (!confirmed) {
                          return;
                        }
                        startTransition(async () => {
                          setActionTaskId(task.id);
                          setMessage(null);
                          const result = await removeInspectionTaskAdminAction(input.inspectionId, task.id);
                          setActionTaskId(null);
                          if (result.ok) {
                            setMessage({ tone: "success", text: "Report type removed from this inspection." });
                            router.refresh();
                            return;
                          }
                          setMessage({ tone: "error", text: result.error ?? "Unable to remove this report type." });
                        });
                      }}
                      type="button"
                    >
                      {isPending && actionTaskId === task.id ? "Removing..." : "Remove"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-700">No report types on this inspection.</p>
            <p className="mt-1 text-sm text-slate-500">Report types will appear here when they are attached to the visit.</p>
          </div>
        )}
      </div>
    </div>
  );
}
