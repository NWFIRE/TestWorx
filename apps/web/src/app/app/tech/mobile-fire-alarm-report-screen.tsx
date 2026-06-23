"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  buildMobileInspectionProgressSummary,
  isFieldVisible,
  validateFinalizationDraft,
  type MobileInspectionSectionProgress,
  type ReportDraft,
  type ReportFieldDefinition,
  type ReportPrimitiveValue
} from "@testworx/lib";

import {
  mapOptionTone,
  MobileChecklistItem,
  MobileInspectionShell,
  MobileRepeatableRows,
  MobileReviewScreen,
  MobileSectionCard,
  MobileSectionList,
  MobileSummarySection
} from "./mobile-inspection-framework";
import type { TechnicianReportEditorData } from "./report-editor";
import { useMobileReportDraftController } from "./use-mobile-report-draft-controller";
import { SignaturePad } from "./signature-pad";
import { useConfirmDialog } from "../confirm-dialog";

const controlPanelChecklistFieldIds = [
  "lineVoltageStatus",
  "acPowerIndicator",
  "acBreakerLocked",
  "powerSupplyCondition",
  "audibleAlarm",
  "visualAlarm",
  "audibleTrouble",
  "visualTrouble",
  "lcdDisplayFunctional",
  "remoteMonitoring",
  "centralStationSignalTest",
  "remoteAnnunciator",
  "remoteIndicators",
  "doorAndLockCondition",
  "controlPanelCondition"
] as const;

const monitoringInfoFieldIds = [
  "monitoringCompanyName",
  "monitoringAccountNumber",
  "monitoringPhone",
  "monitoringContactName"
] as const;

const summaryEditableFieldIds = [
  "fireAlarmSystemStatus",
  "inspectorNotes",
  "recommendedRepairs",
  "followUpRequired"
] as const;

const fireAlarmLaborHourOptions = [
  "0.5",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "4.5",
  "5",
  "5.5",
  "6",
  "6.5",
  "7",
  "7.5",
  "8",
  "8.5",
  "9",
  "9.5",
  "10",
  "10.5",
  "11",
  "11.5",
  "12"
] as const;

function resolveStoredMediaSrc(reportId: string, storageKey: string | null | undefined) {
  if (!storageKey) {
    return undefined;
  }

  if (!storageKey.startsWith("blob:")) {
    return storageKey;
  }

  const params = new URLSearchParams({ reportId, storageKey });
  return `/api/reports/storage?${params.toString()}`;
}

