"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  applyRepeaterRowSmartUpdate,
  applySectionFieldSmartUpdate,
  buildMobileChecklistViewModel,
  buildRepeaterRowDefaults,
  buildReportPreview,
  describeRepeaterRowLabel,
  getReportPhotoValidationError,
  isChecklistHeavyMobileField,
  prepareReportPhotoForDraft,
  reportPhotoPreparationConfig,
  validateFinalizationDraft,
  type MobileChecklistItem,
  type ReportDraft,
  type ReportFieldDefinition,
  type ReportPrimitiveValue
} from "@testworx/lib";

import type { TechnicianReportEditorData } from "./report-editor";
import { getLocalReportDraft, putLocalReportDraft, subscribeToOfflineChanges } from "./offline/offline-db";
import { initializeLocalReportRecord, queueReportDraftSync, queueReportFinalizeSync, startTechnicianSyncEngine } from "./offline/offline-sync";
import type { LocalReportDraftRecord } from "./offline/offline-types";
import { SignaturePad } from "./signature-pad";

const saveStateTone: Record<string, string> = {
  Saved: "text-emerald-700",
  Saving: "text-amber-700",
  Error: "text-rose-700",
  "Saved offline": "text-blue-700",
  "Pending sync": "text-blue-700",
  Syncing: "text-blue-700",
  "Failed sync": "text-amber-700",
  Conflict: "text-rose-700",
  Finalized: "text-slate-700"
};

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

function toTechnicianFacingSaveMessage(message: string | null | undefined, action: "save" | "finalize") {
  const normalized = (message ?? "").trim();
  if (!normalized) {
    return action === "save"
      ? "Unable to save your inspection right now. Check your connection and try again."
      : "Unable to finalize this inspection right now. Review the inspection and try again.";
  }

  if (/report media storage is unavailable/i.test(normalized)) {
    return normalized;
  }

  if (/signatures are required|all report sections must be marked|add at least one/i.test(normalized)) {
    return normalized;
  }

  return action === "save"
    ? "Unable to save your inspection right now. Check your connection and try again."
    : "Unable to finalize this inspection right now. Review the inspection and try again.";
}

function trackChecklistEvent(event: string, detail: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("tradeworx:mobile-checklist", { detail: { event, ...detail } }));
}

function buildScalarDeficiencyId(sectionId: string, fieldId: string) {
  return `mobile:${sectionId}:${fieldId}`;
}

