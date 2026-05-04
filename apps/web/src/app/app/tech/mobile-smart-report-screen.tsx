"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { SetStateAction } from "react";
import { useRouter } from "next/navigation";

import {
  buildMobileInspectionProgressSummary,
  buildReportPreview,
  collectFinalizationValidationIssues,
  isFieldVisible,
  type MobileInspectionSectionProgress,
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
  MobileSectionList
} from "./mobile-inspection-framework";
import type { TechnicianReportEditorData } from "./report-editor";
import { SignaturePad } from "./signature-pad";
import { useMobileReportDraftController } from "./use-mobile-report-draft-controller";

type SmartTab = "overview" | "checklist" | "issues" | "photos" | "review";

const smartTabs: Array<{ id: SmartTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "checklist", label: "Checklist" },
  { id: "issues", label: "Issues" },
  { id: "photos", label: "Photos" },
  { id: "review", label: "Review" }
];

const negativeValues = new Set(["fail", "deficiency", "damaged", "attention", "poor", "low", "high", "needs_repair", "no"]);

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

function scalarValue(value: unknown): ReportPrimitiveValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  return "";
}

function displayValue(value: unknown) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function rowKey(row: Record<string, ReportPrimitiveValue>, index: number) {
  return typeof row.__rowId === "string" && row.__rowId ? row.__rowId : `row-${index}`;
}

function rowTitle(row: Record<string, ReportPrimitiveValue>, index: number) {
  const candidate = [
    row.location,
    row.deviceLocation,
    row.applianceLocation,
    row.nozzleLocation,
    row.extinguisherId,
    row.identifier,
    row.deviceType,
    row.extinguisherType,
    row.systemName,
    row.name
  ].map(displayValue).find(Boolean);

  return candidate || `Item #${index + 1}`;
}

function rowSubtitle(row: Record<string, ReportPrimitiveValue>) {
  const parts = [
    row.deviceType,
    row.extinguisherType,
    row.manufacturer,
    row.model,
    row.zone,
    row.address
  ].map(displayValue).filter(Boolean);

  return parts.slice(0, 3).join(" • ") || null;
}

function isNegative(value: unknown) {
  return negativeValues.has(String(value ?? "").trim().toLowerCase());
}

function countRowIssues(row: Record<string, ReportPrimitiveValue>) {
  return Object.values(row).filter(isNegative).length;
}

function visitStatusLabel(row: Record<string, ReportPrimitiveValue>) {
  switch (row.visitStatus) {
    case "not_reviewed":
      return "Previous";
    case "confirmed":
      return "Confirmed";
    case "updated":
      return "Updated";
    case "new":
      return "New";
    case "removed":
      return "Removed";
    case "serviced":
      return "Serviced";
    case "replaced":
      return "Replaced";
    default:
      return null;
  }
}

function rowStatusLabel(row: Record<string, ReportPrimitiveValue>) {
  const visitLabel = visitStatusLabel(row);
  if (visitLabel) {
    return visitLabel;
  }

  return countRowIssues(row) > 0 ? "Issue" : "Ready";
}

function firstPhotoValue(values: Record<string, ReportPrimitiveValue>, fields: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>) {
  const photoField = fields.find((field) => field.type === "photo" && displayValue(values[field.id]));
  return photoField ? displayValue(values[photoField.id]) : "";
}

