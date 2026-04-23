"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { applyRepeaterBulkAction, applyRepeaterRowSmartUpdate, applySectionFieldSmartUpdate, buildRepeaterRowDefaults, buildReportPreview, describeRepeaterRowLabel, duplicateRepeaterRows, getReportPhotoValidationError, isFieldVisible, prepareReportPhotoForDraft, reportPhotoPreparationConfig, shouldAutosaveDraft } from "@testworx/lib";
import type { ReportDraft } from "@testworx/lib";
import type { ReportFieldDefinition, ReportPrimitiveValue, ReportTemplateDefinition } from "@testworx/lib";

import { getLocalReportDraft, putLocalReportDraft, subscribeToOfflineChanges } from "./offline/offline-db";
import { initializeLocalReportRecord, queueReportDraftSync, queueReportFinalizeSync, startTechnicianSyncEngine } from "./offline/offline-sync";
import type { LocalReportDraftRecord } from "./offline/offline-types";
import { SignaturePad } from "./signature-pad";

export type TechnicianReportEditorData = {
  reportId: string;
  reportStatus: "draft" | "submitted" | "finalized";
  reportUpdatedAt: string;
  finalizedAt: string | null;
  correctionNotice?: string | null;
  canEdit: boolean;
  canFinalize: boolean;
  inspectionTypeLabel: string;
  defaultInspectionTypeLabel: string;
  customInspectionTypeLabel?: string | null;
  siteName: string;
  customerName: string;
  scheduledDateLabel: string;
  dispatchNotes?: string | null;
  paymentCollectionNotice?: string | null;
  template: ReportTemplateDefinition;
  draft: ReportDraft;
};

type BackupEnvelope = {
  draft: ReportDraft;
  backedUpAt: string;
  serverUpdatedAt: string;
};

const MAX_CLIENT_ATTACHMENT_COUNT = 16;

const saveStateTone: Record<string, string> = {
  Saved: "text-emerald-700",
  Saving: "text-amber-700",
  Error: "text-rose-700",
  "Unsaved changes": "text-slate-700",
  Finalized: "text-slate-700",
  "Saved offline": "text-blue-700",
  "Pending sync": "text-blue-700",
  Syncing: "text-blue-700",
  "Failed sync": "text-amber-700",
  Conflict: "text-rose-700"
};