function formatSectionSummary(section: MobileInspectionSectionProgress) {
  const parts: string[] = [];
  if (typeof section.completedCount === "number" && typeof section.totalCount === "number" && section.totalCount > 0) {
    parts.push(`${section.completedCount} of ${section.totalCount} complete`);
  }
  if (section.issueCount > 0) {
    parts.push(`${section.issueCount} issue${section.issueCount === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" • ") : null;
}

function hasMeaningfulRowData(row: Record<string, ReportPrimitiveValue>) {
  return Object.entries(row).some(([key, value]) => key !== "__rowId" && key !== "assetId" && value !== null && value !== undefined && value !== "" && value !== false);
}

function rowCompletionStatus({
  row,
  completionFieldIds,
  deficiencyFieldIds
}: {
  row: Record<string, ReportPrimitiveValue>;
  completionFieldIds?: string[];
  deficiencyFieldIds?: string[];
}) {
  const completed = completionFieldIds?.every((fieldId) => row[fieldId] !== null && row[fieldId] !== undefined && row[fieldId] !== "") ?? false;
  const hasIssue = deficiencyFieldIds?.some((fieldId) => ["fail", "deficiency", "damaged", "attention", "poor", "low", "high", "needs_repair"].includes(String(row[fieldId] ?? "").toLowerCase())) ?? false;

  if (completed && hasIssue) {
    return "Needs Review";
  }
  if (completed) {
    return "Complete";
  }
  if (hasMeaningfulRowData(row)) {
    return hasIssue ? "Needs Review" : "In Progress";
  }
  return "Not Started";
}

function buildChecklistCounts(template: TechnicianReportEditorData["template"], draft: ReportDraft) {
  let passCount = 0;
  let failCount = 0;
  let naCount = 0;
  let photoCount = 0;

  for (const section of template.sections) {
    const sectionFields = draft.sections[section.id]?.fields as Record<string, ReportPrimitiveValue> | undefined;
    for (const field of section.fields) {
      if (field.type === "repeater") {
        const rows = Array.isArray(sectionFields?.[field.id])
          ? sectionFields?.[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>>
          : [];
        for (const row of rows) {
          for (const rowField of field.rowFields) {
            if (!isFieldVisible(rowField, row) || rowField.hidden) {
              continue;
            }

            if (rowField.type === "photo" && row[rowField.id]) {
              photoCount += 1;
            }

            if (rowField.type !== "select") {
              continue;
            }

            const tone = mapOptionTone(row[rowField.id]);
            if (tone === "positive") {
              passCount += 1;
            } else if (tone === "negative") {
              failCount += 1;
            } else if (String(row[rowField.id] ?? "").toLowerCase() === "na") {
              naCount += 1;
            }
          }
        }
        continue;
      }

      if (!isFieldVisible(field, sectionFields ?? {}) || field.hidden) {
        continue;
      }

      if (field.type === "photo" && sectionFields?.[field.id]) {
        photoCount += 1;
      }

      if (field.type !== "select") {
        continue;
      }

      const tone = mapOptionTone(sectionFields?.[field.id]);
      if (tone === "positive") {
        passCount += 1;
      } else if (tone === "negative") {
        failCount += 1;
      } else if (String(sectionFields?.[field.id] ?? "").toLowerCase() === "na") {
        naCount += 1;
      }
    }
  }

  return { passCount, failCount, naCount, photoCount: photoCount + draft.attachments.length };
}

function FieldInput({
  field,
  value,
  reportId,
  onChange,
  onPhotoChange,
  disabled
}: {
  field: Exclude<ReportFieldDefinition, { type: "repeater" }>;
  value: ReportPrimitiveValue;
  reportId: string;
  onChange: (value: ReportPrimitiveValue) => void;
  onPhotoChange?: (files: FileList | null) => void;
  disabled?: boolean;
}) {
  if (field.type === "boolean") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          className={`min-h-12 rounded-2xl border px-4 py-3 text-sm font-semibold ${value ? "border-emerald-300 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
          disabled={disabled}
          onClick={() => onChange(true)}
          type="button"
        >
          Yes
        </button>
        <button
          className={`min-h-12 rounded-2xl border px-4 py-3 text-sm font-semibold ${!value ? "border-slate-300 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
          disabled={disabled}
          onClick={() => onChange(false)}
          type="button"
        >
          No
        </button>
      </div>
    );
  }

  if (field.type === "select") {
    const options = field.options ?? [];
    const useGrid = options.length >= 6;
    return (
      <div className={`grid gap-2 ${useGrid ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
        {options.map((option) => {
          const active = option.value === value;
          const tone = mapOptionTone(option.value);
          const activeClass = tone === "positive"
            ? "border-emerald-300 bg-emerald-600 text-white"
            : tone === "negative"
              ? "border-rose-300 bg-rose-600 text-white"
              : "border-slate-300 bg-slate-900 text-white";
          return (
            <button
              key={option.value}
              className={`min-h-12 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${active ? activeClass : "border-slate-200 bg-white text-slate-700"}`}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.type === "photo") {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        {value ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Image alt={field.label} className="aspect-[4/3] w-full object-cover" height={240} src={resolveStoredMediaSrc(reportId, String(value)) ?? String(value)} unoptimized width={320} />
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No photo attached.</p>
        )}
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">
          {value ? "Replace photo" : "Add photo"}
          <input accept="image/*" capture="environment" className="hidden" disabled={disabled} onChange={(event) => { onPhotoChange?.(event.target.files); event.target.value = ""; }} type="file" />
        </label>
      </div>
    );
  }

  if (field.type === "text") {
    return (
      <textarea
        className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        value={typeof value === "string" ? value : ""}
      />
    );
  }

  return (
    <input
      className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
      disabled={disabled}
      onChange={(event) => onChange(field.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)}
      placeholder={field.placeholder}
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
    />
  );
}

export function MobileFireAlarmReportScreen({
  data,
  inspectionId,
  taskId,
  mode
}: {
  data: TechnicianReportEditorData;
  inspectionId: string;
  taskId: string;
  mode: "edit" | "review";
}) {
  const router = useRouter();
  const controller = useMobileReportDraftController({ data, inspectionId, taskId });
  const [finalizeQueued, setFinalizeQueued] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, string | null>>({});

  const progress = useMemo(
    () => buildMobileInspectionProgressSummary(data.template, controller.draft, data.reportStatus),
    [controller.draft, data.reportStatus, data.template]
  );
  const checklistCounts = useMemo(() => buildChecklistCounts(data.template, controller.draft), [controller.draft, data.template]);
  const activeSectionId = controller.draft.activeSectionId ?? data.template.sections[0]?.id ?? "";
  const currentSectionLabel = progress.sections.find((section) => section.sectionId === activeSectionId)?.sectionLabel ?? null;
  const isReadOnly = !data.canEdit || data.reportStatus === "finalized";
  const resolvedOpenSections = useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const section of progress.sections) {
      next[section.sectionId] = openSections[section.sectionId] ?? (section.sectionId === activeSectionId || section.status !== "complete");
    }
    if (activeSectionId) {
      next[activeSectionId] = true;
    }
    return next;
  }, [activeSectionId, openSections, progress.sections]);

  const controlPanelSection = data.template.sections.find((section) => section.id === "control-panel");
  const initiatingSection = data.template.sections.find((section) => section.id === "initiating-devices");
  const notificationSection = data.template.sections.find((section) => section.id === "notification");
  const summarySection = data.template.sections.find((section) => section.id === "system-summary");

  const controlPanelRepeater = controlPanelSection?.fields.find((field): field is Extract<ReportFieldDefinition, { type: "repeater" }> => field.type === "repeater" && field.id === "controlPanels") ?? null;
  const initiatingRepeater = initiatingSection?.fields.find((field): field is Extract<ReportFieldDefinition, { type: "repeater" }> => field.type === "repeater" && field.id === "initiatingDevices") ?? null;
  const notificationRepeater = notificationSection?.fields.find((field): field is Extract<ReportFieldDefinition, { type: "repeater" }> => field.type === "repeater" && field.id === "notificationAppliances") ?? null;

  const controlPanelRows = controlPanelRepeater
    ? Array.isArray(controller.draft.sections["control-panel"]?.fields?.[controlPanelRepeater.id])
      ? controller.draft.sections["control-panel"]?.fields?.[controlPanelRepeater.id] as unknown as Array<Record<string, ReportPrimitiveValue>>
      : []
    : [];
  const initiatingRows = initiatingRepeater
    ? Array.isArray(controller.draft.sections["initiating-devices"]?.fields?.[initiatingRepeater.id])
      ? controller.draft.sections["initiating-devices"]?.fields?.[initiatingRepeater.id] as unknown as Array<Record<string, ReportPrimitiveValue>>
      : []
    : [];
  const notificationRows = notificationRepeater
    ? Array.isArray(controller.draft.sections.notification?.fields?.[notificationRepeater.id])
      ? controller.draft.sections.notification?.fields?.[notificationRepeater.id] as unknown as Array<Record<string, ReportPrimitiveValue>>
      : []
    : [];

  const blockingIssues = useMemo(() => {
    const issues: string[] = [];
    if (!(controller.draft.signatures.technician?.signerName && controller.draft.signatures.technician?.imageDataUrl)) {
      issues.push("Technician signature is required before finalizing.");
    }
    if (!(controller.draft.signatures.customer?.signerName && controller.draft.signatures.customer?.imageDataUrl)) {
      issues.push("Customer signature is required before finalizing.");
    }

    try {
      validateFinalizationDraft(controller.draft);
    } catch (error) {
      const message = error instanceof Error ? error.message : null;
      if (message && !issues.includes(message)) {
        issues.push(message);
      }
    }

    return issues;
  }, [controller.draft]);

  const warnings = useMemo(() => {
    const items: string[] = [];
    if (progress.preview.detectedDeficiencies.length > 0) {
      items.push(`${progress.preview.detectedDeficiencies.length} deficiency item${progress.preview.detectedDeficiencies.length === 1 ? "" : "s"} captured.`);
    }
    if (checklistCounts.failCount > 0) {
      items.push(`${checklistCounts.failCount} checks marked fail.`);
    }
    return items;
  }, [checklistCounts.failCount, progress.preview.detectedDeficiencies.length]);

  async function handleReportSelect(nextTaskId: string, nextMode: "edit" | "review" = mode) {
    await controller.persistCurrentDraftLocally();
    const href = nextMode === "review"
      ? `/app/tech/reports/${encodeURIComponent(inspectionId)}/${encodeURIComponent(nextTaskId)}/review`
      : `/app/tech/reports/${encodeURIComponent(inspectionId)}/${encodeURIComponent(nextTaskId)}`;
    router.push(href);
  }

  function toggleSection(sectionId: string) {
    setOpenSections((current) => ({ ...current, [sectionId]: !current[sectionId] }));
    controller.selectSection(sectionId);
  }

  function selectSection(sectionId: string) {
    setOpenSections((current) => ({ ...current, [sectionId]: true }));
    controller.selectSection(sectionId);
  }

  async function handleFinalize() {
    const result = await controller.finalizeReport();
    if (result.ok) {
      setFinalizeQueued(true);
    }
  }

  if (!controller.hydrated) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500 shadow-panel">
        Loading fire alarm inspection...
      </div>
    );
  }

  if (!controlPanelSection || !controlPanelRepeater || !initiatingSection || !initiatingRepeater || !notificationSection || !notificationRepeater || !summarySection) {
    return (
      <div className="rounded-[2rem] border border-rose-200 bg-white px-5 py-8 text-sm text-rose-700 shadow-panel">
        Fire alarm mobile sections are unavailable for this report.
      </div>
    );
  }

  if (mode === "review") {
    return (
      <MobileReviewScreen
        blockingIssues={blockingIssues}
        footer={(
          <div
            className="mobile-keyboard-hide fixed inset-x-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur"
            style={{ bottom: "calc(var(--mobile-tab-bar-offset, 5.5rem) + var(--keyboard-offset, 0px))", paddingBottom: "0.75rem" }}
          >
            <div className="mx-auto max-w-5xl">
              <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
                <p>{controller.saveState}</p>
                {progress.completedCount !== null && progress.totalCount !== null ? (
                  <p>{progress.completedCount} of {progress.totalCount} complete</p>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                  onClick={() => router.push(`/app/tech/reports/${encodeURIComponent(inspectionId)}/${encodeURIComponent(taskId)}`)}
                  type="button"
                >
                  Back to Report
                </button>
                <button
                  className="min-h-12 rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-[var(--tenant-primary-contrast)] disabled:opacity-50"
                  disabled={
                    !data.canFinalize ||
                    blockingIssues.length > 0 ||
                    controller.finalizeInFlight ||
                    controller.saveState === "Finalizing" ||
                    controller.saveState === "Finalize queued"
                  }
                  onClick={() => { void handleFinalize(); }}
                  type="button"
                >
                  Finalize Inspection
                </button>
              </div>
            </div>
          </div>
        )}
        saveState={controller.saveState}
        summaryCards={[
          { label: "Passed", value: String(checklistCounts.passCount) },
          { label: "Failed", value: String(checklistCounts.failCount) },
          { label: "N/A", value: String(checklistCounts.naCount) },
          { label: "Photos", value: String(checklistCounts.photoCount) },
          { label: "Technician signature", value: controller.draft.signatures.technician?.imageDataUrl ? "Ready" : "Missing" },
          { label: "Customer signature", value: controller.draft.signatures.customer?.imageDataUrl ? "Ready" : "Missing" }
        ]}
        title={data.inspectionTypeLabel}
        warnings={warnings}
      >
        <MobileReportSummaryBanner data={data} mode="review" onSelectReport={handleReportSelect} progress={progress} saveState={controller.saveState} />
        {finalizeQueued ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-panel">
            Finalization is saved on this device. TradeWorx will upload it automatically when service is available.
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <SignaturePad
            disabled={isReadOnly}
            label="Technician signature"
            onChange={(value) => controller.updateSignature("technician", controller.draft.signatures.technician?.signerName ?? "", value)}
            onSignerNameChange={(value) => controller.updateSignerName("technician", value)}
            signerName={controller.draft.signatures.technician?.signerName ?? ""}
            value={resolveStoredMediaSrc(data.reportId, controller.draft.signatures.technician?.imageDataUrl) ?? controller.draft.signatures.technician?.imageDataUrl}
          />
          <SignaturePad
            disabled={isReadOnly}
            label="Customer signature"
            onChange={(value) => controller.updateSignature("customer", controller.draft.signatures.customer?.signerName ?? "", value)}
            onSignerNameChange={(value) => controller.updateSignerName("customer", value)}
            signerName={controller.draft.signatures.customer?.signerName ?? ""}
            value={resolveStoredMediaSrc(data.reportId, controller.draft.signatures.customer?.imageDataUrl) ?? controller.draft.signatures.customer?.imageDataUrl}
          />
        </div>
        {(controller.errorMessage || controller.finalizeErrorMessage) ? (
          <p className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow-panel">
            {controller.finalizeErrorMessage ?? controller.errorMessage}
          </p>
        ) : null}
      </MobileReviewScreen>
    );
  }

  return (
    <MobileInspectionShell
      activeSectionId={activeSectionId}
      currentSectionLabel={currentSectionLabel}
      onSelectReport={handleReportSelect}
      onSelectSection={selectSection}
      progressLabel={progress.completedCount !== null && progress.totalCount !== null ? `${progress.completedCount} of ${progress.totalCount} complete` : null}
      progressPercent={progress.percent}
      reportMode="edit"
      reportStatus={progress.reportStatus}
      saveState={controller.saveState}
      sections={progress.sections}
      customerName={data.customerName}
      customerContactName={data.customerContactName}
      customerEmail={data.customerEmail}
      customerPhone={data.customerPhone}
      dispatchNotes={data.dispatchNotes}
      serviceAddress={data.serviceAddress}
      siteName={data.siteName}
      stickyFooter={(
        <div>
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
            <p>{controller.saveState}</p>
            {progress.completedCount !== null && progress.totalCount !== null ? (
              <p>{progress.completedCount} of {progress.totalCount} complete</p>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <button
              className="min-h-12 rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-[var(--tenant-primary-contrast)] disabled:opacity-50"
              disabled={isReadOnly}
              onClick={() => router.push(`/app/tech/reports/${encodeURIComponent(inspectionId)}/${encodeURIComponent(taskId)}/review`)}
              type="button"
            >
              Review & Complete
            </button>
          </div>
        </div>
      )}
      title={data.inspectionTypeLabel}
      workspace={data.inspectionWorkspace}
    >
      <MobileSectionList
        renderSection={(section) => (
            <MobileSectionCard
              issueCount={section.issueCount}
              isOpen={Boolean(resolvedOpenSections[section.sectionId])}
              key={section.sectionId}
            onToggle={() => toggleSection(section.sectionId)}
            status={section.status}
            summary={formatSectionSummary(section)}
            title={section.sectionLabel}
          >
            {section.sectionId === "control-panel" ? (
              <FireAlarmControlPanelSection
                controller={controller}
                data={data}
                isReadOnly={isReadOnly}
                field={controlPanelRepeater}
                rows={controlPanelRows}
                scalarFieldIds={controlPanelChecklistFieldIds}
                section={controlPanelSection}
                expandedRowKey={expandedRows["control-panel"] ?? null}
                onSetExpandedRow={(rowKey) => setExpandedRows((current) => ({ ...current, "control-panel": current["control-panel"] === rowKey ? null : rowKey }))}
              />
            ) : section.sectionId === "initiating-devices" ? (
              <FireAlarmRepeaterChecklistSection
                controller={controller}
                data={data}
                field={initiatingRepeater}
                isReadOnly={isReadOnly}
                rows={initiatingRows}
                sectionId="initiating-devices"
                expandedRowKey={expandedRows["initiating-devices"] ?? null}
                onSetExpandedRow={(rowKey) => setExpandedRows((current) => ({ ...current, "initiating-devices": current["initiating-devices"] === rowKey ? null : rowKey }))}
              />
            ) : section.sectionId === "notification" ? (
              <FireAlarmRepeaterChecklistSection
                controller={controller}
                data={data}
                field={notificationRepeater}
                isReadOnly={isReadOnly}
                rows={notificationRows}
                sectionId="notification"
                expandedRowKey={expandedRows.notification ?? null}
                onSetExpandedRow={(rowKey) => setExpandedRows((current) => ({ ...current, notification: current.notification === rowKey ? null : rowKey }))}
              />
            ) : (
              <FireAlarmSummarySection controller={controller} data={data} isReadOnly={isReadOnly} section={summarySection} />
            )}
          </MobileSectionCard>
        )}
        sections={progress.sections}
      />

      <FireAlarmLaborHoursSection controller={controller} isReadOnly={isReadOnly} summarySection={summarySection} />

      <FireAlarmReportPhotosSection controller={controller} data={data} disabled={isReadOnly} />

      {(controller.errorMessage || controller.finalizeErrorMessage) ? (
        <p className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow-panel">
          {controller.finalizeErrorMessage ?? controller.errorMessage}
        </p>
      ) : null}
    </MobileInspectionShell>
  );
}

function FireAlarmLaborHoursSection({
  controller,
  isReadOnly,
  summarySection
}: {
  controller: ReturnType<typeof useMobileReportDraftController>;
  isReadOnly: boolean;
  summarySection: TechnicianReportEditorData["template"]["sections"][number];
}) {
  const laborField = summarySection.fields.find((field): field is Exclude<ReportFieldDefinition, { type: "repeater" }> => field.type !== "repeater" && field.id === "laborHours");
  if (!laborField) {
    return null;
  }

  const value = getPrimitiveFieldValue(controller.draft, summarySection.id, laborField.id);
  const normalizedValue = value === null || value === undefined ? "" : String(value);
  const laborOptions = normalizedValue && !fireAlarmLaborHourOptions.includes(normalizedValue as typeof fireAlarmLaborHourOptions[number])
    ? [normalizedValue, ...fireAlarmLaborHourOptions]
    : [...fireAlarmLaborHourOptions];

  return (
    <section className="space-y-4 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Labor</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">Fire alarm labor hours</h3>
        </div>
        {Number(normalizedValue) > 0 ? (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
            Auto billing
          </span>
        ) : null}
      </div>
      <label className="block text-sm font-semibold text-slate-900">
        Labor Hours
        <select
          className="mt-3 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none focus:border-[var(--tenant-primary)] focus:ring-4 focus:ring-[rgb(var(--tenant-primary-rgb)/0.12)] disabled:bg-slate-100"
          disabled={isReadOnly}
          onChange={(event) => controller.updateSectionField(summarySection.id, laborField.id, event.target.value === "" ? "" : Number(event.target.value))}
          value={normalizedValue}
        >
          <option value="">Select labor hours</option>
          {laborOptions.map((hours) => (
            <option key={hours} value={hours}>{hours} hours</option>
          ))}
        </select>
      </label>
      {Number(normalizedValue) > 0 ? (
        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          {normalizedValue} labor hour{normalizedValue === "1" ? "" : "s"} will flow into ready-to-bill as Fire Alarm inspection labor when this report is finalized.
        </p>
      ) : null}
    </section>
  );
}

function FireAlarmReportPhotosSection({
  controller,
  data,
  disabled
}: {
  controller: ReturnType<typeof useMobileReportDraftController>;
  data: TechnicianReportEditorData;
  disabled: boolean;
}) {
  return (
    <section className="space-y-3 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Photos</p>
        <label className={`inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
          Take / Add Photos
          <input
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={disabled}
            multiple
            onChange={(event) => {
              void controller.addReportAttachments(event.target.files);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      {controller.draft.attachments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">No photos attached yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {controller.draft.attachments.map((attachment) => (
            <div key={attachment.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <Image alt={attachment.fileName} className="aspect-[4/3] w-full object-cover" height={260} src={resolveStoredMediaSrc(data.reportId, attachment.storageKey) ?? attachment.storageKey} unoptimized width={360} />
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{attachment.fileName}</p>
                  <p className="mt-1 text-xs text-slate-500">Report photo</p>
                </div>
                <button
                  className="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={disabled}
                  onClick={() => controller.removeReportAttachment(attachment.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MobileReportSummaryBanner({
  data,
  progress,
  saveState,
  mode,
  onSelectReport
}: {
  data: TechnicianReportEditorData;
  progress: ReturnType<typeof buildMobileInspectionProgressSummary>;
  saveState: string;
  mode: "edit" | "review";
  onSelectReport: (taskId: string, mode?: "edit" | "review") => void;
}) {
  return (
    <MobileInspectionShell
      activeSectionId={data.draft.activeSectionId ?? data.template.sections[0]?.id ?? ""}
      currentSectionLabel={null}
      onSelectReport={onSelectReport}
      onSelectSection={() => undefined}
      progressLabel={progress.completedCount !== null && progress.totalCount !== null ? `${progress.completedCount} of ${progress.totalCount} complete` : null}
      progressPercent={progress.percent}
      reportMode={mode}
      reportStatus={progress.reportStatus}
      saveState={saveState}
      sections={[]}
      customerName={data.customerName}
      customerContactName={data.customerContactName}
      customerEmail={data.customerEmail}
      customerPhone={data.customerPhone}
      dispatchNotes={data.dispatchNotes}
      serviceAddress={data.serviceAddress}
      siteName={data.siteName}
      title={data.inspectionTypeLabel}
      workspace={data.inspectionWorkspace}
    >
      <div />
    </MobileInspectionShell>
  );
}

function FireAlarmControlPanelSection({
  controller,
  data,
  isReadOnly,
  section,
  field,
  rows,
  scalarFieldIds,
  expandedRowKey,
  onSetExpandedRow
}: {
  controller: ReturnType<typeof useMobileReportDraftController>;
  data: TechnicianReportEditorData;
  isReadOnly: boolean;
  section: TechnicianReportEditorData["template"]["sections"][number];
  field: Extract<ReportFieldDefinition, { type: "repeater" }>;
  rows: Array<Record<string, ReportPrimitiveValue>>;
  scalarFieldIds: readonly string[];
  expandedRowKey: string | null;
  onSetExpandedRow: (rowKey: string) => void;
}) {
  const { confirm, dialog } = useConfirmDialog();
  const scalarFields = scalarFieldIds
    .map((fieldId) => section.fields.find((candidate): candidate is Exclude<ReportFieldDefinition, { type: "repeater" }> => candidate.type !== "repeater" && candidate.id === fieldId))
    .filter((candidate): candidate is Exclude<ReportFieldDefinition, { type: "repeater" }> => Boolean(candidate));
  const monitoringFields = monitoringInfoFieldIds
    .map((fieldId) => section.fields.find((candidate): candidate is Exclude<ReportFieldDefinition, { type: "repeater" }> => candidate.type !== "repeater" && candidate.id === fieldId))
    .filter((candidate): candidate is Exclude<ReportFieldDefinition, { type: "repeater" }> => Boolean(candidate));

  return (
    <div className="space-y-5">
      <MobileRepeatableRows
        addLabel={field.addLabel ?? "Add control panel"}
        disabled={isReadOnly}
        description={field.description}
        expandedRowKey={expandedRowKey}
        onAddRow={() => controller.addRepeaterRow(section.id, field)}
        onRemoveRow={async (rowKey) => {
          const rowIndex = rows.findIndex((row, index) => getRowKey(row, field.id, index) === rowKey);
          if (rowIndex < 0) {
            return;
          }
          const row = rows[rowIndex];
          if (!row) {
            return;
          }
          if (hasMeaningfulRowData(row)) {
            const confirmed = await confirm({
              eyebrow: "Control panel",
              title: "Remove this control panel entry?",
              description: "This removes the entered control panel details from the current report draft.",
              confirmLabel: "Remove entry",
              cancelLabel: "Cancel",
              variant: "danger"
            });
            if (!confirmed) {
              return;
            }
          }
          controller.removeRepeaterRow(section.id, field.id, rowIndex);
        }}
        onToggleRow={onSetExpandedRow}
        renderExpandedRow={(rowKey) => {
          const rowIndex = rows.findIndex((row, index) => getRowKey(row, field.id, index) === rowKey);
          const row = rows[rowIndex];
          if (!row) {
            return null;
          }
          return (
            <FireAlarmControlPanelRowEditor
              controller={controller}
              data={data}
              field={field}
              isReadOnly={isReadOnly}
              row={row}
              rowIndex={rowIndex}
              sectionId={section.id}
            />
          );
        }}
        rows={rows.map((row, rowIndex) => ({
          key: getRowKey(row, field.id, rowIndex),
          title: String(row.panelName || row.location || `Control panel ${rowIndex + 1}`),
          subtitle: [row.manufacturer, row.model].filter(Boolean).join(" • ") || null,
          status: rowCompletionStatus({
            row,
            completionFieldIds: ["batteryLoadTest"],
            deficiencyFieldIds: ["batteryChargeLevel", "batteryLoadTest"]
          }),
          summary: [row.location, row.communicationPathType].filter(Boolean).join(" • ") || null,
          issueCount: ["low", "high", "fail", "deficiency"].some((value) => [row.batteryChargeLevel, row.batteryLoadTest].includes(value as ReportPrimitiveValue)) ? 1 : 0
        }))}
        title="Control panels"
      />
      {dialog}

      {monitoringFields.length > 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Monitoring</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">Monitoring company information</h3>
            <p className="mt-1 text-sm text-slate-500">Capture the central station details so they appear near the top of the final fire alarm PDF.</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {monitoringFields.map((monitoringField) => (
              <div key={monitoringField.id} className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">{monitoringField.label}</label>
                <FieldInput
                  disabled={isReadOnly}
                  field={monitoringField}
                  onChange={(value) => controller.updateSectionField(section.id, monitoringField.id, value)}
                  reportId={data.reportId}
                  value={getPrimitiveFieldValue(controller.draft, section.id, monitoringField.id)}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {scalarFields.map((field) => (
          <MobileChecklistItem
            disabled={isReadOnly}
            description={field.description}
            key={field.id}
            onSelect={(value) => controller.updateSectionField(section.id, field.id, value)}
            options={(field.options ?? []).map((option) => ({ label: option.label, value: option.value, tone: mapOptionTone(option.value) }))}
            title={field.label}
            value={String(getPrimitiveFieldValue(controller.draft, section.id, field.id))}
          />
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-900">Control panel comments</label>
        <textarea
          className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
          disabled={isReadOnly}
          onChange={(event) => controller.updateSectionField(section.id, "controlPanelComments", event.target.value)}
          placeholder="Document primary power, battery, indication, monitoring, or cabinet concerns."
          value={String(controller.draft.sections[section.id]?.fields?.controlPanelComments ?? "")}
        />
      </div>
    </div>
  );
}

function FireAlarmControlPanelRowEditor({
  controller,
  data,
  isReadOnly,
  sectionId,
  field,
  row,
  rowIndex
}: {
  controller: ReturnType<typeof useMobileReportDraftController>;
  data: TechnicianReportEditorData;
  isReadOnly: boolean;
  sectionId: string;
  field: Extract<ReportFieldDefinition, { type: "repeater" }>;
  row: Record<string, ReportPrimitiveValue>;
  rowIndex: number;
}) {
  const visibleFields = field.rowFields.filter((rowField) => !rowField.hidden && rowField.id !== "assetTag" && isFieldVisible(rowField, row));
  return (
    <div className="space-y-4">
      {visibleFields.map((rowField) => (
        <div key={rowField.id} className="space-y-2">
          <label className="text-sm font-semibold text-slate-900">{rowField.label}</label>
          <FieldInput
            disabled={isReadOnly}
            field={rowField}
            onChange={(value) => controller.updateRepeaterRowField(sectionId, field, rowIndex, rowField.id, value, {
              debounceKey: rowField.type === "text" || rowField.type === "number" ? `${sectionId}:${field.id}:${rowIndex}:${rowField.id}` : undefined,
              immediateQueue: rowField.type === "select" || rowField.type === "boolean"
            })}
            onPhotoChange={(files) => { void controller.updateRepeaterRowPhoto(sectionId, field, rowIndex, rowField.id, files); }}
            reportId={data.reportId}
            value={row[rowField.id] ?? ""}
          />
        </div>
      ))}
    </div>
  );
}

function FireAlarmRepeaterChecklistSection({
  controller,
  data,
  isReadOnly,
  sectionId,
  field,
  rows,
  expandedRowKey,
  onSetExpandedRow
}: {
  controller: ReturnType<typeof useMobileReportDraftController>;
  data: TechnicianReportEditorData;
  isReadOnly: boolean;
  sectionId: string;
  field: Extract<ReportFieldDefinition, { type: "repeater" }>;
  rows: Array<Record<string, ReportPrimitiveValue>>;
  expandedRowKey: string | null;
  onSetExpandedRow: (rowKey: string) => void;
}) {
  const { confirm, dialog } = useConfirmDialog();
  const completionFieldIds = field.completionFieldIds ?? [];
  const deficiencyFieldIds = [...(field.deficiencyFieldIds ?? []), ...(field.deficiencyFieldId ? [field.deficiencyFieldId] : [])];

  return (
    <>
    <MobileRepeatableRows
      addLabel={field.addLabel ?? "Add item"}
      disabled={isReadOnly}
      description={field.description}
      expandedRowKey={expandedRowKey}
      onAddRow={() => controller.addRepeaterRow(sectionId, field)}
      onRemoveRow={async (rowKey) => {
        const rowIndex = rows.findIndex((row, index) => getRowKey(row, field.id, index) === rowKey);
        if (rowIndex < 0) {
          return;
        }
        const row = rows[rowIndex];
        if (!row) {
          return;
        }
        if (hasMeaningfulRowData(row)) {
          const confirmed = await confirm({
            eyebrow: "Checklist item",
            title: "Remove this item?",
            description: "This removes the entered item details from the current report draft.",
            confirmLabel: "Remove item",
            cancelLabel: "Cancel",
            variant: "danger"
          });
          if (!confirmed) {
            return;
          }
        }
        controller.removeRepeaterRow(sectionId, field.id, rowIndex);
      }}
      onToggleRow={onSetExpandedRow}
      renderExpandedRow={(rowKey) => {
        const rowIndex = rows.findIndex((row, index) => getRowKey(row, field.id, index) === rowKey);
        const row = rows[rowIndex];
        if (!row) {
          return null;
        }
        return (
          <FireAlarmRepeaterRowEditor
            completionFieldIds={completionFieldIds}
            controller={controller}
            data={data}
            deficiencyFieldIds={deficiencyFieldIds}
            field={field}
            isReadOnly={isReadOnly}
            row={row}
            rowIndex={rowIndex}
            sectionId={sectionId}
          />
        );
      }}
      rows={rows.map((row, rowIndex) => ({
        key: getRowKey(row, field.id, rowIndex),
        title: String(row.deviceTypeOther || row.deviceType || row.applianceTypeCustom || row.applianceType || `Item ${rowIndex + 1}`),
        subtitle: String(row.location || `Row ${rowIndex + 1}`),
        status: rowCompletionStatus({ row, completionFieldIds, deficiencyFieldIds }),
        summary: [row.serialNumber, row.quantity].filter(Boolean).join(" • ") || null,
        issueCount: deficiencyFieldIds.some((fieldId) => ["fail", "deficiency", "damaged", "attention", "poor", "low", "high", "needs_repair"].includes(String(row[fieldId] ?? "").toLowerCase())) ? 1 : 0
      }))}
      title={field.label}
    />
    {dialog}
    </>
  );
}

function FireAlarmRepeaterRowEditor({
  controller,
  data,
  isReadOnly,
  sectionId,
  field,
  row,
  rowIndex,
  completionFieldIds,
  deficiencyFieldIds
}: {
  controller: ReturnType<typeof useMobileReportDraftController>;
  data: TechnicianReportEditorData;
  isReadOnly: boolean;
  sectionId: string;
  field: Extract<ReportFieldDefinition, { type: "repeater" }>;
  row: Record<string, ReportPrimitiveValue>;
  rowIndex: number;
  completionFieldIds: string[];
  deficiencyFieldIds: string[];
}) {
  const visibleFields = field.rowFields.filter((rowField) => !rowField.hidden && rowField.id !== "assetTag" && isFieldVisible(rowField, row));
  const checklistFields = visibleFields.filter((rowField) => rowField.type === "select" && (completionFieldIds.includes(rowField.id) || deficiencyFieldIds.includes(rowField.id)));
  const detailFields = visibleFields.filter((rowField) => !checklistFields.includes(rowField));
  const deficiencySeverityField = field.rowFields.find((rowField) => rowField.hidden && rowField.id === "deficiencySeverity");
  const deficiencyNotesField = field.rowFields.find((rowField) => rowField.hidden && rowField.id === "deficiencyNotes");
  const deficiencyPhotoField = field.rowFields.find((rowField) => rowField.hidden && rowField.id === "deficiencyPhoto");
  const hasFailure = deficiencyFieldIds.some((fieldId) => ["fail", "deficiency", "damaged", "attention", "poor", "low", "high", "needs_repair"].includes(String(row[fieldId] ?? "").toLowerCase()));

  return (
    <div className="space-y-4">
      {detailFields.map((rowField) => (
        <div key={rowField.id} className="space-y-2">
          <label className="text-sm font-semibold text-slate-900">{rowField.label}</label>
          <FieldInput
            disabled={isReadOnly}
            field={rowField}
            onChange={(value) => controller.updateRepeaterRowField(sectionId, field, rowIndex, rowField.id, value, {
              debounceKey: rowField.type === "text" || rowField.type === "number" ? `${sectionId}:${field.id}:${rowIndex}:${rowField.id}` : undefined,
              immediateQueue: rowField.type === "select" || rowField.type === "boolean"
            })}
            reportId={data.reportId}
            value={row[rowField.id] ?? ""}
          />
        </div>
      ))}

      {checklistFields.map((rowField) => (
        <MobileChecklistItem
          disabled={isReadOnly}
          description={rowField.description}
          key={rowField.id}
          note={deficiencyNotesField ? String(row[deficiencyNotesField.id] ?? "") : ""}
          onNoteChange={hasFailure && deficiencyNotesField ? (value) => controller.updateRepeaterRowField(sectionId, field, rowIndex, deficiencyNotesField.id, value, { debounceKey: `${sectionId}:${field.id}:${rowIndex}:deficiencyNotes` }) : undefined}
          onPhotoChange={hasFailure && deficiencyPhotoField ? (files) => { void controller.updateRepeaterRowPhoto(sectionId, field, rowIndex, deficiencyPhotoField.id, files); } : undefined}
          onSelect={(value) => controller.updateRepeaterRowField(sectionId, field, rowIndex, rowField.id, value, { immediateQueue: true })}
          onSeverityChange={hasFailure && deficiencySeverityField ? (value) => controller.updateRepeaterRowField(sectionId, field, rowIndex, deficiencySeverityField.id, value, { immediateQueue: true }) : undefined}
          options={(rowField.options ?? []).map((option) => ({ label: option.label, value: option.value, tone: mapOptionTone(option.value) }))}
          photoCount={hasFailure && deficiencyPhotoField && row[deficiencyPhotoField.id] ? 1 : 0}
          photoSrc={hasFailure && deficiencyPhotoField ? resolveStoredMediaSrc(data.reportId, String(row[deficiencyPhotoField.id] ?? "")) ?? String(row[deficiencyPhotoField.id] ?? "") : null}
          severity={deficiencySeverityField ? String(row[deficiencySeverityField.id] ?? "medium") : "medium"}
          showFailurePanel={hasFailure}
          title={rowField.label}
          value={String(row[rowField.id] ?? "")}
        />
      ))}
    </div>
  );
}

function FireAlarmSummarySection({
  controller,
  data,
  isReadOnly,
  section
}: {
  controller: ReturnType<typeof useMobileReportDraftController>;
  data: TechnicianReportEditorData;
  isReadOnly: boolean;
  section: TechnicianReportEditorData["template"]["sections"][number];
}) {
  const editableFields = summaryEditableFieldIds
    .map((fieldId) => section.fields.find((candidate): candidate is Exclude<ReportFieldDefinition, { type: "repeater" }> => candidate.type !== "repeater" && candidate.id === fieldId))
    .filter((candidate): candidate is Exclude<ReportFieldDefinition, { type: "repeater" }> => Boolean(candidate));

  return (
    <MobileSummarySection title="General system summary">
      {editableFields.map((field) => (
        <div key={field.id} className="space-y-2">
          <label className="text-sm font-semibold text-slate-900">{field.label}</label>
          <FieldInput
            disabled={isReadOnly}
            field={field}
            onChange={(value) => controller.updateSectionField(section.id, field.id, value)}
            reportId={data.reportId}
            value={getPrimitiveFieldValue(controller.draft, section.id, field.id)}
          />
        </div>
      ))}
    </MobileSummarySection>
  );
}

function getRowKey(row: Record<string, ReportPrimitiveValue>, fallbackPrefix: string, rowIndex: number) {
  return typeof row.__rowId === "string" ? row.__rowId : `${fallbackPrefix}_${rowIndex}`;
}

function getPrimitiveFieldValue(
  draft: ReportDraft,
  sectionId: string,
  fieldId: string
): ReportPrimitiveValue {
  const value = draft.sections[sectionId]?.fields?.[fieldId];
  return Array.isArray(value) ? "" : (value ?? "");
}
