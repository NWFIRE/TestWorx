"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyRepeaterRowSmartUpdate,
  applySectionFieldSmartUpdate,
  buildRepeaterRowDefaults,
  getReportPhotoValidationError,
  prepareReportPhotoForDraft,
  validateFinalizationDraft,
  type ReportDraft,
  type ReportFieldDefinition,
  type ReportPrimitiveValue
} from "@testworx/lib";

import type { TechnicianReportEditorData } from "./report-editor";
import { getLocalReportDraft, putLocalReportDraft, subscribeToOfflineChanges } from "./offline/offline-db";
import { initializeLocalReportRecord, queueReportDraftSync, queueReportFinalizeSync, startTechnicianSyncEngine } from "./offline/offline-sync";
import type { LocalReportDraftRecord } from "./offline/offline-types";

function buildReportSaveState(record: LocalReportDraftRecord | null, reportStatus: TechnicianReportEditorData["reportStatus"]) {
  if (!record) {
    return reportStatus === "finalized" ? "Finalized" : "Saved";
  }

  if (record.pendingFinalize) {
    if (record.syncStatus === "conflict") {
      return "Needs review";
    }

    if (record.syncStatus === "failed") {
      return "Finalize queued";
    }

    if (record.syncStatus === "syncing" || record.syncStatus === "pending") {
      return window.navigator.onLine ? "Finalizing" : "Finalize queued";
    }

    return "Finalize queued";
  }

  if (record.reportStatus === "finalized" && !record.pendingFinalize) {
    return "Finalized";
  }

  if (record.syncStatus === "conflict") {
    return "Needs review";
  }

  if (record.syncStatus === "failed") {
    return "Saved on device";
  }

  if (record.syncStatus === "syncing") {
    return "Syncing";
  }

  if (record.syncStatus === "pending") {
    return window.navigator.onLine ? "Pending sync" : "Saved locally";
  }

  return "Saved";
}

const VISIT_ACTIVITY_METADATA_FIELDS = new Set([
  "sourceReportId",
  "sourceReportItemId",
  "carriedForwardFromDate",
  "carryForwardStatus",
  "visitStatus",
  "billableStatus"
]);

function applyVisitActivityMetadata(
  row: Record<string, ReportPrimitiveValue>,
  changedFieldId: string,
  value: ReportPrimitiveValue
) {
  if (VISIT_ACTIVITY_METADATA_FIELDS.has(changedFieldId)) {
    return row;
  }

  const nextRow = { ...row };
  const hasPriorSource = typeof nextRow.sourceReportId === "string" && nextRow.sourceReportId.trim().length > 0;

  if (changedFieldId === "servicePerformed") {
    const selectedService = typeof value === "string" ? value : "";
    if (selectedService === "New") {
      nextRow.visitStatus = "new";
      nextRow.billableStatus = "billable_new";
      return nextRow;
    }

    if (selectedService === "Removed from Service") {
      nextRow.visitStatus = "removed";
      nextRow.billableStatus = "not_billable";
      return nextRow;
    }

    if (selectedService && selectedService !== "Annual Inspection") {
      const isReplacement = selectedService.toLowerCase().includes("replac");
      nextRow.visitStatus = isReplacement ? "replaced" : "serviced";
      nextRow.billableStatus = isReplacement ? "billable_replacement" : "billable_service";
      return nextRow;
    }
  }

  if (hasPriorSource && (nextRow.visitStatus === "not_reviewed" || nextRow.visitStatus === "confirmed")) {
    nextRow.visitStatus = "updated";
  }

  return nextRow;
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

  if (/signatures are required|items need attention|add at least one/i.test(normalized)) {
    return normalized;
  }

  return action === "save"
    ? "Unable to save your inspection right now. Check your connection and try again."
    : "Unable to finalize this inspection right now. Review the inspection and try again.";
}