export function MobileSmartReportScreen({
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
  const [activeTab, setActiveTab] = useState<SmartTab>(mode === "review" ? "review" : "overview");
  const [finalizeQueued, setFinalizeQueued] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, string | null>>({});

  const progress = useMemo(
    () => buildMobileInspectionProgressSummary(data.template, controller.draft, data.reportStatus),
    [controller.draft, data.reportStatus, data.template]
  );
  const preview = useMemo(() => buildReportPreview(controller.draft), [controller.draft]);
  const validationIssues = useMemo(() => collectFinalizationValidationIssues(controller.draft), [controller.draft]);
  const isReadOnly = !data.canEdit || data.reportStatus === "finalized" || controller.saveState === "Finalized";
  const activeSectionId = controller.draft.activeSectionId ?? data.template.sections[0]?.id ?? "";
  const activeSection = data.template.sections.find((section) => section.id === activeSectionId) ?? data.template.sections[0];
  const progressLabel = progress.completedCount !== null && progress.totalCount !== null && progress.totalCount > 0
    ? `${progress.completedCount} of ${progress.totalCount} complete`
    : null;

  async function handleReportSelect(nextTaskId: string, nextMode: "edit" | "review" = activeTab === "review" ? "review" : "edit") {
    await controller.persistCurrentDraftLocally();
    const href = nextMode === "review"
      ? `/app/tech/reports/${encodeURIComponent(inspectionId)}/${encodeURIComponent(nextTaskId)}/review`
      : `/app/tech/reports/${encodeURIComponent(inspectionId)}/${encodeURIComponent(nextTaskId)}`;
    router.push(href);
  }

  function handleSectionSelect(sectionId: string) {
    controller.selectSection(sectionId);
    setActiveTab("checklist");
    setOpenSections((current) => ({ ...current, [sectionId]: true }));
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
        Loading report from this device...
      </div>
    );
  }

  return (
    <MobileInspectionShell
      activeSectionId={activeSectionId}
      currentSectionLabel={activeSection?.label ?? null}
      customerContactName={data.customerContactName}
      customerEmail={data.customerEmail}
      customerName={data.customerName}
      customerPhone={data.customerPhone}
      onSelectReport={handleReportSelect}
      onSelectSection={handleSectionSelect}
      progressLabel={progressLabel}
      progressPercent={progress.percent}
      reportMode={activeTab === "review" ? "review" : "edit"}
      reportStatus={progress.reportStatus}
      saveState={controller.saveState}
      sections={progress.sections}
      siteName={data.siteName}
      stickyFooter={(
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{controller.saveState}</p>
            <p className="text-xs text-slate-500">{validationIssues.length > 0 ? `${validationIssues.length} item${validationIssues.length === 1 ? "" : "s"} need attention` : "Ready when signatures are complete"}</p>
          </div>
          <button
            className="min-h-12 rounded-2xl bg-[var(--tenant-primary)] px-5 py-3 text-sm font-semibold text-[var(--tenant-primary-contrast)] disabled:opacity-50"
            disabled={isReadOnly}
            onClick={() => setActiveTab("review")}
            type="button"
          >
            Review & Complete
          </button>
        </div>
      )}
      title={data.inspectionTypeLabel}
      workspace={data.inspectionWorkspace}
    >
      <div className="sticky top-0 z-10 -mx-4 bg-slate-50/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="grid grid-cols-5 gap-2 rounded-[1.35rem] border border-slate-200 bg-white p-1 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          {smartTabs.map((tab) => (
            <button
              key={tab.id}
              className={`min-h-11 rounded-[1rem] px-2 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "bg-[var(--tenant-primary)] text-[var(--tenant-primary-contrast)]"
                  : "text-slate-600"
              }`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {controller.errorMessage ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{controller.errorMessage}</p>
      ) : null}
      {controller.finalizeErrorMessage ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{controller.finalizeErrorMessage}</p>
      ) : null}
      {finalizeQueued ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Finalization is saved on this device. TradeWorx will upload it automatically when service is available.
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <OverviewTab data={data} preview={preview} progress={progress} />
      ) : null}

      {activeTab === "checklist" ? (
        <ChecklistTab
          controller={controller}
          data={data}
          expandedRows={expandedRows}
          isReadOnly={isReadOnly}
          openSections={openSections}
          progress={progress}
          setExpandedRows={setExpandedRows}
          setOpenSections={setOpenSections}
        />
      ) : null}

      {activeTab === "issues" ? (
        <IssuesTab data={data} draft={controller.draft} preview={preview} validationIssues={validationIssues} />
      ) : null}

      {activeTab === "photos" ? (
        <PhotosTab data={data} draft={controller.draft} />
      ) : null}

      {activeTab === "review" ? (
        <ReviewTab
          controller={controller}
          data={data}
          isReadOnly={isReadOnly}
          onFinalize={handleFinalize}
          preview={preview}
          progress={progress}
          validationIssues={validationIssues}
        />
      ) : null}
    </MobileInspectionShell>
  );
}

function OverviewTab({
  data,
  progress,
  preview
}: {
  data: TechnicianReportEditorData;
  progress: ReturnType<typeof buildMobileInspectionProgressSummary>;
  preview: ReturnType<typeof buildReportPreview>;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Report overview</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{data.inspectionTypeLabel}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{data.template.description}</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Status", progress.reportStatus],
          ["Progress", progress.percent !== null ? `${progress.percent}%` : "Not started"],
          ["Issues", String(preview.deficiencyCount + preview.manualDeficiencyCount)],
          ["Photos", String(preview.attachmentCount)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-panel">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
          </div>
        ))}
      </div>
      {data.draft.context.priorReportSummary ? (
        <section className="rounded-[1.75rem] border border-blue-100 bg-blue-50/70 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">Prior context</p>
          <p className="mt-2 text-sm leading-6 text-blue-950">{data.draft.context.priorReportSummary}</p>
        </section>
      ) : null}
    </div>
  );
}