const sectionStatusOptions = [
  { value: "pending", label: "Pending", activeClassName: "border-slate-300 bg-slate-100 text-slate-700" },
  { value: "pass", label: "Pass", activeClassName: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { value: "attention", label: "Attention", activeClassName: "border-amber-200 bg-amber-50 text-amber-800" },
  { value: "fail", label: "Fail", activeClassName: "border-rose-200 bg-rose-50 text-rose-800" }
] as const;

function buildReportSaveState(record: LocalReportDraftRecord | null, reportStatus: TechnicianReportEditorData["reportStatus"]) {
  if (!record) {
    return reportStatus === "finalized" ? "Finalized" : "Saved";
  }

  if (record.reportStatus === "finalized" && !record.pendingFinalize) {
    return "Finalized";
  }

  if (record.syncStatus === "conflict") {
    return "Conflict";
  }

  if (record.syncStatus === "failed") {
    return "Failed sync";
  }

  if (record.syncStatus === "syncing") {
    return "Syncing";
  }

  if (record.syncStatus === "pending") {
    return window.navigator.onLine ? "Pending sync" : "Saved offline";
  }

  return "Saved";
}

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

function isFieldDisabled(canEdit: boolean, reportStatus: TechnicianReportEditorData["reportStatus"], field: ReportFieldDefinition) {
  return !canEdit || reportStatus === "finalized" || Boolean(field.readOnly);
}

function isTechnicianVisibleField(field: ReportFieldDefinition) {
  return !field.hidden && !field.readOnly;
}

function fieldShellClassName(readOnly?: boolean) {
  return `w-full rounded-2xl border px-4 py-4 text-base ${readOnly ? "border-slate-200 bg-slate-100 text-slate-700" : "border-slate-200 bg-white"} disabled:bg-slate-50`;
}

function normalizeEditorText(value: string) {
  return value.toUpperCase();
}

function normalizeOptionLabel(value: string) {
  return value.toUpperCase();
}

function isStorageQuotaError(error: unknown) {
  return error instanceof DOMException && (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED"
  );
}

function getRepeaterDeficiencyFieldIds(field: Extract<ReportFieldDefinition, { type: "repeater" }>) {
  return [...new Set([...(field.deficiencyFieldIds ?? []), ...(field.deficiencyFieldId ? [field.deficiencyFieldId] : [])])];
}

function isDeficiencyResultValue(value: unknown) {
  return ["fail", "deficiency", "needs_repair"].includes(String(value ?? "").toLowerCase());
}

function rowHasDetectedDeficiency(field: Extract<ReportFieldDefinition, { type: "repeater" }>, row: Record<string, ReportPrimitiveValue>) {
  return getRepeaterDeficiencyFieldIds(field).some((fieldId) => isDeficiencyResultValue(row[fieldId]));
}

function countCapturedSignatures(draft: ReportDraft) {
  return ["technician", "customer"].filter((kind) => {
    const signature = draft.signatures[kind as "technician" | "customer"];
    return Boolean(signature?.signerName && signature?.imageDataUrl);
  }).length;
}

function sectionStatusLabel(summary: ReturnType<typeof buildReportPreview>["sectionSummaries"][number]) {
  if (summary.completionState === "complete") {
    return `✔ ${summary.sectionLabel}`;
  }

  if (summary.completionState === "partial") {
    return `⚠ ${summary.sectionLabel} (${summary.completedRows} / ${summary.totalRows})`;
  }

  return `○ ${summary.sectionLabel}`;
}

function formatSectionStatusText(value: string | null | undefined) {
  return (value ?? "pending").replaceAll("_", " ");
}

function formatSectionNavMeta(
  summary: ReturnType<typeof buildReportPreview>["sectionSummaries"][number] | undefined,
  status: string | null | undefined
) {
  const statusText = formatSectionStatusText(status);
  if (!summary?.totalRows) {
    return statusText;
  }

  return `${summary.completedRows}/${summary.totalRows} rows • ${statusText}`;
}

function toTechnicianFacingSaveMessage(message: string | null | undefined, action: "save" | "finalize") {
  const normalized = (message ?? "").trim();
  if (!normalized) {
    return action === "save"
      ? "Unable to save your report right now. Check your connection and try again."
      : "Unable to finalize this report right now. Review the report and try again.";
  }

  if (/report media storage is unavailable/i.test(normalized)) {
    return normalized;
  }

  if (/signatures are required|all report sections must be marked/i.test(normalized)) {
    return normalized;
  }

  return action === "save"
    ? "Unable to save your report right now. Check your connection and try again."
    : "Unable to finalize this report right now. Review the report and try again.";
}

function DispatchNotesBanner({ notes }: { notes: string | null | undefined }) {
  const trimmedNotes = notes?.trim();
  if (!trimmedNotes) {
    return null;
  }

  return (
    <div className="mt-3 rounded-[1.25rem] border border-amber-200 bg-amber-50/80 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-900">Dispatch notes</p>
      <p className="mt-1 text-sm leading-6 text-amber-950 whitespace-pre-wrap">{trimmedNotes}</p>
    </div>
  );
}

function ReportSelectControl({
  options,
  value,
  onChange,
  disabled,
  className,
  placeholder = "Select"
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const selectedOption = options.find((option) => option.value === value) ?? null;

  return (
    <div className="space-y-3">
      <div className="md:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {normalizeOptionLabel(selectedOption?.label ?? placeholder)}
        </p>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                className={`min-h-12 rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] transition ${
                  isActive
                    ? "border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary)] text-[var(--tenant-primary-contrast)]"
                    : "border-slate-200 bg-white text-slate-600"
                } disabled:opacity-50`}
                disabled={disabled}
                onClick={() => onChange(option.value)}
                type="button"
              >
                {normalizeOptionLabel(option.label)}
              </button>
            );
          })}
        </div>
      </div>
      <select
        className={`hidden min-h-14 uppercase md:block ${className ?? ""}`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{normalizeOptionLabel(placeholder)}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {normalizeOptionLabel(option.label)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ReportEditor({ data }: { data: TechnicianReportEditorData }) {
  const [draft, setDraft] = useState<ReportDraft>(data.draft);
  const [taskDisplayLabel, setTaskDisplayLabel] = useState(data.customInspectionTypeLabel ?? "");
  const [activeSectionId, setActiveSectionId] = useState<string>(data.draft.activeSectionId ?? data.template.sections[0]?.id ?? "");
  const [saveState, setSaveState] = useState(data.reportStatus === "finalized" ? "Finalized" : "Saved");
  const [showPreview, setShowPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [finalizeErrorMessage, setFinalizeErrorMessage] = useState<string | null>(null);
  const [backupWarning, setBackupWarning] = useState<string | null>(null);
  const lastSavedAtRef = useRef(Date.now());
  const saveInFlightRef = useRef(false);
  const autosaveBlockedRef = useRef(false);
  const latestDraftRef = useRef(draft);
  const saveDraftRef = useRef<((nextDraft: ReportDraft, reason: "timer" | "section" | "manual") => Promise<boolean>) | null>(null);
  const serverUpdatedAtRef = useRef(data.reportUpdatedAt);
  const localRecordRef = useRef<LocalReportDraftRecord | null>(null);
  const localInteractionStartedRef = useRef(false);
  const backupKey = `report-draft:${data.reportId}`;

  const persistBackup = useCallback((nextDraft: ReportDraft, serverUpdatedAt: string) => {
    const payload: BackupEnvelope = {
      draft: nextDraft,
      backedUpAt: new Date().toISOString(),
      serverUpdatedAt
    };

    try {
      window.localStorage.setItem(backupKey, JSON.stringify(payload));
      setBackupWarning(null);
      return true;
    } catch (error) {
      if (isStorageQuotaError(error)) {
        setBackupWarning("This report is too large for browser backup storage. Server autosave is still active.");
        return false;
      }

      throw error;
    }
  }, [backupKey]);

  useEffect(() => {
    const stored = window.localStorage.getItem(backupKey);
    if (!stored || data.reportStatus === "finalized") {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as BackupEnvelope | ReportDraft;
      const envelope = "draft" in parsed ? parsed : { draft: parsed as ReportDraft, backedUpAt: new Date().toISOString(), serverUpdatedAt: data.reportUpdatedAt };
      if (Date.parse(envelope.backedUpAt) > Date.parse(data.reportUpdatedAt)) {
        setDraft(envelope.draft);
        setActiveSectionId(envelope.draft.activeSectionId ?? data.draft.activeSectionId ?? data.template.sections[0]?.id ?? "");
        setSaveState("Unsaved changes");
        setDirty(true);
      }
    } catch {
      window.localStorage.removeItem(backupKey);
    }
  }, [backupKey, data.draft.activeSectionId, data.reportStatus, data.reportUpdatedAt, data.template.sections]);

  useEffect(() => {
    latestDraftRef.current = draft;
    if (data.reportStatus === "finalized") {
      return;
    }

    persistBackup(draft, serverUpdatedAtRef.current);
  }, [data.reportStatus, draft, persistBackup]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateLocalDraft() {
      startTechnicianSyncEngine();
      const initialRecord: LocalReportDraftRecord = {
        reportId: data.reportId,
        inspectionId: "",
        taskId: "",
        draft: data.draft,
        taskDisplayLabel: data.customInspectionTypeLabel ?? null,
        reportStatus: data.reportStatus,
        serverUpdatedAt: data.reportUpdatedAt,
        localUpdatedAt: data.reportUpdatedAt,
        finalizedAt: data.finalizedAt,
        syncStatus: "synced",
        pendingFinalize: false,
        lastError: null
      };

      const localRecord = await initializeLocalReportRecord(initialRecord);
      if (cancelled) {
        return;
      }

      localRecordRef.current = localRecord;
      if (!localInteractionStartedRef.current) {
        setDraft(localRecord.draft as ReportDraft);
        setTaskDisplayLabel(localRecord.taskDisplayLabel ?? data.customInspectionTypeLabel ?? "");
      }
      setSaveState(buildReportSaveState(localRecord, data.reportStatus));
      if (localRecord.lastError) {
        setErrorMessage(toTechnicianFacingSaveMessage(localRecord.lastError, localRecord.pendingFinalize ? "finalize" : "save"));
      }
    }

    void hydrateLocalDraft();

    const unsubscribe = subscribeToOfflineChanges(() => {
      void (async () => {
        const current = await getLocalReportDraft(data.reportId);
        if (!current || cancelled) {
          return;
        }

        localRecordRef.current = current;
        setSaveState(buildReportSaveState(current, data.reportStatus));
        if (current.lastError) {
          setErrorMessage(toTechnicianFacingSaveMessage(current.lastError, current.pendingFinalize ? "finalize" : "save"));
        } else if (!dirty) {
          setErrorMessage(null);
        }
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [data.customInspectionTypeLabel, data.draft, data.finalizedAt, data.reportId, data.reportStatus, data.reportUpdatedAt, dirty]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty && !saveInFlightRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const persistDraftLocally = useCallback(async (
    nextDraft: ReportDraft,
    input?: {
      reportStatus?: LocalReportDraftRecord["reportStatus"];
      pendingFinalize?: boolean;
      finalizedAt?: string | null;
      syncStatus?: LocalReportDraftRecord["syncStatus"];
      lastError?: string | null;
    }
  ) => {
    const record: LocalReportDraftRecord = {
      reportId: data.reportId,
      inspectionId: localRecordRef.current?.inspectionId ?? "",
      taskId: localRecordRef.current?.taskId ?? "",
      draft: nextDraft,
      taskDisplayLabel: taskDisplayLabel.trim() || null,
      reportStatus: input?.reportStatus ?? "draft",
      serverUpdatedAt: localRecordRef.current?.serverUpdatedAt ?? serverUpdatedAtRef.current,
      localUpdatedAt: new Date().toISOString(),
      finalizedAt: input?.finalizedAt ?? localRecordRef.current?.finalizedAt ?? null,
      syncStatus: input?.syncStatus ?? "pending",
      pendingFinalize: input?.pendingFinalize ?? false,
      lastError: input?.lastError ?? null
    };

    localRecordRef.current = record;
    await putLocalReportDraft(record);
    setSaveState(buildReportSaveState(record, data.reportStatus));
    return record;
  }, [data.reportId, data.reportStatus, taskDisplayLabel]);

  const saveDraft = useCallback(async (nextDraft: ReportDraft, _reason: "timer" | "section" | "manual") => {
    void _reason;
    if (!data.canEdit || data.reportStatus === "finalized") {
      return true;
    }

    if (saveInFlightRef.current) {
      return false;
    }

    saveInFlightRef.current = true;
    setSaveState("Saving");
    setErrorMessage(null);

    try {
      autosaveBlockedRef.current = false;
      await persistDraftLocally(nextDraft, {
        reportStatus: "draft",
        pendingFinalize: false,
        syncStatus: "pending",
        lastError: null
      });
      await queueReportDraftSync({
        reportId: data.reportId,
        inspectionReportId: data.reportId,
        contentJson: nextDraft,
        taskDisplayLabel: taskDisplayLabel.trim() || null
      });
      lastSavedAtRef.current = Date.now();
      setSaveState(window.navigator.onLine ? "Pending sync" : "Saved offline");
      setDirty(false);
      persistBackup(nextDraft, serverUpdatedAtRef.current);
      return true;
    } catch (error) {
      setSaveState("Error");
      setErrorMessage(toTechnicianFacingSaveMessage(error instanceof Error ? error.message : null, "save"));
      return false;
    } finally {
      saveInFlightRef.current = false;
    }
  }, [data.canEdit, data.reportId, data.reportStatus, persistBackup, persistDraftLocally, taskDisplayLabel]);

  useEffect(() => {
    saveDraftRef.current = saveDraft;
  }, [saveDraft]);

  useEffect(() => {
    if (!data.canEdit || data.reportStatus === "finalized") {
      return;
    }

    const interval = window.setInterval(() => {
      if (shouldAutosaveDraft({ dirty, millisecondsSinceLastSave: Date.now() - lastSavedAtRef.current, sectionChanged: false, saveInFlight: saveInFlightRef.current })) {
        void saveDraftRef.current?.(latestDraftRef.current, "timer");
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [data.canEdit, data.reportStatus, dirty]);

  function updateDraft(nextDraft: ReportDraft | ((current: ReportDraft) => ReportDraft)) {
    localInteractionStartedRef.current = true;
    autosaveBlockedRef.current = false;
    setDraft((current) => {
      const resolvedDraft = typeof nextDraft === "function"
        ? nextDraft(current)
        : nextDraft;
      latestDraftRef.current = resolvedDraft;
      return resolvedDraft;
    });
    setDirty(true);
    setSaveState("Unsaved changes");
    setFinalizeErrorMessage(null);
  }

  async function handleSectionChange(nextSectionId: string) {
    localInteractionStartedRef.current = true;
    const nextDraft = { ...draft, activeSectionId: nextSectionId };
    updateDraft(nextDraft);
    setActiveSectionId(nextSectionId);

    if (shouldAutosaveDraft({ dirty: true, millisecondsSinceLastSave: Date.now() - lastSavedAtRef.current, sectionChanged: true, saveInFlight: saveInFlightRef.current })) {
      await saveDraft(nextDraft, "section");
    }
  }

  function sectionState(sectionId: string, sourceDraft: ReportDraft = latestDraftRef.current) {
    return sourceDraft.sections[sectionId] ?? { status: "pending" as const, notes: "", fields: {} };
  }

  function updateSectionField(sectionId: string, fieldId: string, value: string | boolean | number) {
    updateDraft((currentDraft) => {
      const currentSection = sectionState(sectionId, currentDraft);
      const nextFields = applySectionFieldSmartUpdate(
        data.template,
        sectionId,
        {
          ...(currentSection.fields as Record<string, ReportPrimitiveValue>),
          [fieldId]: value
        },
        fieldId
      );

      return {
        ...currentDraft,
        sections: {
          ...currentDraft.sections,
          [sectionId]: {
            ...currentSection,
            fields: nextFields
          }
        }
      };
    });
  }

  function addRepeaterRow(sectionId: string, field: Extract<ReportFieldDefinition, { type: "repeater" }>) {
    updateDraft((currentDraft) => {
      const currentSection = sectionState(sectionId, currentDraft);
      const currentRows = Array.isArray(currentSection.fields?.[field.id]) ? currentSection.fields?.[field.id] as Array<Record<string, ReportPrimitiveValue>> : [];
      const nextRow = buildRepeaterRowDefaults(data.template, sectionId, field.id, currentRows.length);

      return {
        ...currentDraft,
        sections: {
          ...currentDraft.sections,
          [sectionId]: {
            ...currentSection,
            fields: {
              ...currentSection.fields,
              [field.id]: [...currentRows, nextRow]
            }
          }
        }
      };
    });
  }

  function duplicateRepeaterRow(sectionId: string, fieldId: string, rowIndex: number) {
    updateDraft((currentDraft) => {
      const currentSection = sectionState(sectionId, currentDraft);
      const currentRows = Array.isArray(currentSection.fields?.[fieldId]) ? currentSection.fields?.[fieldId] as Array<Record<string, ReportPrimitiveValue>> : [];

      return {
        ...currentDraft,
        sections: {
          ...currentDraft.sections,
          [sectionId]: {
            ...currentSection,
            fields: {
              ...currentSection.fields,
              [fieldId]: duplicateRepeaterRows(currentRows, rowIndex)
            }
          }
        }
      };
    });
  }

  function applyBulkAction(sectionId: string, field: Extract<ReportFieldDefinition, { type: "repeater" }>, actionId: string) {
    updateDraft((currentDraft) => {
      const currentSection = sectionState(sectionId, currentDraft);
      const currentRows = Array.isArray(currentSection.fields?.[field.id]) ? currentSection.fields?.[field.id] as Array<Record<string, ReportPrimitiveValue>> : [];

      return {
        ...currentDraft,
        sections: {
          ...currentDraft.sections,
          [sectionId]: {
            ...currentSection,
            fields: {
              ...currentSection.fields,
              [field.id]: applyRepeaterBulkAction(data.template, sectionId, field.id, currentRows, actionId)
            }
          }
        }
      };
    });
  }

  function removeRepeaterRow(sectionId: string, fieldId: string, rowIndex: number) {
    updateDraft((currentDraft) => {
      const currentSection = sectionState(sectionId, currentDraft);
      const currentRows = Array.isArray(currentSection.fields?.[fieldId]) ? currentSection.fields?.[fieldId] as Array<Record<string, ReportPrimitiveValue>> : [];

      return {
        ...currentDraft,
        sections: {
          ...currentDraft.sections,
          [sectionId]: {
            ...currentSection,
            fields: {
              ...currentSection.fields,
              [fieldId]: currentRows.filter((_, index) => index !== rowIndex)
            }
          }
        }
      };
    });
  }

  function updateRepeaterRowField(
    sectionId: string,
    field: Extract<ReportFieldDefinition, { type: "repeater" }>,
    rowIndex: number,
    rowFieldId: string,
    value: ReportPrimitiveValue
  ) {
    updateDraft((currentDraft) => {
      const currentSection = sectionState(sectionId, currentDraft);
      const currentRows = Array.isArray(currentSection.fields?.[field.id]) ? currentSection.fields?.[field.id] as Array<Record<string, ReportPrimitiveValue>> : [];
      const nextRows = currentRows.map((row, index) => {
        if (index !== rowIndex) {
          return row;
        }

        return applyRepeaterRowSmartUpdate(data.template, sectionId, field.id, { ...row, [rowFieldId]: value }, rowFieldId);
      });

      return {
        ...currentDraft,
        sections: {
          ...currentDraft.sections,
          [sectionId]: {
            ...currentSection,
            fields: {
              ...currentSection.fields,
              [field.id]: nextRows
            }
          }
        }
      };
    });
  }

  async function updateSectionPhotoField(sectionId: string, fieldId: string, files: FileList | null) {
    if (!files?.length || !data.canEdit || data.reportStatus === "finalized") {
      return;
    }

    const file = files[0];
    if (!file) {
      return;
    }

    const validationError = getReportPhotoValidationError(file);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    try {
      const prepared = await prepareReportPhotoForDraft(file);
      setErrorMessage(null);
      updateSectionField(sectionId, fieldId, prepared.dataUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare this photo for report saving.");
    }
  }

  async function updateRepeaterRowPhoto(
    sectionId: string,
    field: Extract<ReportFieldDefinition, { type: "repeater" }>,
    rowIndex: number,
    rowFieldId: string,
    files: FileList | null
  ) {
    if (!files?.length || !data.canEdit || data.reportStatus === "finalized") {
      return;
    }

    const file = files[0];
    if (!file) {
      return;
    }

    const validationError = getReportPhotoValidationError(file);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    try {
      const prepared = await prepareReportPhotoForDraft(file);
      setErrorMessage(null);
      updateRepeaterRowField(sectionId, field, rowIndex, rowFieldId, prepared.dataUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare this photo for report saving.");
    }
  }

  function updateSectionMeta(sectionId: string, key: "status" | "notes", value: string) {
    updateDraft((currentDraft) => {
      const currentSection = sectionState(sectionId, currentDraft);
      return {
        ...currentDraft,
        sections: {
          ...currentDraft.sections,
          [sectionId]: {
            ...currentSection,
            [key]: key === "notes" ? normalizeEditorText(value) : value
          }
        }
      };
    });
  }

  function addDeficiency() {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      deficiencies: [
        ...currentDraft.deficiencies,
        {
          id: crypto.randomUUID(),
          title: "",
          description: "",
          severity: "medium",
          status: "open",
          source: "manual",
          section: "manual",
          sourceRowKey: crypto.randomUUID(),
          assetId: null,
          assetTag: null,
          location: null,
          deviceType: null,
          notes: null,
          photoStorageKey: undefined
        }
      ]
    }));
  }

  function updateDeficiency(index: number, key: "title" | "description" | "severity" | "status", value: string) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      deficiencies: currentDraft.deficiencies.map((deficiency, itemIndex) => itemIndex === index ? { ...deficiency, [key]: key === "title" || key === "description" ? normalizeEditorText(value) : value } : deficiency)
    }));
  }

  function removeDeficiency(index: number) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      deficiencies: currentDraft.deficiencies.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0 || !data.canEdit || data.reportStatus === "finalized") {
      return;
    }

    if (draft.attachments.length + files.length > MAX_CLIENT_ATTACHMENT_COUNT) {
      setErrorMessage(`A report can include up to ${MAX_CLIENT_ATTACHMENT_COUNT} photos.`);
      return;
    }

    const fileList = Array.from(files);
    for (const file of fileList) {
      const validationError = getReportPhotoValidationError(file);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
    }

    try {
      const attachments = await Promise.all(
        fileList.map(async (file) => {
          const prepared = await prepareReportPhotoForDraft(file);
          return {
            id: crypto.randomUUID(),
            fileName: file.name,
            mimeType: prepared.mimeType,
            storageKey: prepared.dataUrl
          };
        })
      );

      setErrorMessage(null);
      updateDraft((currentDraft) => ({ ...currentDraft, attachments: [...currentDraft.attachments, ...attachments] }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare these photos for report saving.");
    }
  }

  function removeAttachment(id: string) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      attachments: currentDraft.attachments.filter((attachment) => attachment.id !== id)
    }));
  }

  function updateSignature(kind: "technician" | "customer", signerName: string, imageDataUrl: string | null) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      signatures: {
        ...currentDraft.signatures,
        [kind]: imageDataUrl ? { signerName: normalizeEditorText(signerName), imageDataUrl, signedAt: new Date().toISOString() } : undefined
      }
    }));
  }

  function updateSignerName(kind: "technician" | "customer", signerName: string) {
    const normalizedName = normalizeEditorText(signerName);
    updateDraft((currentDraft) => ({
      ...currentDraft,
      signatures: {
        ...currentDraft.signatures,
        [kind]: currentDraft.signatures[kind]
          ? { ...currentDraft.signatures[kind], signerName: normalizedName }
          : { signerName: normalizedName, imageDataUrl: "", signedAt: new Date().toISOString() }
      }
    }));
  }

  async function finalizeReport() {
    if (saveInFlightRef.current) {
      setErrorMessage("Please wait for the current save to finish before finalizing.");
      return;
    }

    if (dirty) {
      const saved = await saveDraft(draft, "manual");
      if (!saved) {
        return;
      }
    }

    setFinalizeErrorMessage(null);
    const finalizedAt = new Date().toISOString();
    await persistDraftLocally(latestDraftRef.current, {
      reportStatus: "submitted",
      pendingFinalize: true,
      finalizedAt,
      syncStatus: "pending",
      lastError: null
    });
    await queueReportFinalizeSync({
      reportId: data.reportId,
      inspectionReportId: data.reportId,
      contentJson: latestDraftRef.current,
      taskDisplayLabel: taskDisplayLabel.trim() || null
    });
    setSaveState(window.navigator.onLine ? "Pending sync" : "Saved offline");
    setDirty(false);
    window.location.assign("/app/tech/inspections?finalize=queued");
  }

  const activeSection = data.template.sections.find((section) => section.id === activeSectionId) ?? data.template.sections[0];
  const preview = buildReportPreview(draft);
  const showBottomBar = data.canEdit && data.reportStatus !== "finalized";

  if (!activeSection) {
    return null;
  }

  const completedSectionCount = preview.sectionSummaries.filter((summary) => summary.status !== "pending").length;
  const activeSectionIndex = Math.max(0, data.template.sections.findIndex((section) => section.id === activeSection.id));
  const previousSectionId = activeSectionIndex > 0 ? data.template.sections[activeSectionIndex - 1]?.id : null;
  const nextSectionId = activeSectionIndex < data.template.sections.length - 1 ? data.template.sections[activeSectionIndex + 1]?.id : null;
  const signatureCount = countCapturedSignatures(draft);
  const activeSectionSummary = preview.sectionSummaries.find((summary) => summary.sectionId === activeSection.id);
  const visibleErrorMessage = errorMessage ?? finalizeErrorMessage;
  const pendingSectionCount = preview.sectionSummaries.filter((summary) => summary.status === "pending").length;
  const hasRequiredSignatures = signatureCount === 2;
  const finalizeReadinessMessage = pendingSectionCount > 0
    ? "Complete and mark every section before finalizing."
    : !hasRequiredSignatures
      ? "Technician and customer signatures are required before finalizing."
      : null;
  const canFinalizeNow = data.canFinalize && data.reportStatus !== "finalized" && !saveInFlightRef.current && !finalizeReadinessMessage;
  const footerStatus = `${saveState} • ${Math.round(preview.reportCompletion * 100)}% complete`;

  return (
    <div className="space-y-4 pb-36 sm:space-y-6 md:pb-32 lg:pb-8">
      <div className="overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-panel sm:rounded-[2rem] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{data.defaultInspectionTypeLabel}</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">
              {(taskDisplayLabel.trim() || data.defaultInspectionTypeLabel)}
            </h2>
          <p className="mt-2 text-sm text-slate-500">{data.siteName} | {data.customerName} | {data.scheduledDateLabel}</p>
          <DispatchNotesBanner notes={data.dispatchNotes} />
          {data.canEdit && data.reportStatus !== "finalized" ? (
            <div className="mt-4 max-w-xl">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500" htmlFor={`report-name-${data.reportId}`}>
                  Custom report name
                </label>
                <input
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-medium tracking-[-0.02em] text-ink"
                  id={`report-name-${data.reportId}`}
                  onChange={(event) => {
                    setTaskDisplayLabel(event.target.value);
                    setDirty(true);
                    setSaveState("Unsaved changes");
                    setFinalizeErrorMessage(null);
                  }}
                  placeholder={data.defaultInspectionTypeLabel}
                  value={taskDisplayLabel}
                />
                <p className="mt-2 text-sm text-slate-500">
                  Leave blank to use the default report name for this service line.
                </p>
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-slate-500">Save state</p>
            <p className={`mt-1 font-semibold ${saveStateTone[saveState] ?? "text-slate-700"}`}>{saveState}</p>
          </div>
        </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>Context: {draft.context.assetCount} matching assets at this site.</p>
          {draft.context.priorReportSummary ? <p className="mt-2">Smart default: {draft.context.priorReportSummary}</p> : null}
          <p className="mt-2">Every change saves to local device storage first and syncs in the background when service is available.</p>
          {data.finalizedAt ? <p className="mt-2">Finalized at {new Date(data.finalizedAt).toLocaleString()}</p> : null}
          {data.paymentCollectionNotice ? <p className="mt-2 font-semibold text-amber-900">{data.paymentCollectionNotice}</p> : null}
          {data.correctionNotice ? <p className="mt-2 font-medium text-amber-900">{data.correctionNotice}</p> : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {[
            ["Sections complete", `${completedSectionCount}/${data.template.sections.length}`],
            ["Inspection progress", `${Math.round(preview.reportCompletion * 100)}% complete`],
            ["Detected deficiencies", String(preview.deficiencyCount)],
            ["Manual deficiencies", String(draft.deficiencies.length)],
            ["Photos", String(draft.attachments.length)],
            ["Signatures", `${signatureCount}/2`]
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <p className="text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <div className="overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-panel sm:rounded-[2rem]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-ink">Sections</h3>
              <p className="mt-1 text-sm text-slate-500">Move through the report from the top without shrinking the editing canvas below.</p>
            </div>
            <div className="flex items-center gap-2 self-start md:self-start">
              <button className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink" onClick={() => setShowPreview((current) => !current)} type="button">
                {showPreview ? "Hide preview" : "Preview"}
              </button>
            </div>
          </div>
          <div className="mt-4 -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 pr-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:hidden">
            {data.template.sections.map((section) => {
              const summary = preview.sectionSummaries.find((entry) => entry.sectionId === section.id);
              const status = draft.sections[section.id]?.status ?? "pending";
              const summaryLabel = sectionStatusLabel(summary ?? {
                sectionId: section.id,
                sectionLabel: section.label,
                status: "pending",
                notes: "",
                completionState: "not_started",
                completedRows: 0,
                totalRows: 0,
                deficiencyCount: 0
              });
              return (
                <button
                  key={section.id}
                  className={`min-h-[5.5rem] w-[14rem] shrink-0 snap-start rounded-2xl border px-4 py-4 text-left ${activeSectionId === section.id ? "border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary)] text-[var(--tenant-primary-contrast)]" : "border-slate-200 bg-white text-ink"}`}
                  onClick={() => { void handleSectionChange(section.id); }}
                  title={summaryLabel}
                  type="button"
                >
                  <p className="text-sm font-semibold leading-5 break-words">{section.label}</p>
                  <p className={`mt-2 text-xs ${activeSectionId === section.id ? "text-white/80" : "text-slate-500"}`}>
                    {formatSectionNavMeta(summary, status)}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
            {data.template.sections.map((section) => {
              const summary = preview.sectionSummaries.find((entry) => entry.sectionId === section.id);
              const status = draft.sections[section.id]?.status ?? "pending";
              const summaryLabel = sectionStatusLabel(summary ?? {
                sectionId: section.id,
                sectionLabel: section.label,
                status: "pending",
                notes: "",
                completionState: "not_started",
                completedRows: 0,
                totalRows: 0,
                deficiencyCount: 0
              });
              return (
                <button
                  key={section.id}
                  className={`min-h-[5.5rem] rounded-2xl border px-4 py-4 text-left ${activeSectionId === section.id ? "border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary)] text-[var(--tenant-primary-contrast)]" : "border-slate-200 bg-white text-ink"}`}
                  onClick={() => { void handleSectionChange(section.id); }}
                  title={summaryLabel}
                  type="button"
                >
                  <p className="text-sm font-semibold leading-5">{section.label}</p>
                  <p className={`mt-2 text-xs ${activeSectionId === section.id ? "text-white/80" : "text-slate-500"}`}>
                    {formatSectionNavMeta(summary, status)}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 hidden items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 md:flex">
            <p className="text-sm font-medium text-slate-600">{footerStatus}</p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-50" disabled={!previousSectionId} onClick={() => { if (previousSectionId) { void handleSectionChange(previousSectionId); } }} type="button">
                Prev
              </button>
              <button className="min-h-10 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized" || saveInFlightRef.current} onClick={() => { void saveDraft(draft, "manual"); }} type="button">
                Save
              </button>
              <button className="min-h-10 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-ink" onClick={() => setShowPreview((current) => !current)} type="button">
                {showPreview ? "Hide preview" : "Preview"}
              </button>
              <button className="min-h-10 rounded-2xl bg-[var(--tenant-primary)] px-4 py-2 text-sm font-semibold text-[var(--tenant-primary-contrast)] disabled:opacity-50" disabled={!nextSectionId} onClick={() => { if (nextSectionId) { void handleSectionChange(nextSectionId); } }} type="button">
                Next
              </button>
              {canFinalizeNow ? (
                <button className="min-h-10 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900" onClick={() => { void finalizeReport(); }} type="button">
                  Finalize
                </button>
              ) : null}
            </div>
          </div>
          {(visibleErrorMessage || backupWarning || finalizeReadinessMessage) ? (
            <div className="mt-4 hidden space-y-2 md:block">
              {visibleErrorMessage ? <p className="text-sm text-rose-600">{visibleErrorMessage}</p> : null}
              {backupWarning ? <p className="text-sm text-amber-700">{backupWarning}</p> : null}
              {!canFinalizeNow && finalizeReadinessMessage ? <p className="text-sm text-amber-700">{finalizeReadinessMessage}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4 sm:space-y-6">
          <div className="overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-panel sm:rounded-[2rem] sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-ink">{activeSection.label}</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Section {activeSectionIndex + 1} of {data.template.sections.length}
                  {activeSectionSummary?.totalRows ? ` • ${activeSectionSummary.completedRows} of ${activeSectionSummary.totalRows} rows complete` : ""}
                </p>
                <p className="mt-2 text-sm text-slate-500">{activeSection.description}</p>
                {previousSectionId ? (
                  <button className="mt-3 inline-flex min-h-10 items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 md:hidden" disabled={!previousSectionId} onClick={() => { if (previousSectionId) { void handleSectionChange(previousSectionId); } }} type="button">
                    Prev
                  </button>
                ) : null}
              </div>
              <div className="w-full md:w-auto md:min-w-[13rem]">
                <label className="mb-2 block text-sm font-medium text-slate-600">Section Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {sectionStatusOptions.map((option) => {
                    const isActive = (draft.sections[activeSection.id]?.status ?? "pending") === option.value;
                    return (
                      <button
                        key={option.value}
                        className={`min-h-12 rounded-2xl border px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] transition ${
                          isActive
                            ? option.activeClassName
                            : "border-slate-200 bg-white text-slate-600"
                        } disabled:opacity-50`}
                        disabled={!data.canEdit || data.reportStatus === "finalized"}
                        onClick={() => updateSectionMeta(activeSection.id, "status", option.value)}
                        type="button"
                      >
                        {normalizeOptionLabel(option.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-5 grid gap-4">
              {activeSection.fields.filter((field) => isTechnicianVisibleField(field) && isFieldVisible(field, draft.sections[activeSection.id]?.fields ?? {})).map((field) => (
                <div key={field.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-sm font-medium text-slate-600">{field.label}</label>
                  </div>
                  {field.description ? <p className="text-sm text-slate-500">{field.description}</p> : null}
                  {field.type === "repeater" ? (
                    <div className="space-y-3">
                      {field.bulkActions && field.bulkActions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {field.bulkActions.map((action) => (
                            <button key={action.id} className="min-h-10 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-ink disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized"} onClick={() => applyBulkAction(activeSection.id, field, action.id)} type="button">
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {((draft.sections[activeSection.id]?.fields?.[field.id] as Array<Record<string, ReportPrimitiveValue>> | undefined) ?? []).length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No items added yet.</p>
                      ) : (
                        ((draft.sections[activeSection.id]?.fields?.[field.id] as Array<Record<string, ReportPrimitiveValue>> | undefined) ?? []).map((row, rowIndex) => {
                          const deficiencySeverityField = field.rowFields.find((rowField) => rowField.id === "deficiencySeverity");
                          const deficiencyNotesField = field.rowFields.find((rowField) => rowField.id === "deficiencyNotes");
                          const deficiencyPhotoField = field.rowFields.find((rowField) => rowField.id === "deficiencyPhoto");
                          const detectedDeficiency = rowHasDetectedDeficiency(field, row);

                          return (
                          <div key={String(row.__rowId ?? `${field.id}-${rowIndex}`)} className="space-y-3 rounded-[1.5rem] border border-slate-200 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-ink">{describeRepeaterRowLabel(row, rowIndex)}</p>
                                {detectedDeficiency ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Warning: Deficiency created</p> : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {field.allowDuplicate ? (
                                  <button className="min-h-10 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-ink disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized"} onClick={() => duplicateRepeaterRow(activeSection.id, field.id, rowIndex)} type="button">
                                    {field.duplicateLabel ?? "Duplicate"}
                                  </button>
                                ) : null}
                                <button className="min-h-10 rounded-2xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized"} onClick={() => removeRepeaterRow(activeSection.id, field.id, rowIndex)} type="button">
                                  Remove
                                </button>
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              {field.rowFields.filter((rowField) => isTechnicianVisibleField(rowField) && rowField.id !== "assetId" && rowField.id !== "assetTag" && isFieldVisible(rowField, row)).map((rowField) => (
                                <div key={`${field.id}-${rowIndex}-${rowField.id}`} className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <label className="block text-sm font-medium text-slate-600">{rowField.label}</label>
                                  </div>
                                  {rowField.type === "boolean" ? (
                                    <button className={`min-h-14 w-full rounded-2xl border px-4 py-4 text-left text-base font-medium uppercase ${row[rowField.id] ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`} disabled={isFieldDisabled(data.canEdit, data.reportStatus, rowField)} onClick={() => updateRepeaterRowField(activeSection.id, field, rowIndex, rowField.id, !(row[rowField.id] as boolean))} type="button">
                                      {row[rowField.id] ? normalizeOptionLabel("Yes") : normalizeOptionLabel("No")}
                                    </button>
                                  ) : rowField.type === "select" ? (
                                    <ReportSelectControl
                                      className={fieldShellClassName(rowField.readOnly)}
                                      disabled={isFieldDisabled(data.canEdit, data.reportStatus, rowField)}
                                      onChange={(nextValue) => updateRepeaterRowField(activeSection.id, field, rowIndex, rowField.id, nextValue)}
                                      options={rowField.options ?? []}
                                      value={String(row[rowField.id] ?? "")}
                                    />
                                  ) : rowField.type === "photo" ? (
                                    <div className="space-y-3 rounded-[1.5rem] border border-slate-200 p-3">
                                      {row[rowField.id] ? <Image alt={rowField.label} className="h-40 w-full rounded-2xl object-cover" height={160} src={resolveStoredMediaSrc(data.reportId, String(row[rowField.id] ?? "")) ?? String(row[rowField.id] ?? "")} unoptimized width={320} /> : <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No photo attached.</p>}
                                      <div className="flex flex-wrap gap-2">
                                        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-ink">
                                          {row[rowField.id] ? "Replace photo" : "Add photo"}
                                          <input accept="image/*" className="hidden" disabled={isFieldDisabled(data.canEdit, data.reportStatus, rowField)} onChange={(event) => { void updateRepeaterRowPhoto(activeSection.id, field, rowIndex, rowField.id, event.target.files); event.target.value = ""; }} type="file" />
                                        </label>
                                        {row[rowField.id] ? (
                                          <button className="min-h-11 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={isFieldDisabled(data.canEdit, data.reportStatus, rowField)} onClick={() => updateRepeaterRowField(activeSection.id, field, rowIndex, rowField.id, "")} type="button">
                                            Remove photo
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  ) : (
                                    <input className={`min-h-14 ${fieldShellClassName(rowField.readOnly)} ${rowField.type === "text" ? "uppercase" : ""}`} disabled={isFieldDisabled(data.canEdit, data.reportStatus, rowField)} onChange={(event) => updateRepeaterRowField(activeSection.id, field, rowIndex, rowField.id, rowField.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : rowField.type === "text" ? normalizeEditorText(event.target.value) : event.target.value)} placeholder={rowField.placeholder} type={rowField.type === "number" ? "number" : rowField.type === "date" ? "date" : "text"} value={String(row[rowField.id] ?? "")} />
                                  )}
                                </div>
                              ))}
                            </div>
                            {detectedDeficiency && (deficiencySeverityField || deficiencyNotesField || deficiencyPhotoField) ? (
                              <div className="space-y-3 rounded-[1.5rem] border border-rose-200 bg-rose-50/50 p-4">
                                <p className="text-sm font-semibold text-rose-800">Deficiency details</p>
                                <p className="text-sm text-rose-700">Add severity, notes, or a photo so office staff can turn this failure into a quote or repair workflow quickly.</p>
                                <div className="grid gap-3 md:grid-cols-2">
                                  {deficiencySeverityField ? (
                                    <div className="space-y-2">
                                      <label className="block text-sm font-medium text-slate-600">{deficiencySeverityField.label}</label>
                                      <ReportSelectControl
                                        className={fieldShellClassName(deficiencySeverityField.readOnly)}
                                        disabled={isFieldDisabled(data.canEdit, data.reportStatus, deficiencySeverityField)}
                                        onChange={(nextValue) => updateRepeaterRowField(activeSection.id, field, rowIndex, deficiencySeverityField.id, nextValue)}
                                        options={deficiencySeverityField.options ?? []}
                                        value={String(row[deficiencySeverityField.id] ?? "")}
                                      />
                                    </div>
                                  ) : null}
                                  {deficiencyNotesField ? (
                                    <div className="space-y-2 md:col-span-2">
                                      <label className="block text-sm font-medium text-slate-600">{deficiencyNotesField.label}</label>
                                      <textarea className="min-h-24 w-full resize-none overflow-hidden rounded-[1.5rem] border border-slate-200 px-4 py-4 text-base uppercase" data-auto-grow="on" disabled={isFieldDisabled(data.canEdit, data.reportStatus, deficiencyNotesField)} onChange={(event) => updateRepeaterRowField(activeSection.id, field, rowIndex, deficiencyNotesField.id, normalizeEditorText(event.target.value))} placeholder={deficiencyNotesField.placeholder} value={String(row[deficiencyNotesField.id] ?? "")} />
                                    </div>
                                  ) : null}
                                  {deficiencyPhotoField ? (
                                    <div className="space-y-3 md:col-span-2">
                                      <label className="block text-sm font-medium text-slate-600">{deficiencyPhotoField.label}</label>
                                      {row[deficiencyPhotoField.id] ? <Image alt={deficiencyPhotoField.label} className="h-40 w-full rounded-2xl object-cover" height={160} src={resolveStoredMediaSrc(data.reportId, String(row[deficiencyPhotoField.id] ?? "")) ?? String(row[deficiencyPhotoField.id] ?? "")} unoptimized width={320} /> : <p className="rounded-2xl border border-dashed border-rose-200 px-4 py-5 text-sm text-rose-700">No deficiency photo attached yet.</p>}
                                      <div className="flex flex-wrap gap-2">
                                        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink">
                                          {row[deficiencyPhotoField.id] ? "Replace deficiency photo" : "Add deficiency photo"}
                                          <input accept="image/*" className="hidden" disabled={isFieldDisabled(data.canEdit, data.reportStatus, deficiencyPhotoField)} onChange={(event) => { void updateRepeaterRowPhoto(activeSection.id, field, rowIndex, deficiencyPhotoField.id, event.target.files); event.target.value = ""; }} type="file" />
                                        </label>
                                        {row[deficiencyPhotoField.id] ? (
                                          <button className="min-h-11 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={isFieldDisabled(data.canEdit, data.reportStatus, deficiencyPhotoField)} onClick={() => updateRepeaterRowField(activeSection.id, field, rowIndex, deficiencyPhotoField.id, "")} type="button">
                                            Remove deficiency photo
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );})
                      )}
                      <button className="min-h-12 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized"} onClick={() => addRepeaterRow(activeSection.id, field)} type="button">
                        {field.addLabel ?? "Add item"}
                      </button>
                    </div>
                  ) : field.type === "boolean" ? (
                    <button className={`min-h-14 w-full rounded-2xl border px-4 py-4 text-left text-base font-medium uppercase ${draft.sections[activeSection.id]?.fields?.[field.id] ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`} disabled={isFieldDisabled(data.canEdit, data.reportStatus, field)} onClick={() => updateSectionField(activeSection.id, field.id, !(draft.sections[activeSection.id]?.fields?.[field.id] as boolean))} type="button">
                      {(draft.sections[activeSection.id]?.fields?.[field.id] as boolean) ? normalizeOptionLabel("Yes") : normalizeOptionLabel("No")}
                    </button>
                  ) : field.type === "select" ? (
                    <ReportSelectControl
                      className={fieldShellClassName(field.readOnly)}
                      disabled={isFieldDisabled(data.canEdit, data.reportStatus, field)}
                      onChange={(nextValue) => updateSectionField(activeSection.id, field.id, nextValue)}
                      options={field.options ?? []}
                      value={String(draft.sections[activeSection.id]?.fields?.[field.id] ?? "")}
                    />
                  ) : field.type === "photo" ? (
                    <div className="space-y-3 rounded-[1.5rem] border border-slate-200 p-3">
                      {draft.sections[activeSection.id]?.fields?.[field.id] ? <Image alt={field.label} className="aspect-[4/3] w-full rounded-2xl object-cover" height={240} src={resolveStoredMediaSrc(data.reportId, String(draft.sections[activeSection.id]?.fields?.[field.id] ?? "")) ?? String(draft.sections[activeSection.id]?.fields?.[field.id] ?? "")} unoptimized width={320} /> : <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No photo attached.</p>}
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-ink">
                          {draft.sections[activeSection.id]?.fields?.[field.id] ? "Replace photo" : "Add photo"}
                          <input accept="image/*" className="hidden" disabled={isFieldDisabled(data.canEdit, data.reportStatus, field)} onChange={(event) => { void updateSectionPhotoField(activeSection.id, field.id, event.target.files); event.target.value = ""; }} type="file" />
                        </label>
                        {draft.sections[activeSection.id]?.fields?.[field.id] ? (
                          <button className="min-h-11 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={isFieldDisabled(data.canEdit, data.reportStatus, field)} onClick={() => updateSectionField(activeSection.id, field.id, "")} type="button">
                            Remove photo
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <input className={`min-h-14 ${fieldShellClassName(field.readOnly)} ${field.type === "text" ? "uppercase" : ""}`} disabled={isFieldDisabled(data.canEdit, data.reportStatus, field)} onChange={(event) => updateSectionField(activeSection.id, field.id, field.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : field.type === "text" ? normalizeEditorText(event.target.value) : event.target.value)} placeholder={field.placeholder} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={String(draft.sections[activeSection.id]?.fields?.[field.id] ?? "")} />
                  )}
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-slate-600">Section notes</label>
                <textarea className="mt-2 min-h-32 w-full resize-none overflow-hidden rounded-[1.5rem] border border-slate-200 px-4 py-4 text-base uppercase" data-auto-grow="on" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateSectionMeta(activeSection.id, "notes", event.target.value)} value={draft.sections[activeSection.id]?.notes ?? ""} />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-panel sm:rounded-[2rem] sm:p-5">
            <h3 className="text-xl font-semibold text-ink">Technician notes</h3>
            <textarea className="mt-4 min-h-32 w-full resize-none overflow-hidden rounded-[1.5rem] border border-slate-200 px-4 py-4 text-base uppercase" data-auto-grow="on" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateDraft((currentDraft) => ({ ...currentDraft, overallNotes: normalizeEditorText(event.target.value) }))} value={draft.overallNotes} />
          </div>

          <div className="overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-panel sm:rounded-[2rem] sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-xl font-semibold text-ink">Deficiencies</h3>
              <button className="min-h-12 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized"} onClick={addDeficiency} type="button">
                Add deficiency
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {draft.deficiencies.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No deficiencies captured.</p> : draft.deficiencies.map((deficiency, index) => (
                <div key={deficiency.id} className="space-y-3 rounded-[1.5rem] border border-slate-200 p-4">
                  <input className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 py-3 uppercase" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateDeficiency(index, "title", event.target.value)} placeholder="Deficiency title" value={deficiency.title} />
                  <textarea className="min-h-24 w-full resize-none overflow-hidden rounded-2xl border border-slate-200 px-4 py-3 uppercase" data-auto-grow="on" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateDeficiency(index, "description", event.target.value)} placeholder="Describe the deficiency" value={deficiency.description} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <ReportSelectControl
                      className="rounded-2xl border border-slate-200 px-4 py-3"
                      disabled={!data.canEdit || data.reportStatus === "finalized"}
                      onChange={(nextValue) => updateDeficiency(index, "severity", nextValue)}
                      options={[
                        { label: "Low", value: "low" },
                        { label: "Medium", value: "medium" },
                        { label: "High", value: "high" },
                        { label: "Critical", value: "critical" }
                      ]}
                      value={deficiency.severity}
                    />
                    <ReportSelectControl
                      className="rounded-2xl border border-slate-200 px-4 py-3"
                      disabled={!data.canEdit || data.reportStatus === "finalized"}
                      onChange={(nextValue) => updateDeficiency(index, "status", nextValue)}
                      options={[
                        { label: "Open", value: "open" },
                        { label: "Quoted", value: "quoted" },
                        { label: "Approved", value: "approved" },
                        { label: "Scheduled", value: "scheduled" },
                        { label: "Resolved", value: "resolved" },
                        { label: "Ignored", value: "ignored" }
                      ]}
                      value={deficiency.status}
                    />
                  </div>
                  <button className="min-h-12 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized"} onClick={() => removeDeficiency(index)} type="button">
                    Remove deficiency
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-panel sm:rounded-[2rem] sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-ink">Photo attachments</h3>
                <p className="mt-1 text-sm text-slate-500">Image files only. Photos are automatically compressed for faster saving and capped at about {(reportPhotoPreparationConfig.preparedMaxBytes / (1024 * 1024)).toFixed(0)} MB each after preparation.</p>
              </div>
              <label className="inline-flex min-h-12 cursor-pointer items-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-ink">
                Add photos
                <input accept="image/*" className="hidden" disabled={!data.canEdit || data.reportStatus === "finalized"} multiple onChange={(event) => { void handleFilesSelected(event.target.files); event.target.value = ""; }} type="file" />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {draft.attachments.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No photos attached.</p> : draft.attachments.map((attachment) => (
                <div key={attachment.id} className="space-y-3 rounded-[1.5rem] border border-slate-200 p-3">
                  <Image alt={attachment.fileName} className="aspect-[4/3] w-full rounded-2xl object-cover" height={240} src={resolveStoredMediaSrc(data.reportId, attachment.storageKey) ?? attachment.storageKey} unoptimized width={320} />
                  <div>
                    <p className="break-all font-medium text-ink">{attachment.fileName}</p>
                    <p className="text-sm text-slate-500">{attachment.mimeType}</p>
                  </div>
                  <button className="min-h-12 w-full rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized"} onClick={() => removeAttachment(attachment.id)} type="button">
                    Remove photo
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <SignaturePad
              disabled={!data.canEdit || data.reportStatus === "finalized"}
              label="Technician signature"
              onChange={(value) => updateSignature("technician", draft.signatures.technician?.signerName ?? "", value)}
              onSignerNameChange={(value) => updateSignerName("technician", value)}
              signerName={draft.signatures.technician?.signerName ?? ""}
              value={resolveStoredMediaSrc(data.reportId, draft.signatures.technician?.imageDataUrl) ?? draft.signatures.technician?.imageDataUrl}
            />
            <SignaturePad
              disabled={!data.canEdit || data.reportStatus === "finalized"}
              label="Customer signature"
              onChange={(value) => updateSignature("customer", draft.signatures.customer?.signerName ?? "", value)}
              onSignerNameChange={(value) => updateSignerName("customer", value)}
              signerName={draft.signatures.customer?.signerName ?? ""}
              value={resolveStoredMediaSrc(data.reportId, draft.signatures.customer?.imageDataUrl) ?? draft.signatures.customer?.imageDataUrl}
            />
          </div>

          {showPreview ? (
            <div className="rounded-[2rem] bg-white p-5 shadow-panel">
              <h3 className="text-2xl font-semibold text-ink">Preview before finalization</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                {preview.sectionSummaries.map((summary) => (
                  <div key={summary.sectionId} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-semibold text-ink">{summary.sectionLabel}</p>
                    <p className="mt-1">Status: {summary.status}</p>
                    <p className="mt-1">Progress: {summary.totalRows > 0 ? `${summary.completedRows}/${summary.totalRows}` : summary.completionState.replaceAll("_", " ")}</p>
                    <p className="mt-1">Detected deficiencies: {summary.deficiencyCount}</p>
                    <p className="mt-1">Notes: {summary.notes || "None"}</p>
                  </div>
                ))}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-semibold text-ink">Totals</p>
                  <p className="mt-1">Inspection status: {preview.inspectionStatus === "deficiencies_found" ? "Deficiencies Found" : "Pass"}</p>
                  <p className="mt-1">Progress: {Math.round(preview.reportCompletion * 100)}% complete</p>
                  <p className="mt-1">Detected deficiencies: {preview.deficiencyCount}</p>
                  <p className="mt-1">Manual deficiencies: {preview.manualDeficiencyCount}</p>
                  <p className="mt-1">Attachments: {preview.attachmentCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-semibold text-ink">Detected deficiency list</p>
                  {preview.detectedDeficiencies.length === 0 ? <p className="mt-1">None detected.</p> : preview.detectedDeficiencies.map((item) => <p key={`${item.sectionId}-${item.rowKey}`} className="mt-1">{item.sectionLabel}: {item.rowLabel} | {item.description}</p>)}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {showBottomBar ? (
        <>
          {(visibleErrorMessage || backupWarning) ? (
            <div
              className="mobile-keyboard-hide fixed inset-x-0 z-20 px-4 transition-all duration-150 ease-out lg:hidden"
              style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
            >
              <div className="mx-auto max-w-7xl space-y-2">
                {visibleErrorMessage ? <p className="rounded-2xl border border-rose-200 bg-white/95 px-4 py-3 text-sm text-rose-700 shadow-xl backdrop-blur">{visibleErrorMessage}</p> : null}
                {backupWarning ? <p className="rounded-2xl border border-amber-200 bg-white/95 px-4 py-3 text-sm text-amber-700 shadow-xl backdrop-blur">{backupWarning}</p> : null}
              </div>
            </div>
          ) : null}
        <div
          className="mobile-keyboard-hide fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur transition-all duration-150 ease-out lg:hidden"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto max-w-7xl">
            <div className="mb-3 text-xs font-medium text-slate-600">
              <p>{footerStatus}</p>
            </div>
          </div>
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3">
            <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50" disabled={saveInFlightRef.current} onClick={() => { void saveDraft(draft, "manual"); }} type="button">
              Save
            </button>
            {canFinalizeNow && !nextSectionId ? (
              <button className="btn-brand-primary rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold disabled:opacity-50" disabled={!canFinalizeNow} onClick={() => { void finalizeReport(); }} type="button">
                Finalize
              </button>
            ) : (
              <button className="rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-[var(--tenant-primary-contrast)] disabled:opacity-50" disabled={!nextSectionId} onClick={() => { if (nextSectionId) { void handleSectionChange(nextSectionId); } }} type="button">
                Next
              </button>
            )}
          </div>
          {finalizeReadinessMessage && !canFinalizeNow ? <p className="mx-auto mt-2 max-w-7xl text-xs text-slate-500">{finalizeReadinessMessage}</p> : null}
        </div>
        </>
      ) : null}
    </div>
  );
}
