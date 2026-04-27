"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import type { MobileInspectionSectionProgress, MobileInspectionSectionStatus, ReportPrimitiveValue } from "@testworx/lib";

import { buildSafeTaskProgressSummary, getTechnicianMobileTaskStatusLabel, type TechnicianMobileTaskWorkspaceSummary } from "./mobile-inspection-workspace";
import { InspectionCustomerContactCard } from "./inspection-customer-contact-card";

type WorkspaceData = {
  inspectionId: string;
  totalTaskCount: number;
  currentTaskIndex: number;
  relatedTasks: TechnicianMobileTaskWorkspaceSummary[];
};

export function MobileInspectionShell({
  title,
  siteName,
  customerName,
  customerContactName,
  customerPhone,
  customerEmail,
  reportStatus,
  saveState,
  workspace,
  reportMode = "edit",
  progressLabel,
  progressPercent,
  currentSectionLabel,
  sections,
  activeSectionId,
  onSelectSection,
  onSelectReport,
  children,
  stickyFooter
}: {
  title: string;
  siteName?: string | null;
  customerName?: string | null;
  customerContactName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  reportStatus: string;
  saveState: string;
  workspace: WorkspaceData;
  reportMode?: "edit" | "review";
  progressLabel: string | null;
  progressPercent: number | null;
  currentSectionLabel: string | null;
  sections: MobileInspectionSectionProgress[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  onSelectReport: (taskId: string, mode?: "edit" | "review") => void;
  children: ReactNode;
  stickyFooter?: ReactNode;
}) {
  return (
    <div
      className="space-y-4"
      style={{ paddingBottom: "calc(var(--mobile-tab-bar-offset, 5.5rem) + env(safe-area-inset-bottom, 0px) + 9rem)" }}
    >
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-[rgb(248_250_252/0.95)] px-4 pb-4 pt-2 backdrop-blur md:-mx-6 md:px-6">
        <div className="space-y-4">
          <div className="rounded-[1.85rem] border border-slate-200 bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Inspection report</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h1>
                {siteName ? <p className="mt-2 text-sm font-medium text-slate-700">{siteName}</p> : null}
                {customerName ? <p className="mt-1 text-sm text-slate-500">{customerName}</p> : null}
                <p className="mt-2 text-sm text-slate-500">{reportStatus}{currentSectionLabel ? ` • ${currentSectionLabel}` : ""}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-sm font-semibold text-slate-700">
                <p>{saveState}</p>
              </div>
            </div>

            {progressLabel && progressPercent !== null ? (
              <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                  <p>{progressLabel}</p>
                  <p className="font-semibold text-slate-900">{progressPercent}%</p>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-[var(--tenant-primary)] transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            ) : null}
          </div>

          <MobileReportNavigator currentMode={reportMode} onSelectReport={onSelectReport} workspace={workspace} />

          <InspectionCustomerContactCard
            compact
            contactName={customerContactName}
            email={customerEmail}
            phone={customerPhone}
          />

          {sections.length > 0 ? (
            <div className="rounded-[1.7rem] border border-slate-200 bg-white p-4 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sections</p>
                  <p className="mt-1 text-sm text-slate-500">Jump between report sections and keep progress moving.</p>
                </div>
              </div>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {sections.map((section) => {
                  const progress = buildSafeTaskProgressSummary({
                    completedCount: section.completedCount,
                    totalCount: section.totalCount,
                    percent: section.percent
                  });
                  const active = section.sectionId === activeSectionId;
                  return (
                    <button
                      key={section.sectionId}
                      className={`min-w-[12rem] rounded-[1.3rem] border px-4 py-3 text-left transition ${
                        active
                          ? "border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary-soft)] shadow-[0_14px_32px_rgb(var(--tenant-primary-rgb)/0.12)]"
                          : "border-slate-200 bg-slate-50"
                      }`}
                      onClick={() => onSelectSection(section.sectionId)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">{section.sectionLabel}</p>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                          {formatSectionStatus(section.status)}
                        </span>
                      </div>
                      {progress ? <p className="mt-2 text-xs text-slate-500">{progress.label}</p> : null}
                      {section.issueCount > 0 ? <p className="mt-1 text-xs font-medium text-rose-700">{section.issueCount} issue{section.issueCount === 1 ? "" : "s"}</p> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {children}

      {stickyFooter ? (
        <div
          className="mobile-keyboard-hide fixed inset-x-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur"
          style={{ bottom: "var(--mobile-tab-bar-offset, 5.5rem)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto max-w-5xl">{stickyFooter}</div>
        </div>
      ) : null}
    </div>
  );
}

export function MobileReportNavigator({
  workspace,
  currentMode,
  onSelectReport
}: {
  workspace: WorkspaceData;
  currentMode: "edit" | "review";
  onSelectReport: (taskId: string, mode?: "edit" | "review") => void;
}) {
  if (workspace.totalTaskCount <= 1) {
    return null;
  }

  return (
    <section className="rounded-[1.7rem] border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reports assigned</p>
          <p className="mt-1 text-sm text-slate-500">{workspace.totalTaskCount} reports assigned • Report {workspace.currentTaskIndex} of {workspace.totalTaskCount}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {workspace.relatedTasks.map((task) => {
          const progress = buildSafeTaskProgressSummary({
            completedCount: task.progressCompletedCount,
            totalCount: task.progressTotalCount,
            percent: task.progressPercent
          });
          const status = task.isCurrent
            ? currentMode === "review" && task.reportStatus !== "finalized"
              ? "Ready for Review"
              : getTechnicianMobileTaskStatusLabel({ reportStatus: task.reportStatus, hasMeaningfulProgress: task.hasMeaningfulProgress })
            : getTechnicianMobileTaskStatusLabel({ reportStatus: task.reportStatus, hasMeaningfulProgress: task.hasMeaningfulProgress });

          return (
            <button
              key={task.id}
              className={`min-w-[14rem] rounded-[1.35rem] border px-4 py-4 text-left transition ${
                task.isCurrent
                  ? "border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary-soft)] shadow-[0_16px_34px_rgb(var(--tenant-primary-rgb)/0.12)]"
                  : "border-slate-200 bg-slate-50"
              }`}
              onClick={() => onSelectReport(task.id, currentMode)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Report</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{task.displayLabel}</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">{status}</span>
              </div>
              {progress ? <p className="mt-3 text-sm text-slate-500">{progress.label}</p> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function MobileSectionList({
  sections,
  renderSection
}: {
  sections: MobileInspectionSectionProgress[];
  renderSection: (section: MobileInspectionSectionProgress) => ReactNode;
}) {
  return <div className="space-y-4">{sections.map((section) => renderSection(section))}</div>;
}

export function MobileSectionCard({
  title,
  summary,
  status,
  issueCount,
  isOpen,
  onToggle,
  children
}: {
  title: string;
  summary: string | null;
  status: MobileInspectionSectionStatus;
  issueCount: number;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-panel">
      <button className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left" onClick={onToggle} type="button">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{formatSectionStatus(status)}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">{title}</h2>
          {summary ? <p className="mt-2 text-sm text-slate-500">{summary}</p> : null}
          {issueCount > 0 ? <p className="mt-1 text-sm font-medium text-rose-700">{issueCount} issue{issueCount === 1 ? "" : "s"} need review</p> : null}
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600">
          {isOpen ? "Collapse" : "Open"}
        </span>
      </button>
      {isOpen ? <div className="border-t border-slate-200 px-5 py-5">{children}</div> : null}
    </section>
  );
}

export function MobileChecklistItem({
  title,
  description,
  value,
  options,
  onSelect,
  note,
  onNoteChange,
  severity,
  onSeverityChange,
  photoSrc,
  photoCount,
  onPhotoChange,
  showFailurePanel,
  disabled
}: {
  title: string;
  description?: string | null;
  value: string;
  options: Array<{ label: string; value: string; tone?: "positive" | "negative" | "neutral" }>;
  onSelect: (value: string) => void;
  note?: string;
  onNoteChange?: (value: string) => void;
  severity?: string;
  onSeverityChange?: (value: string) => void;
  photoSrc?: string | null;
  photoCount?: number;
  onPhotoChange?: (files: FileList | null) => void;
  showFailurePanel?: boolean;
  disabled?: boolean;
}) {
  return (
    <article className="rounded-[1.45rem] border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {photoCount ? <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">{photoCount} photo</span> : null}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const active = option.value === value;
          const toneClass = option.tone === "positive"
            ? active ? "border-emerald-300 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700"
            : option.tone === "negative"
              ? active ? "border-rose-300 bg-rose-600 text-white" : "border-slate-200 bg-white text-slate-700"
              : active ? "border-slate-300 bg-slate-700 text-white" : "border-slate-200 bg-white text-slate-700";
          return (
            <button
              key={option.value}
              className={`min-h-12 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${toneClass}`}
              disabled={disabled}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {showFailurePanel ? (
        <div className="mt-4">
          <MobileFailurePanel
            disabled={disabled}
            note={note ?? ""}
            onNoteChange={onNoteChange}
            onPhotoChange={onPhotoChange}
            onSeverityChange={onSeverityChange}
            photoSrc={photoSrc ?? null}
            severity={severity ?? "medium"}
          />
        </div>
      ) : null}
    </article>
  );
}

export function MobileFailurePanel({
  note,
  onNoteChange,
  severity,
  onSeverityChange,
  photoSrc,
  onPhotoChange,
  disabled
}: {
  note: string;
  onNoteChange?: (value: string) => void;
  severity?: string;
  onSeverityChange?: (value: string) => void;
  photoSrc?: string | null;
  onPhotoChange?: (files: FileList | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-[1.25rem] border border-rose-200 bg-rose-50/70 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-800">Failure detail</p>
      {onNoteChange ? (
        <textarea
          className="min-h-24 w-full resize-none rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
          disabled={disabled}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Describe what failed and what the technician observed."
          value={note}
        />
      ) : null}
      {onSeverityChange ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Severity</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Low", value: "low" },
              { label: "Medium", value: "medium" },
              { label: "High", value: "high" },
              { label: "Critical", value: "critical" }
            ].map((option) => (
              <button
                key={option.value}
                className={`min-h-11 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                  severity === option.value
                    ? "border-rose-300 bg-rose-600 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
                disabled={disabled}
                onClick={() => onSeverityChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {onPhotoChange ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Photo evidence</p>
              <p className="mt-1 text-sm text-slate-500">Saved locally first and synced later.</p>
            </div>
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">
              {photoSrc ? "Replace photo" : "Add photo"}
              <input accept="image/*" className="hidden" disabled={disabled} onChange={(event) => { onPhotoChange(event.target.files); event.target.value = ""; }} type="file" />
            </label>
          </div>
          {photoSrc ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <Image alt="Failure evidence" className="aspect-[4/3] w-full object-cover" height={260} src={photoSrc} unoptimized width={360} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MobileRepeatableRows({
  title,
  description,
  addLabel,
  rows,
  expandedRowKey,
  onToggleRow,
  onAddRow,
  onRemoveRow,
  renderRowSummary,
  renderExpandedRow,
  disabled
}: {
  title: string;
  description?: string | null;
  addLabel: string;
  rows: Array<{ key: string; title: string; subtitle?: string | null; status: string; summary?: string | null; issueCount?: number }>;
  expandedRowKey: string | null;
  onToggleRow: (rowKey: string) => void;
  onAddRow: () => void;
  onRemoveRow: (rowKey: string) => void;
  renderRowSummary?: (rowKey: string) => ReactNode;
  renderExpandedRow: (rowKey: string) => ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        <button className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50" disabled={disabled} onClick={onAddRow} type="button">
          {addLabel}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">No items added yet.</p>
      ) : rows.map((row) => {
        const isOpen = expandedRowKey === row.key;
        return (
          <div key={row.key} className="overflow-hidden rounded-[1.45rem] border border-slate-200 bg-slate-50">
            <button className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left" onClick={() => onToggleRow(row.key)} type="button">
              <div>
                <p className="text-base font-semibold text-slate-950">{row.title}</p>
                {row.subtitle ? <p className="mt-1 text-sm text-slate-500">{row.subtitle}</p> : null}
                {row.summary ? <p className="mt-2 text-sm text-slate-600">{row.summary}</p> : null}
                {row.issueCount ? <p className="mt-1 text-sm font-medium text-rose-700">{row.issueCount} issue{row.issueCount === 1 ? "" : "s"}</p> : null}
              </div>
              <div className="text-right">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{row.status}</span>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{isOpen ? "Collapse" : "Edit"}</p>
              </div>
            </button>
            {renderRowSummary ? <div className="px-4 pb-4">{renderRowSummary(row.key)}</div> : null}
            {isOpen ? (
              <div className="border-t border-slate-200 bg-white px-4 py-4">
                {renderExpandedRow(row.key)}
                <button className="mt-4 min-h-11 rounded-2xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={disabled} onClick={() => onRemoveRow(row.key)} type="button">
                  Remove item
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function MobileSummarySection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function MobileReviewScreen({
  title,
  saveState,
  summaryCards,
  blockingIssues,
  warnings,
  children,
  footer
}: {
  title: string;
  saveState: string;
  summaryCards: Array<{ label: string; value: string }>;
  blockingIssues: string[];
  warnings: string[];
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div
      className="space-y-4"
      style={{ paddingBottom: "calc(var(--mobile-tab-bar-offset, 5.5rem) + env(safe-area-inset-bottom, 0px) + 9rem)" }}
    >
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Review & Complete</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h1>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{saveState}</div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-panel">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{card.value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-4 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Blocking issues</p>
          {blockingIssues.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Ready to finalize. This report saves locally first and syncs in the background.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {blockingIssues.map((issue) => (
                <p key={issue} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{issue}</p>
              ))}
            </div>
          )}
        </div>
        {warnings.length > 0 ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Warnings</p>
            <div className="mt-3 space-y-2">
              {warnings.map((warning) => (
                <p key={warning} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning}</p>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {children}
      {footer}
    </div>
  );
}

function formatSectionStatus(status: MobileInspectionSectionStatus) {
  if (status === "complete") {
    return "Complete";
  }
  if (status === "needs_review") {
    return "Needs Review";
  }
  if (status === "in_progress") {
    return "In Progress";
  }
  return "Not Started";
}

export function mapOptionTone(value: ReportPrimitiveValue | undefined): "positive" | "negative" | "neutral" {
  const normalized = String(value ?? "").toLowerCase();
  if (["pass", "yes", "good", "normal", "stable", "current", "compliant"].includes(normalized)) {
    return "positive";
  }
  if (["fail", "no", "deficiency", "damaged", "attention", "poor", "low", "high", "needs_repair"].includes(normalized)) {
    return "negative";
  }
  return "neutral";
}