function SelectChips({
  options,
  value,
  onChange,
  disabled
}: {
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            className={`min-h-11 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
              active
                ? "border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary)] text-[var(--tenant-primary-contrast)]"
                : "border-slate-200 bg-white text-slate-700"
            } disabled:opacity-50`}
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

function DispatchNotesBanner({ notes }: { notes: string | null | undefined }) {
  const trimmedNotes = notes?.trim();
  if (!trimmedNotes) {
    return null;
  }

  return (
    <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50/85 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-900">Dispatch notes</p>
      <p className="mt-1 text-sm leading-6 text-amber-950 whitespace-pre-wrap">{trimmedNotes}</p>
    </div>
  );
}

function buildDefaultSeverityOptions() {
  return [
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
    { label: "Critical", value: "critical" }
  ];
}

function isScalarChecklistItem(item: MobileChecklistItem): item is MobileChecklistItem & { kind: { type: "section-field"; fieldId: string } } {
  return item.kind.type === "section-field";
}

function countChecklistItemPhotos(draft: ReportDraft, item: MobileChecklistItem) {
  if (item.kind.type === "section-field") {
    const deficiencyId = buildScalarDeficiencyId(item.sectionId, item.kind.fieldId);
    return draft.deficiencies.some((deficiency) => deficiency.id === deficiencyId && deficiency.photoStorageKey) ? 1 : 0;
  }

  return item.deficiencyPhotoStorageKey ? 1 : 0;
}

function createDerivedDraft(template: TechnicianReportEditorData["template"], draft: ReportDraft) {
  const checklist = buildMobileChecklistViewModel(template, draft);
  const nextSections: ReportDraft["sections"] = { ...draft.sections };

  for (const section of template.sections) {
    const currentSection = nextSections[section.id] ?? { status: "pending", notes: "", fields: {} };
    const checklistItems = checklist.sections.find((entry) => entry.sectionId === section.id)?.items ?? [];

    if (checklistItems.length > 0) {
      const hasIncompleteItems = checklistItems.some((item) => item.status === null);
      const hasNegativeItems = checklistItems.some((item) => item.status === "negative");
      nextSections[section.id] = {
        ...currentSection,
        status: hasIncompleteItems ? "pending" : hasNegativeItems ? "fail" : "pass"
      };
      continue;
    }

    const requiresRows = section.fields.some((field) => field.validation?.some((rule) => rule.type === "minRows" && Number(rule.value ?? 0) > 0));
    if (!requiresRows) {
      nextSections[section.id] = { ...currentSection, status: "pass" };
      continue;
    }

    const hasRequiredRows = section.fields.every((field) => {
      if (field.type !== "repeater") {
        return true;
      }

      const minRows = field.validation?.find((rule) => rule.type === "minRows");
      if (!minRows) {
        return true;
      }

      const rows = Array.isArray(currentSection.fields?.[field.id]) ? currentSection.fields[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>> : [];
      return rows.length >= Number(minRows.value ?? 0);
    });

    nextSections[section.id] = {
      ...currentSection,
      status: hasRequiredRows ? "pass" : "pending"
    };
  }

  return {
    ...draft,
    sections: nextSections
  };
}

function getSupplementalFields(section: TechnicianReportEditorData["template"]["sections"][number]) {
  const scalarFields = section.fields.filter((field) => field.type !== "repeater" && !field.hidden && !field.readOnly && !isChecklistHeavyMobileField(field));
  const repeaterFields = section.fields.filter((field) => field.type === "repeater");
  return { scalarFields, repeaterFields };
}

function formatChecklistTimestamp(label: string) {
  return `Started ${label}`;
}

export function MobileChecklistReportScreen({
  data,
  inspectionId,
  taskId,
  mode
}: {
  data: TechnicianReportEditorData;
  inspectionId: string;
  taskId: string;
  mode: "checklist" | "review";
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ReportDraft>(() => createDerivedDraft(data.template, data.draft));
  const [saveState, setSaveState] = useState(data.reportStatus === "finalized" ? "Finalized" : "Saved");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [finalizeErrorMessage, setFinalizeErrorMessage] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const localRecordRef = useRef<LocalReportDraftRecord | null>(null);
  const queueTimerRef = useRef<number | null>(null);
  const fieldTimerRef = useRef<Map<string, number>>(new Map());
  const finalizeInFlightRef = useRef(false);

  const preview = useMemo(() => buildReportPreview(draft), [draft]);
  const checklist = useMemo(() => buildMobileChecklistViewModel(data.template, draft), [data.template, draft]);
  const progressPercent = checklist.totalCount > 0 ? Math.round((checklist.completedCount / checklist.totalCount) * 100) : 0;
  const missingTechnicianSignature = !(draft.signatures.technician?.signerName && draft.signatures.technician?.imageDataUrl);
  const missingCustomerSignature = !(draft.signatures.customer?.signerName && draft.signatures.customer?.imageDataUrl);

  const blockingIssues = useMemo(() => {
    const issues: string[] = [];
    if (checklist.items.some((item) => item.status === null)) {
      issues.push("Answer every checklist item before finalizing.");
    }
    if (missingTechnicianSignature || missingCustomerSignature) {
      issues.push("Technician and customer signatures are required before finalizing.");
    }

    try {
      validateFinalizationDraft(createDerivedDraft(data.template, draft));
    } catch (error) {
      const message = error instanceof Error ? error.message : null;
      if (message && !issues.includes(message)) {
        issues.push(message);
      }
    }

    return issues;
  }, [checklist.items, data.template, draft, missingCustomerSignature, missingTechnicianSignature]);

  const warningMessages = useMemo(() => {
    const warnings: string[] = [];
    if (checklist.negativeCount > 0) {
      warnings.push(`${checklist.negativeCount} checklist item${checklist.negativeCount === 1 ? "" : "s"} marked fail.`);
    }
    if (preview.manualDeficiencyCount > 0) {
      warnings.push(`${preview.manualDeficiencyCount} manual deficienc${preview.manualDeficiencyCount === 1 ? "y" : "ies"} captured.`);
    }
    return warnings;
  }, [checklist.negativeCount, preview.manualDeficiencyCount]);

  useEffect(() => {
    trackChecklistEvent("checklist_flow_opened", {
      reportId: data.reportId,
      inspectionType: draft.inspectionType,
      mode
    });
  }, [data.reportId, draft.inspectionType, mode]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateLocalDraft() {
      startTechnicianSyncEngine();
      const initialRecord: LocalReportDraftRecord = {
        reportId: data.reportId,
        inspectionId,
        taskId,
        draft: createDerivedDraft(data.template, data.draft),
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
      setDraft(createDerivedDraft(data.template, localRecord.draft as ReportDraft));
      setSaveState(buildReportSaveState(localRecord, data.reportStatus));
      if (localRecord.lastError) {
        setErrorMessage(toTechnicianFacingSaveMessage(localRecord.lastError, localRecord.pendingFinalize ? "finalize" : "save"));
      }
      setHydrated(true);
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
        } else {
          setErrorMessage(null);
        }
      })();
    });

    const queueTimer = queueTimerRef;
    const fieldTimersRef = fieldTimerRef;

    return () => {
      cancelled = true;
      unsubscribe();
      if (queueTimer.current) {
        window.clearTimeout(queueTimer.current);
      }
      const fieldTimers = fieldTimersRef.current;
      fieldTimers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [data.customInspectionTypeLabel, data.draft, data.finalizedAt, data.reportId, data.reportStatus, data.reportUpdatedAt, data.template, inspectionId, taskId]);

  async function persistDraftLocally(
    nextDraft: ReportDraft,
    input?: {
      reportStatus?: LocalReportDraftRecord["reportStatus"];
      pendingFinalize?: boolean;
      finalizedAt?: string | null;
      syncStatus?: LocalReportDraftRecord["syncStatus"];
      lastError?: string | null;
    }
  ) {
    const record: LocalReportDraftRecord = {
      reportId: data.reportId,
      inspectionId: localRecordRef.current?.inspectionId ?? "",
      taskId: localRecordRef.current?.taskId ?? "",
      draft: nextDraft,
      taskDisplayLabel: data.customInspectionTypeLabel ?? null,
      reportStatus: input?.reportStatus ?? "draft",
      serverUpdatedAt: localRecordRef.current?.serverUpdatedAt ?? data.reportUpdatedAt,
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
  }

  function scheduleDraftSync(nextDraft: ReportDraft, delay = 350) {
    if (queueTimerRef.current) {
      window.clearTimeout(queueTimerRef.current);
    }

    queueTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          await queueReportDraftSync({
            reportId: data.reportId,
            inspectionReportId: data.reportId,
            contentJson: nextDraft,
            taskDisplayLabel: data.customInspectionTypeLabel ?? null
          });
          setSaveState(window.navigator.onLine ? "Pending sync" : "Saved offline");
        } catch (error) {
          setErrorMessage(toTechnicianFacingSaveMessage(error instanceof Error ? error.message : null, "save"));
          setSaveState("Error");
        }
      })();
    }, delay);
  }

  async function applyDraftMutation(
    mutation: (currentDraft: ReportDraft) => ReportDraft,
    options?: {
      immediateQueue?: boolean;
      debounceKey?: string;
      eventName?: string;
      eventDetail?: Record<string, unknown>;
    }
  ) {
    const nextDraft = createDerivedDraft(data.template, mutation(draft));
    setDraft(nextDraft);
    setFinalizeErrorMessage(null);
    setErrorMessage(null);

    try {
      await persistDraftLocally(nextDraft, {
        reportStatus: "draft",
        pendingFinalize: false,
        syncStatus: "pending",
        lastError: null
      });
      if (options?.eventName) {
        trackChecklistEvent(options.eventName, { reportId: data.reportId, ...options.eventDetail });
      }

      if (options?.debounceKey) {
        const debounceKey = options.debounceKey;
        const existingTimer = fieldTimerRef.current.get(debounceKey);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }

        const timerId = window.setTimeout(() => {
          scheduleDraftSync(nextDraft, 0);
          fieldTimerRef.current.delete(debounceKey);
        }, 450);
        fieldTimerRef.current.set(debounceKey, timerId);
        setSaveState("Saved offline");
        return;
      }

      scheduleDraftSync(nextDraft, options?.immediateQueue ? 0 : 200);
      setSaveState(window.navigator.onLine ? "Pending sync" : "Saved offline");
    } catch (error) {
      setErrorMessage(toTechnicianFacingSaveMessage(error instanceof Error ? error.message : null, "save"));
      setSaveState("Error");
    }
  }

  function updateSectionField(sectionId: string, fieldId: string, value: ReportPrimitiveValue) {
    void applyDraftMutation((currentDraft) => {
      const currentSection = currentDraft.sections[sectionId] ?? { status: "pending", notes: "", fields: {} };
      return {
        ...currentDraft,
        sections: {
          ...currentDraft.sections,
          [sectionId]: {
            ...currentSection,
            fields: applySectionFieldSmartUpdate(
              data.template,
              sectionId,
              {
                ...(currentSection.fields as Record<string, ReportPrimitiveValue>),
                [fieldId]: value
              },
              fieldId
            )
          }
        }
      };
    }, {
      immediateQueue: true
    });
  }

  function updateRepeaterRowField(
    sectionId: string,
    field: Extract<ReportFieldDefinition, { type: "repeater" }>,
    rowIndex: number,
    rowFieldId: string,
    value: ReportPrimitiveValue,
    options?: {
      debounceKey?: string;
      eventName?: string;
      eventDetail?: Record<string, unknown>;
      immediateQueue?: boolean;
    }
  ) {
    void applyDraftMutation((currentDraft) => {
      const currentSection = currentDraft.sections[sectionId] ?? { status: "pending", notes: "", fields: {} };
      const currentRows = Array.isArray(currentSection.fields?.[field.id]) ? currentSection.fields[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>> : [];
      const nextRows = currentRows.map((row, index) => index === rowIndex ? applyRepeaterRowSmartUpdate(data.template, sectionId, field.id, { ...row, [rowFieldId]: value }, rowFieldId) : row);

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
    }, options);
  }

  function addRepeaterRow(sectionId: string, field: Extract<ReportFieldDefinition, { type: "repeater" }>) {
    void applyDraftMutation((currentDraft) => {
      const currentSection = currentDraft.sections[sectionId] ?? { status: "pending", notes: "", fields: {} };
      const currentRows = Array.isArray(currentSection.fields?.[field.id]) ? currentSection.fields[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>> : [];
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
    }, {
      immediateQueue: true
    });
  }

  function removeRepeaterRow(sectionId: string, fieldId: string, rowIndex: number) {
    void applyDraftMutation((currentDraft) => {
      const currentSection = currentDraft.sections[sectionId] ?? { status: "pending", notes: "", fields: {} };
      const currentRows = Array.isArray(currentSection.fields?.[fieldId]) ? currentSection.fields[fieldId] as unknown as Array<Record<string, ReportPrimitiveValue>> : [];
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
    }, {
      immediateQueue: true
    });
  }

  function updateScalarDeficiency(
    item: MobileChecklistItem,
    input: { description?: string; severity?: string; photoStorageKey?: string | null; status?: MobileChecklistItem["status"] }
  ) {
    if (!isScalarChecklistItem(item)) {
      return;
    }

    void applyDraftMutation((currentDraft) => {
      const deficiencyId = buildScalarDeficiencyId(item.sectionId, item.kind.fieldId);
      const currentSection = currentDraft.sections[item.sectionId] ?? { status: "pending", notes: "", fields: {} };
      const currentStatusValue = input.status ? currentSection.fields[item.kind.fieldId] : null;
      const shouldKeep = (input.status ?? item.status) === "negative";
      const nextDeficiencies = shouldKeep
        ? currentDraft.deficiencies.some((deficiency) => deficiency.id === deficiencyId)
          ? currentDraft.deficiencies.map((deficiency) => deficiency.id === deficiencyId ? {
              ...deficiency,
              description: input.description ?? deficiency.description,
              severity: input.severity ?? deficiency.severity,
              photoStorageKey: input.photoStorageKey !== undefined ? input.photoStorageKey ?? undefined : deficiency.photoStorageKey
            } : deficiency)
          : [
              ...currentDraft.deficiencies,
              {
                id: deficiencyId,
                title: item.title,
                description: input.description ?? "",
                severity: input.severity ?? "medium",
                status: "open",
                source: "manual",
                section: item.sectionId,
                sourceRowKey: deficiencyId,
                assetId: null,
                assetTag: null,
                location: item.groupLabel,
                deviceType: null,
                notes: null,
                photoStorageKey: input.photoStorageKey ?? undefined
              }
            ]
        : currentDraft.deficiencies.filter((deficiency) => deficiency.id !== deficiencyId);

      return {
        ...currentDraft,
        deficiencies: nextDeficiencies,
        sections: {
          ...currentDraft.sections,
          [item.sectionId]: {
            ...currentSection,
            fields: currentStatusValue === null || currentStatusValue === undefined ? currentSection.fields : {
              ...currentSection.fields,
              [item.kind.fieldId]: currentStatusValue
            }
          }
        }
      };
    }, {
      immediateQueue: true
    });
  }

  function findRepeaterField(item: MobileChecklistItem) {
    if (item.kind.type !== "repeater-row-field") {
      return null;
    }

    const section = data.template.sections.find((entry) => entry.id === item.sectionId);
    const field = section?.fields.find((entry): entry is Extract<ReportFieldDefinition, { type: "repeater" }> => entry.type === "repeater" && entry.id === item.kind.fieldId);
    return field ?? null;
  }

  function updateChecklistItemStatus(item: MobileChecklistItem, nextStatus: "positive" | "negative" | "not_applicable") {
    const valueMap = nextStatus === "positive"
      ? ["pass", "yes", "good", "normal", "stable", "current", "compliant"]
      : nextStatus === "negative"
        ? ["fail", "no", "deficiency", "damaged", "attention", "poor", "low", "high", "needs_repair"]
        : ["na", "not_applicable"];

    if (item.kind.type === "section-field") {
      const section = data.template.sections.find((entry) => entry.id === item.sectionId);
      const field = section?.fields.find((entry) => entry.type !== "repeater" && entry.id === item.kind.fieldId);
      if (!field || field.type === "repeater") {
        return;
      }

      const option = (field.options ?? []).find((candidate) => valueMap.includes(candidate.value.toLowerCase()));
      if (!option) {
        return;
      }

      updateSectionField(item.sectionId, item.kind.fieldId, option.value);
      if (nextStatus !== "negative") {
        updateScalarDeficiency(item, { status: nextStatus });
      }
      trackChecklistEvent("item_answered", {
        reportId: data.reportId,
        itemId: item.id,
        status: nextStatus
      });
      return;
    }

    const repeaterItem = item.kind;
    if (repeaterItem.type !== "repeater-row-field") {
      return;
    }

    const field = findRepeaterField(item);
    const rowField = field?.rowFields.find((entry) => entry.id === repeaterItem.rowFieldId);
    if (!field || !rowField) {
      return;
    }

    const option = (rowField.options ?? []).find((candidate) => valueMap.includes(candidate.value.toLowerCase()));
    if (!option) {
      return;
    }

    updateRepeaterRowField(item.sectionId, field, repeaterItem.rowIndex, repeaterItem.rowFieldId, option.value, {
      immediateQueue: true,
      eventName: "item_answered",
      eventDetail: {
        itemId: item.id,
        status: nextStatus
      }
    });
  }

  function updateChecklistItemNote(item: MobileChecklistItem, value: string) {
    if (item.kind.type === "section-field") {
      updateScalarDeficiency(item, { description: value, status: item.status });
      trackChecklistEvent("note_added", { reportId: data.reportId, itemId: item.id });
      return;
    }

    const field = findRepeaterField(item);
    if (!field) {
      return;
    }

    const targetFieldId = item.status === "negative" && item.deficiencyNoteFieldId ? item.deficiencyNoteFieldId : item.noteFieldId;
    if (!targetFieldId) {
      return;
    }

    updateRepeaterRowField(item.sectionId, field, item.kind.rowIndex, targetFieldId, value, {
      debounceKey: `${item.id}:note`,
      eventName: "note_added",
      eventDetail: { itemId: item.id }
    });
  }

  function updateChecklistItemSeverity(item: MobileChecklistItem, value: string) {
    if (item.kind.type === "section-field") {
      updateScalarDeficiency(item as Extract<MobileChecklistItem, { kind: { type: "section-field" } }>, { severity: value, status: item.status });
      return;
    }

    const field = findRepeaterField(item);
    if (!field || !item.deficiencySeverityFieldId) {
      return;
    }

    updateRepeaterRowField(item.sectionId, field, item.kind.rowIndex, item.deficiencySeverityFieldId, value, {
      immediateQueue: true
    });
  }

  async function updateChecklistItemPhoto(item: MobileChecklistItem, files: FileList | null) {
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
      trackChecklistEvent("photo_attached", {
        reportId: data.reportId,
        itemId: item.id
      });

      if (item.kind.type === "section-field") {
        updateScalarDeficiency(item, {
          photoStorageKey: prepared.dataUrl,
          status: item.status
        });
        return;
      }

      const field = findRepeaterField(item);
      if (!field || !item.deficiencyPhotoFieldId) {
        return;
      }

      updateRepeaterRowField(item.sectionId, field, item.kind.rowIndex, item.deficiencyPhotoFieldId, prepared.dataUrl, {
        immediateQueue: true
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare this photo for inspection saving.");
    }
  }

  function updateSignature(kind: "technician" | "customer", signerName: string, imageDataUrl: string | null) {
    void applyDraftMutation((currentDraft) => ({
      ...currentDraft,
      signatures: {
        ...currentDraft.signatures,
        [kind]: imageDataUrl ? { signerName: signerName.trim(), imageDataUrl, signedAt: new Date().toISOString() } : undefined
      }
    }), {
      immediateQueue: true
    });
  }

  function updateSignerName(kind: "technician" | "customer", signerName: string) {
    void applyDraftMutation((currentDraft) => ({
      ...currentDraft,
      signatures: {
        ...currentDraft.signatures,
        [kind]: currentDraft.signatures[kind]
          ? { ...currentDraft.signatures[kind], signerName: signerName.trim() }
          : { signerName: signerName.trim(), imageDataUrl: "", signedAt: new Date().toISOString() }
      }
    }), {
      debounceKey: `signature:${kind}`
    });
  }

  async function finalizeInspection() {
    if (finalizeInFlightRef.current || localRecordRef.current?.pendingFinalize) {
      return;
    }

    const nextDraft = createDerivedDraft(data.template, draft);
    setDraft(nextDraft);
    setFinalizeErrorMessage(null);

    try {
      validateFinalizationDraft(nextDraft);
    } catch (error) {
      const message = error instanceof Error ? error.message : null;
      setFinalizeErrorMessage(toTechnicianFacingSaveMessage(message, "finalize"));
      trackChecklistEvent("finalize_sync_failed", {
        reportId: data.reportId,
        reason: message ?? "validation_failed"
      });
      return;
    }

    finalizeInFlightRef.current = true;
    const finalizedAt = new Date().toISOString();
    trackChecklistEvent("finalize_tapped", { reportId: data.reportId });

    try {
      await persistDraftLocally(nextDraft, {
        reportStatus: "submitted",
        pendingFinalize: true,
        finalizedAt,
        syncStatus: "pending",
        lastError: null
      });
      await queueReportFinalizeSync({
        reportId: data.reportId,
        inspectionReportId: data.reportId,
        contentJson: nextDraft,
        taskDisplayLabel: data.customInspectionTypeLabel ?? null
      });
      trackChecklistEvent("finalize_queued_offline", { reportId: data.reportId });
      router.replace("/app/tech/inspections?finalize=queued");
    } catch (error) {
      const message = error instanceof Error ? error.message : null;
      setFinalizeErrorMessage(toTechnicianFacingSaveMessage(message, "finalize"));
      trackChecklistEvent("finalize_sync_failed", { reportId: data.reportId, reason: message ?? "queue_failed" });
    } finally {
      finalizeInFlightRef.current = false;
    }
  }

  const activeChecklistSections = checklist.sections.filter((section) => section.items.length > 0);
  const saveSummary = saveState === "Pending sync"
    ? `${checklist.completedCount - checklist.totalCount < 0 ? Math.max(0, checklist.totalCount - checklist.completedCount) : 0} changes pending`
    : saveState;

  if (!hydrated) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500 shadow-panel">
        Loading inspection checklist...
      </div>
    );
  }

  if (mode === "review") {
    return (
      <div className="space-y-4 pb-32">
        <div className="rounded-[1.75rem] bg-white p-5 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <button
              className="min-h-11 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
              onClick={() => router.push(`/app/tech/reports/${encodeURIComponent(inspectionId)}/${encodeURIComponent(taskId)}`)}
              type="button"
            >
              Back
            </button>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Review & Complete</p>
              <h1 className="mt-1 text-lg font-semibold text-slate-950">{data.inspectionTypeLabel}</h1>
            </div>
            <div className={`text-sm font-semibold ${saveStateTone[saveState] ?? "text-slate-700"}`}>{saveState}</div>
          </div>
          <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-950">{data.siteName}</p>
            <p className="mt-1 text-sm text-slate-500">{data.defaultInspectionTypeLabel}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Passed", String(checklist.positiveCount)],
            ["Failed", String(checklist.negativeCount)],
            ["N/A", String(checklist.notApplicableCount)],
            ["Photos", String(checklist.items.reduce((sum, item) => sum + countChecklistItemPhotos(draft, item), 0))],
            ["Technician signature", missingTechnicianSignature ? "Missing" : "Ready"],
            ["Customer signature", missingCustomerSignature ? "Missing" : "Ready"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-panel">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Blocking issues</p>
            {blockingIssues.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Ready to finalize. This inspection will save locally first and sync in the background.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {blockingIssues.map((issue) => (
                  <p key={issue} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{issue}</p>
                ))}
              </div>
            )}
          </div>
          {warningMessages.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Warnings</p>
              <div className="mt-3 space-y-2">
                {warningMessages.map((warning) => (
                  <p key={warning} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning}</p>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
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

        {(errorMessage || finalizeErrorMessage) ? (
          <p className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow-panel">
            {finalizeErrorMessage ?? errorMessage}
          </p>
        ) : null}

        <div
          className="mobile-keyboard-hide fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-medium text-slate-600">{saveState} • {progressPercent}% checklist complete</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                onClick={() => router.back()}
                type="button"
              >
                Back to Checklist
              </button>
              <button
                className="min-h-12 rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-[var(--tenant-primary-contrast)] disabled:opacity-50"
                disabled={blockingIssues.length > 0 || finalizeInFlightRef.current}
                onClick={() => { void finalizeInspection(); }}
                type="button"
              >
                Finalize Inspection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-32">
      <div className="rounded-[1.75rem] bg-white p-5 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">In Progress</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{data.inspectionTypeLabel}</h1>
            <p className="mt-2 text-sm text-slate-500">{formatChecklistTimestamp(data.scheduledDateLabel)}</p>
          </div>
          <div className={`rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold ${saveStateTone[saveState] ?? "text-slate-700"}`}>
            {saveState}
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-950">{data.siteName}</p>
            <p className="mt-1 text-sm text-slate-500">{data.defaultInspectionTypeLabel}</p>
          </div>
          <DispatchNotesBanner notes={data.dispatchNotes} />
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{checklist.completedCount} of {checklist.totalCount} completed</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[var(--tenant-primary)] transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      {activeChecklistSections.map((section) => (
        <div key={section.sectionId} className="space-y-3">
          <div className="px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{section.sectionLabel}</p>
          </div>
          {section.items.map((item) => {
            const scalarDeficiency = item.kind.type === "section-field"
              ? draft.deficiencies.find((deficiency) => deficiency.id === buildScalarDeficiencyId(item.sectionId, item.kind.fieldId))
              : null;
            const noteValue = item.kind.type === "section-field" ? scalarDeficiency?.description ?? "" : item.status === "negative" && item.deficiencyNoteFieldId ? item.deficiencyNoteValue : item.noteValue;
            const severityValue = item.kind.type === "section-field" ? scalarDeficiency?.severity ?? "medium" : item.deficiencySeverityValue || "medium";
            const photoValue = item.kind.type === "section-field" ? scalarDeficiency?.photoStorageKey ?? null : item.deficiencyPhotoStorageKey;
            const photoCount = photoValue ? 1 : 0;
            const supportsNote = item.kind.type === "section-field" ? item.status === "negative" : Boolean(item.noteFieldId || item.deficiencyNoteFieldId);
            const supportsPhoto = item.kind.type === "section-field" ? item.status === "negative" : Boolean(item.deficiencyPhotoFieldId);
            const supportsSeverity = item.kind.type === "section-field" ? item.status === "negative" : Boolean(item.deficiencySeverityFieldId);

            return (
              <article key={item.id} className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-panel">
                <div className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {item.groupLabel ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.groupLabel}</p> : null}
                      <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-950">{item.title}</h2>
                      {item.description ? <p className="mt-1 text-sm text-slate-500">{item.description}</p> : null}
                    </div>
                    {photoCount > 0 ? <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{photoCount} photo</span> : null}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button
                      className={`min-h-12 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${item.status === "positive" ? "border-emerald-300 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                      onClick={() => updateChecklistItemStatus(item, "positive")}
                      type="button"
                    >
                      Pass
                    </button>
                    <button
                      className={`min-h-12 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${item.status === "negative" ? "border-rose-300 bg-rose-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
                      onClick={() => updateChecklistItemStatus(item, "negative")}
                      type="button"
                    >
                      Fail
                    </button>
                    <button
                      className={`min-h-12 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${item.status === "not_applicable" ? "border-slate-300 bg-slate-700 text-white" : "border-slate-200 bg-white text-slate-700"} disabled:opacity-40`}
                      disabled={!item.supportsNotApplicable}
                      onClick={() => updateChecklistItemStatus(item, "not_applicable")}
                      type="button"
                    >
                      N/A
                    </button>
                  </div>

                  {(item.status === "negative" || supportsNote) ? (
                    <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.status === "negative" ? "Failure detail" : "Item note"}</p>
                        {(item.status === "negative" || noteValue) ? <span className="text-xs font-medium text-slate-500">{item.status === "negative" ? "Review required" : "Saved locally"}</span> : null}
                      </div>
                      {supportsNote ? (
                        <textarea
                          className="mt-3 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                          onChange={(event) => updateChecklistItemNote(item, event.target.value)}
                          placeholder={item.status === "negative" ? "Describe what failed and what the technician observed." : "Add an item note for the field record."}
                          value={noteValue}
                        />
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">This item does not store a dedicated inline note in the current report definition.</p>
                      )}

                      {supportsSeverity ? (
                        <div className="mt-3">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Severity</p>
                          <SelectChips options={buildDefaultSeverityOptions()} value={severityValue} onChange={(value) => updateChecklistItemSeverity(item, value)} />
                        </div>
                      ) : null}

                      {supportsPhoto ? (
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Photo evidence</p>
                            <p className="mt-1 text-sm text-slate-500">Image files only. Photos are compressed for faster offline saving and capped near {(reportPhotoPreparationConfig.preparedMaxBytes / (1024 * 1024)).toFixed(0)} MB each.</p>
                          </div>
                          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">
                            {photoCount > 0 ? "Replace photo" : "Add photo"}
                            <input accept="image/*" className="hidden" onChange={(event) => { void updateChecklistItemPhoto(item, event.target.files); event.target.value = ""; }} type="file" />
                          </label>
                        </div>
                      ) : null}

                      {photoValue ? (
                        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          <Image
                            alt={item.title}
                            className="aspect-[4/3] w-full object-cover"
                            height={240}
                            src={resolveStoredMediaSrc(data.reportId, photoValue) ?? photoValue}
                            unoptimized
                            width={320}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ))}

      <div className="space-y-4">
        {data.template.sections.map((section) => {
          const supplemental = getSupplementalFields(section);
          if (supplemental.scalarFields.length === 0 && supplemental.repeaterFields.length === 0) {
            return null;
          }

          const sectionState = draft.sections[section.id] ?? { status: "pending", notes: "", fields: {} };
          return (
            <details key={section.id} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-panel">
              <summary className="cursor-pointer list-none px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Details</p>
                    <p className="mt-1 text-base font-semibold text-slate-950">{section.label}</p>
                  </div>
                  <span className="text-sm text-slate-500">Expand</span>
                </div>
              </summary>
              <div className="border-t border-slate-200 px-4 py-4">
                <div className="space-y-4">
                  {supplemental.scalarFields.map((field) => {
                    const value = sectionState.fields?.[field.id] as ReportPrimitiveValue;
                    return (
                      <div key={field.id} className="space-y-2">
                        <label className="text-sm font-semibold text-slate-900">{field.label}</label>
                        {field.type === "boolean" ? (
                          <SelectChips
                            options={[
                              { label: "Yes", value: "true" },
                              { label: "No", value: "false" }
                            ]}
                            value={String(Boolean(value))}
                            onChange={(nextValue) => updateSectionField(section.id, field.id, nextValue === "true")}
                          />
                        ) : field.type === "select" ? (
                          <SelectChips
                            options={(field.options ?? []).map((option) => ({ label: option.label, value: option.value }))}
                            value={typeof value === "string" ? value : ""}
                            onChange={(nextValue) => updateSectionField(section.id, field.id, nextValue)}
                          />
                        ) : (
                          <input
                            className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                            onChange={(event) => updateSectionField(section.id, field.id, field.type === "number" ? Number(event.target.value || 0) : event.target.value)}
                            type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                            value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
                          />
                        )}
                      </div>
                    );
                  })}

                  {supplemental.repeaterFields.map((field) => {
                    const rows = Array.isArray(sectionState.fields?.[field.id]) ? sectionState.fields[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>> : [];
                    return (
                      <div key={field.id} className="space-y-3 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{field.label}</p>
                            {field.description ? <p className="mt-1 text-sm text-slate-500">{field.description}</p> : null}
                          </div>
                          <button className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700" onClick={() => addRepeaterRow(section.id, field)} type="button">
                            {field.addLabel ?? "Add row"}
                          </button>
                        </div>
                        {rows.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">No rows added yet.</p> : rows.map((row, rowIndex) => {
                          const visibleRowFields = field.rowFields.filter((rowField) => !rowField.hidden && !rowField.readOnly && !isChecklistHeavyMobileField(rowField) && rowField.id !== "assetId" && rowField.id !== "assetTag" && rowField.id !== "comments" && rowField.id !== "notes");
                          return (
                            <div key={typeof row.__rowId === "string" ? row.__rowId : `${field.id}_${rowIndex}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">{describeRepeaterRowLabel(row, rowIndex)}</p>
                                <button className="text-sm font-semibold text-rose-700" onClick={() => removeRepeaterRow(section.id, field.id, rowIndex)} type="button">Remove</button>
                              </div>
                              <div className="mt-3 space-y-3">
                                {visibleRowFields.map((rowField) => {
                                  const rowValue = row[rowField.id];
                                  return (
                                    <div key={rowField.id} className="space-y-2">
                                      <label className="text-sm font-semibold text-slate-900">{rowField.label}</label>
                                      {rowField.type === "select" ? (
                                        <SelectChips
                                          options={(rowField.options ?? []).map((option) => ({ label: option.label, value: option.value }))}
                                          value={typeof rowValue === "string" ? rowValue : ""}
                                          onChange={(nextValue) => updateRepeaterRowField(section.id, field, rowIndex, rowField.id, nextValue, { immediateQueue: true })}
                                        />
                                      ) : (
                                        <input
                                          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                                          onChange={(event) => updateRepeaterRowField(section.id, field, rowIndex, rowField.id, rowField.type === "number" ? Number(event.target.value || 0) : event.target.value, {
                                            debounceKey: `${section.id}:${field.id}:${rowIndex}:${rowField.id}`
                                          })}
                                          type={rowField.type === "number" ? "number" : rowField.type === "date" ? "date" : "text"}
                                          value={typeof rowValue === "string" || typeof rowValue === "number" ? String(rowValue) : ""}
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {(errorMessage || finalizeErrorMessage) ? (
        <p className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow-panel">
          {finalizeErrorMessage ?? errorMessage}
        </p>
      ) : null}

      <div
        className="mobile-keyboard-hide fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto max-w-5xl">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
            <p>{saveSummary}</p>
            <p>{progressPercent}% complete</p>
          </div>
          <button
            className="min-h-12 w-full rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-[var(--tenant-primary-contrast)]"
            onClick={() => {
              trackChecklistEvent("review_screen_opened", { reportId: data.reportId });
              router.push(`/app/tech/reports/${encodeURIComponent(inspectionId)}/${encodeURIComponent(taskId)}/review`);
            }}
            type="button"
          >
            Review & Complete
          </button>
        </div>
      </div>
    </div>
  );
}
