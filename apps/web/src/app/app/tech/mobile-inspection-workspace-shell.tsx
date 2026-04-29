"use client";

import Link from "next/link";

import {
  buildSafeTaskProgressSummary,
  getTechnicianMobileTaskStatusLabel,
  type TechnicianMobileTaskWorkspaceSummary
} from "./mobile-inspection-workspace";
import { InspectionCustomerContactCard } from "./inspection-customer-contact-card";

type InspectionWorkspaceData = {
  inspectionId: string;
  totalTaskCount: number;
  currentTaskIndex: number;
  relatedTasks: TechnicianMobileTaskWorkspaceSummary[];
};

function resolveWorkspaceTaskStatusLabel({
  task,
  currentMode
}: {
  task: TechnicianMobileTaskWorkspaceSummary;
  currentMode: "edit" | "review";
}) {
  if (task.isCurrent) {
    if (task.reportStatus === "finalized") {
      return "Finalized";
    }

    if (currentMode === "review" || task.reportStatus === "submitted") {
      return "Ready for Completion";
    }

    return "In Progress";
  }

  return getTechnicianMobileTaskStatusLabel({
    reportStatus: task.reportStatus,
    hasMeaningfulProgress: task.hasMeaningfulProgress,
    schedulingStatus: task.schedulingStatus,
    isAvailableInTechnicianApp: task.isAvailableInTechnicianApp
  });
}

export function MobileInspectionWorkspaceShell({
  workspace,
  siteName,
  customerName,
  customerContactName,
  customerPhone,
  customerEmail,
  scheduledDateLabel,
  currentMode,
  saveState
}: {
  workspace: InspectionWorkspaceData;
  siteName: string;
  customerName: string;
  customerContactName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  scheduledDateLabel: string;
  currentMode: "edit" | "review";
  saveState?: string | null;
}) {
  const isMultiTaskInspection = workspace.totalTaskCount > 1;
  const currentTask = workspace.relatedTasks.find((task) => task.isCurrent) ?? workspace.relatedTasks[0] ?? null;
  const modeLabel = currentMode === "review" ? "Review mode" : "Inspection workspace";
  const hasCustomerContact = Boolean(customerContactName?.trim() || customerPhone?.trim() || customerEmail?.trim());

  return (
    <section className="rounded-[1.85rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{modeLabel}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{siteName}</h1>
          <p className="mt-2 text-sm text-slate-500">{customerName} • {scheduledDateLabel}</p>
        </div>
        {saveState ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            {saveState}
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-[1.35rem] border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="font-semibold text-slate-950">
            {workspace.totalTaskCount === 1 ? "1 report assigned" : `${workspace.totalTaskCount} reports assigned`}
          </span>
          {isMultiTaskInspection ? <span>•</span> : null}
          {isMultiTaskInspection ? (
            <span>Report {workspace.currentTaskIndex} of {workspace.totalTaskCount}</span>
          ) : null}
        </div>
        {currentTask ? (
          <p className="mt-2 text-sm text-slate-500">
            Current report: <span className="font-medium text-slate-900">{currentTask.displayLabel}</span>
          </p>
        ) : null}
      </div>

      {hasCustomerContact ? (
        <div className="mt-4">
          <InspectionCustomerContactCard
            compact
            contactName={customerContactName}
            email={customerEmail}
            phone={customerPhone}
          />
        </div>
      ) : null}

      {isMultiTaskInspection ? (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned report tracks</p>
          <div className="space-y-3">
            {workspace.relatedTasks.map((task, index) => {
              const progress = buildSafeTaskProgressSummary({
                completedCount: task.progressCompletedCount,
                totalCount: task.progressTotalCount,
                percent: task.progressPercent
              });
              const statusLabel = resolveWorkspaceTaskStatusLabel({ task, currentMode });
              const href = currentMode === "review"
                ? `/app/tech/reports/${encodeURIComponent(workspace.inspectionId)}/${encodeURIComponent(task.id)}/review`
                : `/app/tech/reports/${encodeURIComponent(workspace.inspectionId)}/${encodeURIComponent(task.id)}`;
              const isCurrent = Boolean(task.isCurrent);
              const isUnavailable = task.isAvailableInTechnicianApp === false;

              const content = (
                <div
                  className={`rounded-[1.45rem] border px-4 py-4 transition ${
                    isCurrent
                      ? "border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary-soft)] shadow-[0_18px_40px_rgb(var(--tenant-primary-rgb)/0.12)]"
                      : isUnavailable
                        ? "border-slate-200 bg-slate-100 opacity-75"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Report {index + 1}
                      </p>
                      <h2 className="mt-2 text-base font-semibold text-slate-950">{task.displayLabel}</h2>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      isCurrent
                        ? "border-[color:var(--tenant-primary-border)] bg-white text-[var(--tenant-primary)]"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}>
                      {statusLabel}
                    </div>
                  </div>
                  {progress ? (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>{progress.label}</span>
                        <span>{progress.percent}%</span>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-[var(--tenant-primary)] transition-all"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {isUnavailable && task.unavailableReason ? <p className="mt-3 text-sm text-slate-500">{task.unavailableReason}</p> : null}
                </div>
              );

              if (isCurrent || isUnavailable) {
                return <div key={task.id}>{content}</div>;
              }

              return (
                <Link key={task.id} href={href}>
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      ) : currentTask ? (
        <div className="mt-4 rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current report</p>
              <p className="mt-2 text-base font-semibold text-slate-950">{currentTask.displayLabel}</p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {resolveWorkspaceTaskStatusLabel({ task: currentTask, currentMode })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