function toTechnicianFacingStoredSyncMessage(message: string | null | undefined, action: "save" | "finalize") {
  const normalized = (message ?? "").trim();
  if (/locked|cannot edit|cannot be finalized|already finalized|already completed|closed inspections/i.test(normalized)) {
    return "Your work is saved on this iPad, but the office copy changed. Open Profile or contact the office before continuing.";
  }

  return action === "save"
    ? "Your work is saved on this iPad. TradeWorx will keep trying to upload it."
    : "Finalization is saved on this iPad. TradeWorx will keep trying to upload it.";
}

export function useMobileReportDraftController({
  data,
  inspectionId,
  taskId
}: {
  data: TechnicianReportEditorData;
  inspectionId: string;
  taskId: string;
}) {
  const [draft, setDraft] = useState<ReportDraft>(data.draft);
  const [saveState, setSaveState] = useState(data.reportStatus === "finalized" ? "Finalized" : "Saved");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [finalizeErrorMessage, setFinalizeErrorMessage] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [finalizeInFlight, setFinalizeInFlight] = useState(false);
  const draftRef = useRef<ReportDraft>(data.draft);
  const localRecordRef = useRef<LocalReportDraftRecord | null>(null);
  const queueTimerRef = useRef<number | null>(null);
  const fieldTimerRef = useRef<Map<string, number>>(new Map());
  const localInteractionStartedRef = useRef(false);
  const finalizeInFlightRef = useRef(false);

  const clearPendingDraftSyncTimers = useCallback(() => {
    if (queueTimerRef.current) {
      window.clearTimeout(queueTimerRef.current);
      queueTimerRef.current = null;
    }

    fieldTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
    fieldTimerRef.current.clear();
  }, []);

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
      inspectionId: localRecordRef.current?.inspectionId ?? inspectionId,
      taskId: localRecordRef.current?.taskId ?? taskId,
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
  }, [data.customInspectionTypeLabel, data.reportId, data.reportStatus, data.reportUpdatedAt, inspectionId, taskId]);

  const scheduleDraftSync = useCallback((nextDraft: ReportDraft, delay = 300) => {
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
          setSaveState(window.navigator.onLine ? "Pending sync" : "Saved locally");
        } catch (error) {
          setErrorMessage(toTechnicianFacingSaveMessage(error instanceof Error ? error.message : null, "save"));
          setSaveState("Error");
        }
      })();
    }, delay);
  }, [data.customInspectionTypeLabel, data.reportId]);

  const applyDraftMutation = useCallback(async (
    mutation: (currentDraft: ReportDraft) => ReportDraft,
    options?: {
      debounceKey?: string;
      immediateQueue?: boolean;
    }
  ) => {
    localInteractionStartedRef.current = true;
    const nextDraft = mutation(draftRef.current);
    draftRef.current = nextDraft;
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

      if (options?.debounceKey) {
        const existingTimer = fieldTimerRef.current.get(options.debounceKey);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }

        const timerId = window.setTimeout(() => {
          scheduleDraftSync(nextDraft, 0);
          fieldTimerRef.current.delete(options.debounceKey!);
        }, 450);
        fieldTimerRef.current.set(options.debounceKey, timerId);
        setSaveState("Saved locally");
        return;
      }

      scheduleDraftSync(nextDraft, options?.immediateQueue ? 0 : 200);
      setSaveState(window.navigator.onLine ? "Pending sync" : "Saved locally");
    } catch (error) {
      setErrorMessage(toTechnicianFacingSaveMessage(error instanceof Error ? error.message : null, "save"));
      setSaveState("Error");
    }
  }, [persistDraftLocally, scheduleDraftSync]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateLocalDraft() {
      startTechnicianSyncEngine();
      const initialRecord: LocalReportDraftRecord = {
        reportId: data.reportId,
        inspectionId,
        taskId,
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
        draftRef.current = localRecord.draft as ReportDraft;
        setDraft(draftRef.current);
      }
      setSaveState(buildReportSaveState(localRecord, data.reportStatus));
      if (localRecord.lastError) {
        setErrorMessage(toTechnicianFacingStoredSyncMessage(localRecord.lastError, localRecord.pendingFinalize ? "finalize" : "save"));
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
        if (!localInteractionStartedRef.current) {
          draftRef.current = current.draft as ReportDraft;
          setDraft(draftRef.current);
        }
        setSaveState(buildReportSaveState(current, data.reportStatus));
        if (current.lastError) {
          setErrorMessage(toTechnicianFacingStoredSyncMessage(current.lastError, current.pendingFinalize ? "finalize" : "save"));
        } else {
          setErrorMessage(null);
        }
      })();
    });

    const activeFieldTimers = fieldTimerRef.current;

    return () => {
      cancelled = true;
      unsubscribe();
      if (queueTimerRef.current) {
        window.clearTimeout(queueTimerRef.current);
      }
      activeFieldTimers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [data.customInspectionTypeLabel, data.draft, data.finalizedAt, data.reportId, data.reportStatus, data.reportUpdatedAt, inspectionId, taskId]);

  const updateSectionField = useCallback((sectionId: string, fieldId: string, value: ReportPrimitiveValue) => {
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
    }, { immediateQueue: true });
  }, [applyDraftMutation, data.template]);

  const updateRepeaterRowField = useCallback((
    sectionId: string,
    field: Extract<ReportFieldDefinition, { type: "repeater" }>,
    rowIndex: number,
    rowFieldId: string,
    value: ReportPrimitiveValue,
    options?: {
      debounceKey?: string;
      immediateQueue?: boolean;
    }
  ) => {
    void applyDraftMutation((currentDraft) => {
      const currentSection = currentDraft.sections[sectionId] ?? { status: "pending", notes: "", fields: {} };
      const currentRows = Array.isArray(currentSection.fields?.[field.id])
        ? currentSection.fields[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>>
        : [];
      const nextRows = currentRows.map((row, index) => index === rowIndex
        ? applyVisitActivityMetadata(
            applyRepeaterRowSmartUpdate(data.template, sectionId, field.id, { ...row, [rowFieldId]: value }, rowFieldId),
            rowFieldId,
            value
          )
        : row
      );

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
  }, [applyDraftMutation, data.template]);

  const addRepeaterRow = useCallback((sectionId: string, field: Extract<ReportFieldDefinition, { type: "repeater" }>) => {
    void applyDraftMutation((currentDraft) => {
      const currentSection = currentDraft.sections[sectionId] ?? { status: "pending", notes: "", fields: {} };
      const currentRows = Array.isArray(currentSection.fields?.[field.id])
        ? currentSection.fields[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>>
        : [];
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
    }, { immediateQueue: true });
  }, [applyDraftMutation, data.template]);

  const removeRepeaterRow = useCallback((sectionId: string, fieldId: string, rowIndex: number) => {
    void applyDraftMutation((currentDraft) => {
      const currentSection = currentDraft.sections[sectionId] ?? { status: "pending", notes: "", fields: {} };
      const currentRows = Array.isArray(currentSection.fields?.[fieldId])
        ? currentSection.fields[fieldId] as unknown as Array<Record<string, ReportPrimitiveValue>>
        : [];

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
    }, { immediateQueue: true });
  }, [applyDraftMutation]);

  const updateSectionPhotoField = useCallback(async (sectionId: string, fieldId: string, files: FileList | null) => {
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
      setErrorMessage(toTechnicianFacingSaveMessage(error instanceof Error ? error.message : null, "save"));
    }
  }, [data.canEdit, data.reportStatus, updateSectionField]);

  const updateRepeaterRowPhoto = useCallback(async (
    sectionId: string,
    field: Extract<ReportFieldDefinition, { type: "repeater" }>,
    rowIndex: number,
    rowFieldId: string,
    files: FileList | null
  ) => {
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
      updateRepeaterRowField(sectionId, field, rowIndex, rowFieldId, prepared.dataUrl, { immediateQueue: true });
    } catch (error) {
      setErrorMessage(toTechnicianFacingSaveMessage(error instanceof Error ? error.message : null, "save"));
    }
  }, [data.canEdit, data.reportStatus, updateRepeaterRowField]);

  const selectSection = useCallback((sectionId: string) => {
    void applyDraftMutation((currentDraft) => ({
      ...currentDraft,
      activeSectionId: sectionId
    }), { immediateQueue: true });
  }, [applyDraftMutation]);

  const updateSignature = useCallback((kind: "technician" | "customer", signerName: string, imageDataUrl: string | null) => {
    void applyDraftMutation((currentDraft) => ({
      ...currentDraft,
      signatures: {
        ...currentDraft.signatures,
        [kind]: imageDataUrl ? { signerName: signerName.trim(), imageDataUrl, signedAt: new Date().toISOString() } : undefined
      }
    }), { immediateQueue: true });
  }, [applyDraftMutation]);

  const updateSignerName = useCallback((kind: "technician" | "customer", signerName: string) => {
    void applyDraftMutation((currentDraft) => ({
      ...currentDraft,
      signatures: {
        ...currentDraft.signatures,
        [kind]: currentDraft.signatures[kind]
          ? { ...currentDraft.signatures[kind], signerName }
          : { signerName, imageDataUrl: "", signedAt: new Date().toISOString() }
      }
    }), {
      debounceKey: `signature:${kind}`
    });
  }, [applyDraftMutation]);

  const persistCurrentDraftLocally = useCallback(async () => {
    await persistDraftLocally(draftRef.current, {
      reportStatus: localRecordRef.current?.reportStatus ?? "draft",
      pendingFinalize: localRecordRef.current?.pendingFinalize ?? false,
      finalizedAt: localRecordRef.current?.finalizedAt ?? null,
      syncStatus: localRecordRef.current?.syncStatus ?? "pending",
      lastError: null
    });
  }, [persistDraftLocally]);

  const finalizeReport = useCallback(async () => {
    if (finalizeInFlightRef.current) {
      return { ok: false as const };
    }

    if (localRecordRef.current?.pendingFinalize) {
      setSaveState(buildReportSaveState(localRecordRef.current, data.reportStatus));
      return { ok: true as const };
    }

    const nextDraft = draftRef.current;
    setFinalizeErrorMessage(null);

    try {
      validateFinalizationDraft(nextDraft);
    } catch (error) {
      const message = error instanceof Error ? error.message : null;
      setFinalizeErrorMessage(toTechnicianFacingSaveMessage(message, "finalize"));
      return { ok: false as const };
    }

    finalizeInFlightRef.current = true;
    setFinalizeInFlight(true);
    const finalizedAt = new Date().toISOString();

    try {
      clearPendingDraftSyncTimers();
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

      setSaveState("Finalize queued");

      return { ok: true as const };
    } catch (error) {
      setFinalizeErrorMessage(toTechnicianFacingSaveMessage(error instanceof Error ? error.message : null, "finalize"));
      return { ok: false as const };
    } finally {
      finalizeInFlightRef.current = false;
      setFinalizeInFlight(false);
    }
  }, [clearPendingDraftSyncTimers, data.customInspectionTypeLabel, data.reportId, data.reportStatus, persistDraftLocally]);

  return {
    draft,
    draftRef,
    hydrated,
    saveState,
    errorMessage,
    finalizeErrorMessage,
    finalizeInFlight,
    setErrorMessage,
    updateSectionField,
    updateRepeaterRowField,
    addRepeaterRow,
    removeRepeaterRow,
    updateSectionPhotoField,
    updateRepeaterRowPhoto,
    selectSection,
    updateSignature,
    updateSignerName,
    persistCurrentDraftLocally,
    finalizeReport
  };
}