function ChecklistTab({
  data,
  controller,
  progress,
  openSections,
  setOpenSections,
  expandedRows,
  setExpandedRows,
  isReadOnly
}: {
  data: TechnicianReportEditorData;
  controller: ReturnType<typeof useMobileReportDraftController>;
  progress: ReturnType<typeof buildMobileInspectionProgressSummary>;
  openSections: Record<string, boolean>;
  setOpenSections: (value: SetStateAction<Record<string, boolean>>) => void;
  expandedRows: Record<string, string | null>;
  setExpandedRows: (value: SetStateAction<Record<string, string | null>>) => void;
  isReadOnly: boolean;
}) {
  const activeSectionId = controller.draft.activeSectionId ?? data.template.sections[0]?.id ?? "";

  return (
    <MobileSectionList
      sections={progress.sections}
      renderSection={(sectionProgress) => {
        const section = data.template.sections.find((item) => item.id === sectionProgress.sectionId);
        if (!section) {
          return null;
        }

        const isOpen = openSections[section.id] ?? section.id === activeSectionId;
        const sectionState = controller.draft.sections[section.id] ?? { status: "pending", notes: "", fields: {} };
        const fields = sectionState.fields as Record<string, ReportPrimitiveValue>;

        return (
          <MobileSectionCard
            key={section.id}
            isOpen={isOpen}
            issueCount={sectionProgress.issueCount}
            onToggle={() => {
              controller.selectSection(section.id);
              setOpenSections((current) => ({ ...current, [section.id]: !isOpen }));
            }}
            status={sectionProgress.status}
            summary={formatSectionSummary(sectionProgress)}
            title={section.label}
          >
            <div className="space-y-4">
              {section.description ? <p className="text-sm leading-6 text-slate-500">{section.description}</p> : null}
              {section.fields.map((field) => {
                if (field.type === "repeater") {
                  const rows = Array.isArray(fields[field.id])
                    ? fields[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>>
                    : [];
                  return (
                    <MobileRepeatableRows
                      key={field.id}
                      addLabel={field.addLabel ?? "Add item"}
                      description={field.description}
                      disabled={isReadOnly}
                      expandedRowKey={expandedRows[`${section.id}:${field.id}`] ?? null}
                      onAddRow={() => controller.addRepeaterRow(section.id, field)}
                      onRemoveRow={(_, rowIndex = -1) => {
                        const nextIndex = rowIndex >= 0 ? rowIndex : rows.findIndex((row, index) => rowKey(row, index) === expandedRows[`${section.id}:${field.id}`]);
                        if (nextIndex >= 0) {
                          controller.removeRepeaterRow(section.id, field.id, nextIndex);
                        }
                      }}
                      onToggleRow={(key) => setExpandedRows((current) => ({ ...current, [`${section.id}:${field.id}`]: current[`${section.id}:${field.id}`] === key ? null : key }))}
                      renderExpandedRow={(key) => {
                        const rowIndex = rows.findIndex((row, index) => rowKey(row, index) === key);
                        const row = rows[rowIndex];
                        if (!row || rowIndex < 0) {
                          return null;
                        }
                        return (
                          <div className="space-y-4">
                            {typeof row.sourceReportId === "string" && row.sourceReportId ? (
                              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
                                <span className="font-semibold">Carried forward.</span> Confirm it, update details, mark service performed, or remove it for this visit.
                              </div>
                            ) : null}
                            {field.rowFields
                              .filter((rowField) => isFieldVisible(rowField, row))
                              .map((rowField) => (
                                <FieldControl
                                  key={rowField.id}
                                  disabled={isReadOnly || Boolean(rowField.readOnly)}
                                  field={rowField}
                                  onChange={(value) => controller.updateRepeaterRowField(section.id, field, rowIndex, rowField.id, value, { immediateQueue: rowField.type !== "text" })}
                                  onPhotoChange={(files) => controller.updateRepeaterRowPhoto(section.id, field, rowIndex, rowField.id, files)}
                                  reportId={data.reportId}
                                  value={scalarValue(row[rowField.id])}
                                />
                              ))}
                          </div>
                        );
                      }}
                      rows={rows.map((row, index) => ({
                        key: rowKey(row, index),
                        title: rowTitle(row, index),
                        subtitle: rowSubtitle(row),
                        status: rowStatusLabel(row),
                        issueCount: countRowIssues(row)
                      }))}
                      title={field.label}
                    />
                  );
                }

                if (!isFieldVisible(field, fields)) {
                  return null;
                }

                return (
                  <FieldControl
                    key={field.id}
                    disabled={isReadOnly || Boolean(field.readOnly)}
                    field={field}
                    onChange={(value) => controller.updateSectionField(section.id, field.id, value)}
                    onPhotoChange={(files) => controller.updateSectionPhotoField(section.id, field.id, files)}
                    reportId={data.reportId}
                    value={scalarValue(fields[field.id])}
                  />
                );
              })}
            </div>
          </MobileSectionCard>
        );
      }}
    />
  );
}

function FieldControl({
  field,
  value,
  onChange,
  onPhotoChange,
  reportId,
  disabled
}: {
  field: Exclude<ReportFieldDefinition, { type: "repeater" }>;
  value: ReportPrimitiveValue;
  onChange: (value: ReportPrimitiveValue) => void;
  onPhotoChange: (files: FileList | null) => void;
  reportId: string;
  disabled: boolean;
}) {
  if (field.type === "select") {
    const options = field.options ?? [];
    return (
      <MobileChecklistItem
        description={field.description}
        disabled={disabled}
        onSelect={onChange}
        options={options.map((option) => ({ label: option.label, value: option.value, tone: mapOptionTone(option.value) }))}
        showFailurePanel={isNegative(value)}
        title={field.itemLabel ?? field.label}
        value={String(value ?? "")}
      />
    );
  }

  if (field.type === "boolean") {
    return (
      <MobileChecklistItem
        description={field.description}
        disabled={disabled}
        onSelect={(nextValue) => onChange(nextValue === "yes")}
        options={[
          { label: "Yes", value: "yes", tone: "positive" },
          { label: "No", value: "no", tone: "neutral" }
        ]}
        title={field.itemLabel ?? field.label}
        value={value ? "yes" : "no"}
      />
    );
  }

  if (field.type === "photo") {
    const src = resolveStoredMediaSrc(reportId, displayValue(value)) ?? displayValue(value);
    return (
      <div className="rounded-[1.45rem] border border-slate-200 bg-slate-50 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">{field.label}</p>
            {field.description ? <p className="mt-1 text-sm text-slate-500">{field.description}</p> : null}
          </div>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
            {src ? "Replace" : "Add photo"}
            <input accept="image/*" className="hidden" disabled={disabled} onChange={(event) => { onPhotoChange(event.target.files); event.target.value = ""; }} type="file" />
          </label>
        </div>
        {src ? <Image alt={field.label} className="mt-3 aspect-[4/3] w-full rounded-2xl object-cover" height={280} src={src} unoptimized width={420} /> : null}
      </div>
    );
  }

  const sharedClassName = "min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none focus:border-[var(--tenant-primary)] focus:ring-4 focus:ring-[rgb(var(--tenant-primary-rgb)/0.12)] disabled:bg-slate-100";
  return (
    <label className="block rounded-[1.45rem] border border-slate-200 bg-slate-50 px-4 py-4">
      <span className="text-sm font-semibold text-slate-900">{field.label}</span>
      {field.description ? <span className="mt-1 block text-sm text-slate-500">{field.description}</span> : null}
      {field.type === "text" ? (
        <textarea
          className={`${sharedClassName} mt-3 min-h-28 resize-none`}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          value={String(value ?? "")}
        />
      ) : (
        <input
          className={`${sharedClassName} mt-3`}
          disabled={disabled}
          inputMode={field.type === "number" ? "numeric" : undefined}
          onChange={(event) => onChange(field.type === "number" ? Number(event.target.value || 0) : event.target.value)}
          placeholder={field.placeholder}
          step={field.type === "number" ? 1 : undefined}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={field.type === "number" && value === 0 ? "" : String(value ?? "")}
        />
      )}
    </label>
  );
}

function IssuesTab({
  data,
  draft,
  preview,
  validationIssues
}: {
  data: TechnicianReportEditorData;
  draft: TechnicianReportEditorData["draft"];
  preview: ReturnType<typeof buildReportPreview>;
  validationIssues: ReturnType<typeof collectFinalizationValidationIssues>;
}) {
  const fieldIssues = data.template.sections.flatMap((section) => {
    const fields = draft.sections[section.id]?.fields as Record<string, ReportPrimitiveValue> | undefined;
    return section.fields.flatMap((field) => {
      if (field.type === "repeater") {
        const rows = Array.isArray(fields?.[field.id]) ? fields?.[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>> : [];
        return rows.flatMap((row, rowIndex) => field.rowFields
          .filter((rowField) => isNegative(row[rowField.id]))
          .map((rowField) => ({
            id: `${section.id}:${field.id}:${rowIndex}:${rowField.id}`,
            title: rowTitle(row, rowIndex),
            body: `${rowField.label}: ${displayValue(row[rowField.id])}`,
            sectionLabel: section.label
          })));
      }

      return isNegative(fields?.[field.id])
        ? [{ id: `${section.id}:${field.id}`, title: field.label, body: displayValue(fields?.[field.id]), sectionLabel: section.label }]
        : [];
    });
  });

  const manualIssues = draft.deficiencies.map((deficiency) => ({
    id: deficiency.id,
    title: deficiency.title,
    body: deficiency.description,
    sectionLabel: deficiency.section ?? "Manual deficiency"
  }));

  const detectedIssues = preview.detectedDeficiencies.map((deficiency) => ({
    id: `${deficiency.sectionId}:${deficiency.rowKey}:${deficiency.fieldId}`,
    title: deficiency.rowLabel,
    body: deficiency.description,
    sectionLabel: deficiency.sectionLabel
  }));

  const issues = [...validationIssues.map((issue) => ({
    id: issue.itemId ?? issue.message,
    title: issue.label,
    body: issue.message,
    sectionLabel: issue.severity === "blocking" ? "Required before finalizing" : "Warning"
  })), ...fieldIssues, ...manualIssues, ...detectedIssues];

  return (
    <section className="space-y-3 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Issues</p>
      {issues.length === 0 ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">No issues recorded yet.</p>
      ) : issues.map((issue) => (
        <div key={issue.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{issue.sectionLabel}</p>
          <p className="mt-1 text-base font-semibold text-slate-950">{issue.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{issue.body}</p>
        </div>
      ))}
    </section>
  );
}

function PhotosTab({
  data,
  draft
}: {
  data: TechnicianReportEditorData;
  draft: TechnicianReportEditorData["draft"];
}) {
  const photos = [
    ...draft.attachments.map((attachment) => ({
      id: attachment.id,
      label: attachment.fileName,
      src: resolveStoredMediaSrc(data.reportId, attachment.storageKey) ?? attachment.storageKey,
      context: "Report photo"
    })),
    ...data.template.sections.flatMap((section) => {
      const fields = draft.sections[section.id]?.fields as Record<string, ReportPrimitiveValue> | undefined;
      return section.fields.flatMap((field) => {
        if (field.type === "photo" && displayValue(fields?.[field.id])) {
          return [{ id: `${section.id}:${field.id}`, label: field.label, src: resolveStoredMediaSrc(data.reportId, displayValue(fields?.[field.id])) ?? displayValue(fields?.[field.id]), context: section.label }];
        }
        if (field.type === "repeater") {
          const rows = Array.isArray(fields?.[field.id]) ? fields?.[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>> : [];
          return rows.flatMap((row, rowIndex) => {
            const src = firstPhotoValue(row, field.rowFields);
            return src ? [{ id: `${section.id}:${field.id}:${rowIndex}`, label: rowTitle(row, rowIndex), src: resolveStoredMediaSrc(data.reportId, src) ?? src, context: section.label }] : [];
          });
        }
        return [];
      });
    })
  ];

  return (
    <section className="space-y-3 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Photos</p>
      {photos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">No photos attached yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {photos.map((photo) => (
            <div key={photo.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <Image alt={photo.label} className="aspect-[4/3] w-full object-cover" height={260} src={photo.src} unoptimized width={360} />
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">{photo.label}</p>
                <p className="mt-1 text-xs text-slate-500">{photo.context}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewTab({
  data,
  controller,
  progress,
  preview,
  validationIssues,
  isReadOnly,
  onFinalize
}: {
  data: TechnicianReportEditorData;
  controller: ReturnType<typeof useMobileReportDraftController>;
  progress: ReturnType<typeof buildMobileInspectionProgressSummary>;
  preview: ReturnType<typeof buildReportPreview>;
  validationIssues: ReturnType<typeof collectFinalizationValidationIssues>;
  isReadOnly: boolean;
  onFinalize: () => void;
}) {
  const blockers = validationIssues.filter((issue) => issue.severity === "blocking").map((issue) => issue.message);
  const warnings = validationIssues.filter((issue) => issue.severity === "warning").map((issue) => issue.message);

  return (
    <MobileReviewScreen
      blockingIssues={blockers}
      footer={(
        <button
          className="min-h-12 w-full rounded-2xl bg-[var(--tenant-primary)] px-5 py-3 text-sm font-semibold text-[var(--tenant-primary-contrast)] disabled:opacity-50"
          disabled={isReadOnly || blockers.length > 0 || controller.finalizeInFlight || controller.saveState === "Finalizing" || controller.saveState === "Finalize queued"}
          onClick={() => onFinalize()}
          type="button"
        >
          {blockers.length > 0 ? "Resolve Required Items" : "Finalize Report"}
        </button>
      )}
      saveState={controller.saveState}
      summaryCards={[
        { label: "Completion", value: progress.percent !== null ? `${progress.percent}%` : "Not started" },
        { label: "Issues", value: String(preview.deficiencyCount + preview.manualDeficiencyCount) },
        { label: "Photos", value: String(preview.attachmentCount) },
        { label: "Signatures", value: `${(controller.draft.signatures.technician?.imageDataUrl ? 1 : 0) + (controller.draft.signatures.customer?.imageDataUrl ? 1 : 0)}/2` }
      ]}
      title={data.inspectionTypeLabel}
      warnings={warnings}
    >
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
    </MobileReviewScreen>
  );
}
