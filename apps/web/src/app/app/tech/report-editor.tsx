"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { applyRepeaterBulkAction, applyRepeaterRowSmartUpdate, applySectionFieldSmartUpdate, buildRepeaterRowDefaults, buildReportPreview, describeRepeaterRowLabel, duplicateRepeaterRows, getReportPhotoValidationError, isFieldVisible, prepareReportPhotoForDraft, reportPhotoPreparationConfig, shouldAutosaveDraft } from "@testworx/lib";
import type { ReportDraft } from "@testworx/lib";
import type { ReportFieldDefinition, ReportPrimitiveValue, ReportTemplateDefinition } from "@testworx/lib";

import { SignaturePad } from "./signature-pad";

type EditorData = {
  reportId: string;
  reportStatus: "draft" | "submitted" | "finalized";
  reportUpdatedAt: string;
  finalizedAt: string | null;
  correctionNotice?: string | null;
  canEdit: boolean;
  canFinalize: boolean;
  inspectionTypeLabel: string;
  siteName: string;
  customerName: string;
  scheduledDateLabel: string;
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
  Finalized: "text-slate-700"
};

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

function isFieldDisabled(canEdit: boolean, reportStatus: EditorData["reportStatus"], field: ReportFieldDefinition) {
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

export function ReportEditor({ data }: { data: EditorData }) {
  const [draft, setDraft] = useState<ReportDraft>(data.draft);
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

  const saveDraft = useCallback(async (nextDraft: ReportDraft, reason: "timer" | "section" | "manual") => {
    if (!data.canEdit || data.reportStatus === "finalized") {
      return true;
    }

    if (saveInFlightRef.current || (reason === "timer" && autosaveBlockedRef.current)) {
      return false;
    }

    saveInFlightRef.current = true;
    setSaveState("Saving");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/reports/autosave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionReportId: data.reportId, contentJson: nextDraft })
      });

      const payload = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          autosaveBlockedRef.current = true;
        }

        throw new Error(payload.error ?? "Unable to save draft.");
      }

      autosaveBlockedRef.current = false;
      lastSavedAtRef.current = Date.now();
      serverUpdatedAtRef.current = payload.updatedAt ?? serverUpdatedAtRef.current;
      setSaveState(reason === "manual" ? "Saved" : "Saved");
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
  }, [data.canEdit, data.reportId, data.reportStatus, persistBackup]);

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

  function updateDraft(nextDraft: ReportDraft) {
    autosaveBlockedRef.current = false;
    setDraft(nextDraft);
    setDirty(true);
    setSaveState("Unsaved changes");
    setFinalizeErrorMessage(null);
  }

  async function handleSectionChange(nextSectionId: string) {
    const nextDraft = { ...draft, activeSectionId: nextSectionId };
    updateDraft(nextDraft);
    setActiveSectionId(nextSectionId);

    if (shouldAutosaveDraft({ dirty: true, millisecondsSinceLastSave: Date.now() - lastSavedAtRef.current, sectionChanged: true, saveInFlight: saveInFlightRef.current })) {
      await saveDraft(nextDraft, "section");
    }
  }

  function sectionState(sectionId: string) {
    return draft.sections[sectionId] ?? { status: "pending" as const, notes: "", fields: {} };
  }

  function updateSectionField(sectionId: string, fieldId: string, value: string | boolean | number) {
    const currentSection = sectionState(sectionId);
    const nextFields = applySectionFieldSmartUpdate(
      data.template,
      sectionId,
      {
        ...(currentSection.fields as Record<string, ReportPrimitiveValue>),
        [fieldId]: value
      },
      fieldId
    );
    updateDraft({
      ...draft,
      sections: {
        ...draft.sections,
        [sectionId]: {
          ...currentSection,
          fields: nextFields
        }
      }
    });
  }

  function addRepeaterRow(sectionId: string, field: Extract<ReportFieldDefinition, { type: "repeater" }>) {
    const currentRows = Array.isArray(draft.sections[sectionId]?.fields?.[field.id]) ? draft.sections[sectionId]?.fields?.[field.id] as Array<Record<string, ReportPrimitiveValue>> : [];
    const nextRow = buildRepeaterRowDefaults(data.template, sectionId, field.id, currentRows.length);
    updateDraft({
      ...draft,
      sections: {
        ...draft.sections,
        [sectionId]: {
          ...sectionState(sectionId),
          fields: {
            ...sectionState(sectionId).fields,
            [field.id]: [...currentRows, nextRow]
          }
        }
      }
    });
  }

  function duplicateRepeaterRow(sectionId: string, fieldId: string, rowIndex: number) {
    const currentRows = Array.isArray(draft.sections[sectionId]?.fields?.[fieldId]) ? draft.sections[sectionId]?.fields?.[fieldId] as Array<Record<string, ReportPrimitiveValue>> : [];
    updateDraft({
      ...draft,
      sections: {
        ...draft.sections,
        [sectionId]: {
          ...sectionState(sectionId),
          fields: {
            ...sectionState(sectionId).fields,
            [fieldId]: duplicateRepeaterRows(currentRows, rowIndex)
          }
        }
      }
    });
  }

  function applyBulkAction(sectionId: string, field: Extract<ReportFieldDefinition, { type: "repeater" }>, actionId: string) {
    const currentRows = Array.isArray(draft.sections[sectionId]?.fields?.[field.id]) ? draft.sections[sectionId]?.fields?.[field.id] as Array<Record<string, ReportPrimitiveValue>> : [];
    updateDraft({
      ...draft,
      sections: {
        ...draft.sections,
        [sectionId]: {
          ...sectionState(sectionId),
          fields: {
            ...sectionState(sectionId).fields,
            [field.id]: applyRepeaterBulkAction(data.template, sectionId, field.id, currentRows, actionId)
          }
        }
      }
    });
  }

  function removeRepeaterRow(sectionId: string, fieldId: string, rowIndex: number) {
    const currentRows = Array.isArray(draft.sections[sectionId]?.fields?.[fieldId]) ? draft.sections[sectionId]?.fields?.[fieldId] as Array<Record<string, ReportPrimitiveValue>> : [];
    updateDraft({
      ...draft,
      sections: {
        ...draft.sections,
        [sectionId]: {
          ...sectionState(sectionId),
          fields: {
            ...sectionState(sectionId).fields,
            [fieldId]: currentRows.filter((_, index) => index !== rowIndex)
          }
        }
      }
    });
  }

  function updateRepeaterRowField(
    sectionId: string,
    field: Extract<ReportFieldDefinition, { type: "repeater" }>,
    rowIndex: number,
    rowFieldId: string,
    value: ReportPrimitiveValue
  ) {
    const currentRows = Array.isArray(draft.sections[sectionId]?.fields?.[field.id]) ? draft.sections[sectionId]?.fields?.[field.id] as Array<Record<string, ReportPrimitiveValue>> : [];
    const nextRows = currentRows.map((row, index) => {
      if (index !== rowIndex) {
        return row;
      }

      return applyRepeaterRowSmartUpdate(data.template, sectionId, field.id, { ...row, [rowFieldId]: value }, rowFieldId);
    });

    updateDraft({
      ...draft,
      sections: {
        ...draft.sections,
        [sectionId]: {
          ...sectionState(sectionId),
          fields: {
            ...sectionState(sectionId).fields,
            [field.id]: nextRows
          }
        }
      }
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
    const currentSection = sectionState(sectionId);
    updateDraft({
      ...draft,
      sections: {
        ...draft.sections,
        [sectionId]: {
          ...currentSection,
          [key]: key === "notes" ? normalizeEditorText(value) : value
        }
      }
    });
  }

  function addDeficiency() {
    updateDraft({
      ...draft,
      deficiencies: [
        ...draft.deficiencies,
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
    });
  }

  function updateDeficiency(index: number, key: "title" | "description" | "severity" | "status", value: string) {
    updateDraft({
      ...draft,
      deficiencies: draft.deficiencies.map((deficiency, itemIndex) => itemIndex === index ? { ...deficiency, [key]: key === "title" || key === "description" ? normalizeEditorText(value) : value } : deficiency)
    });
  }

  function removeDeficiency(index: number) {
    updateDraft({
      ...draft,
      deficiencies: draft.deficiencies.filter((_, itemIndex) => itemIndex !== index)
    });
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
      updateDraft({ ...draft, attachments: [...draft.attachments, ...attachments] });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare these photos for report saving.");
    }
  }

  function removeAttachment(id: string) {
    updateDraft({ ...draft, attachments: draft.attachments.filter((attachment) => attachment.id !== id) });
  }

  function updateSignature(kind: "technician" | "customer", signerName: string, imageDataUrl: string | null) {
    updateDraft({
      ...draft,
      signatures: {
        ...draft.signatures,
        [kind]: imageDataUrl ? { signerName: normalizeEditorText(signerName), imageDataUrl, signedAt: new Date().toISOString() } : undefined
      }
    });
  }

  function updateSignerName(kind: "technician" | "customer", signerName: string) {
    const normalizedName = normalizeEditorText(signerName);
    updateDraft({
      ...draft,
      signatures: {
        ...draft.signatures,
        [kind]: draft.signatures[kind]
          ? { ...draft.signatures[kind], signerName: normalizedName }
          : { signerName: normalizedName, imageDataUrl: "", signedAt: new Date().toISOString() }
      }
    });
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

    const response = await fetch("/api/reports/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionReportId: data.reportId, contentJson: latestDraftRef.current })
    });
    const payload = await response.json();

    if (!response.ok) {
      setFinalizeErrorMessage(toTechnicianFacingSaveMessage(payload.error, "finalize"));
      setSaveState("Error");
      return;
    }

    setFinalizeErrorMessage(null);
    setSaveState("Finalized");
    setDirty(false);
    window.localStorage.removeItem(backupKey);
    window.location.assign("/app/tech?report=finalized");
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

  return (
    <div className="space-y-6 pb-28 lg:pb-8">
      <div className="rounded-[2rem] bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{data.inspectionTypeLabel}</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">{data.siteName}</h2>
            <p className="mt-2 text-sm text-slate-500">{data.customerName} | {data.scheduledDateLabel}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-slate-500">Save state</p>
            <p className={`mt-1 font-semibold ${saveStateTone[saveState] ?? "text-slate-700"}`}>{saveState}</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p>Context: {draft.context.assetCount} matching assets at this site.</p>
          {draft.context.priorReportSummary ? <p className="mt-2">Smart default: {draft.context.priorReportSummary}</p> : null}
          <p className="mt-2">Autosave runs every few seconds and when you switch sections.</p>
          {data.finalizedAt ? <p className="mt-2">Finalized at {new Date(data.finalizedAt).toLocaleString()}</p> : null}
          {data.paymentCollectionNotice ? <p className="mt-2 font-semibold text-amber-900">{data.paymentCollectionNotice}</p> : null}
          {data.correctionNotice ? <p className="mt-2 font-medium text-amber-900">{data.correctionNotice}</p> : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.4fr]">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[2rem] bg-white p-4 shadow-panel">
            <h3 className="text-lg font-semibold text-ink">Sections</h3>
            <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 xl:grid xl:overflow-visible xl:pb-0">
              {data.template.sections.map((section) => (
                <button
                  key={section.id}
                  className={`min-h-16 min-w-[15rem] snap-start rounded-2xl border px-4 py-4 text-left xl:min-w-0 ${activeSectionId === section.id ? "border-slateblue bg-slateblue text-white" : "border-slate-200 bg-white text-ink"}`}
                  onClick={() => { void handleSectionChange(section.id); }}
                  type="button"
                >
                  <p className="font-semibold">{sectionStatusLabel(preview.sectionSummaries.find((summary) => summary.sectionId === section.id) ?? { sectionId: section.id, sectionLabel: section.label, status: "pending", notes: "", completionState: "not_started", completedRows: 0, totalRows: 0, deficiencyCount: 0 })}</p>
                  <p className={`mt-1 text-sm ${activeSectionId === section.id ? "text-white/80" : "text-slate-500"}`}>{draft.sections[section.id]?.status ?? "pending"}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="hidden rounded-[2rem] bg-white p-4 shadow-panel lg:block">
            <div className="flex gap-3">
              <button className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-ink" onClick={() => setShowPreview((current) => !current)} type="button">
                {showPreview ? "Hide preview" : "Preview"}
              </button>
              <button className="flex-1 rounded-2xl bg-ember px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized" || saveInFlightRef.current} onClick={() => { void saveDraft(draft, "manual"); }} type="button">
                Save now
              </button>
            </div>
            <button className="mt-3 w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!canFinalizeNow} onClick={() => { void finalizeReport(); }} type="button">
              Finalize report
            </button>
            {finalizeReadinessMessage ? <p className="mt-3 text-sm text-amber-700">{finalizeReadinessMessage}</p> : null}
            {visibleErrorMessage ? <p className="mt-3 text-sm text-rose-600">{visibleErrorMessage}</p> : null}
            {backupWarning ? <p className="mt-3 text-sm text-amber-700">{backupWarning}</p> : null}
          </div>
        </aside>

        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white p-5 shadow-panel">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-ink">{activeSection.label}</h3>
                <p className="mt-2 text-sm text-slate-500">{activeSection.description}</p>
                {activeSectionSummary?.totalRows ? <p className="mt-2 text-sm font-medium text-slate-600">{activeSectionSummary.completedRows} of {activeSectionSummary.totalRows} rows complete</p> : null}
              </div>
              <select className="min-h-12 rounded-2xl border border-slate-200 px-4 py-3 text-base uppercase" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateSectionMeta(activeSection.id, "status", event.target.value)} value={draft.sections[activeSection.id]?.status ?? "pending"}>
                <option value="pending">{normalizeOptionLabel("Pending")}</option>
                <option value="pass">{normalizeOptionLabel("Pass")}</option>
                <option value="attention">{normalizeOptionLabel("Attention")}</option>
                <option value="fail">{normalizeOptionLabel("Fail")}</option>
              </select>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p>Section {activeSectionIndex + 1} of {data.template.sections.length}</p>
              <div className="flex gap-2">
                <button className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 py-2 font-semibold text-ink disabled:opacity-50" disabled={!previousSectionId} onClick={() => { if (previousSectionId) { void handleSectionChange(previousSectionId); } }} type="button">
                  Previous
                </button>
                <button className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 py-2 font-semibold text-ink disabled:opacity-50" disabled={!nextSectionId} onClick={() => { if (nextSectionId) { void handleSectionChange(nextSectionId); } }} type="button">
                  Next
                </button>
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
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-ink">{describeRepeaterRowLabel(row, rowIndex)}</p>
                                {detectedDeficiency ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Warning: Deficiency created</p> : null}
                              </div>
                              <div className="flex items-center gap-2">
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
                                    <select className={`min-h-14 uppercase ${fieldShellClassName(rowField.readOnly)}`} disabled={isFieldDisabled(data.canEdit, data.reportStatus, rowField)} onChange={(event) => updateRepeaterRowField(activeSection.id, field, rowIndex, rowField.id, event.target.value)} value={String(row[rowField.id] ?? "")}>
                                      <option value="">{normalizeOptionLabel("Select")}</option>
                                      {rowField.options?.map((option) => <option key={option.value} value={option.value}>{normalizeOptionLabel(option.label)}</option>)}
                                    </select>
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
                                      <select className={`min-h-14 uppercase ${fieldShellClassName(deficiencySeverityField.readOnly)}`} disabled={isFieldDisabled(data.canEdit, data.reportStatus, deficiencySeverityField)} onChange={(event) => updateRepeaterRowField(activeSection.id, field, rowIndex, deficiencySeverityField.id, event.target.value)} value={String(row[deficiencySeverityField.id] ?? "")}>
                                        <option value="">{normalizeOptionLabel("Select")}</option>
                                        {deficiencySeverityField.options?.map((option) => <option key={option.value} value={option.value}>{normalizeOptionLabel(option.label)}</option>)}
                                      </select>
                                    </div>
                                  ) : null}
                                  {deficiencyNotesField ? (
                                    <div className="space-y-2 md:col-span-2">
                                      <label className="block text-sm font-medium text-slate-600">{deficiencyNotesField.label}</label>
                                      <textarea className="min-h-24 w-full rounded-[1.5rem] border border-slate-200 px-4 py-4 text-base uppercase" disabled={isFieldDisabled(data.canEdit, data.reportStatus, deficiencyNotesField)} onChange={(event) => updateRepeaterRowField(activeSection.id, field, rowIndex, deficiencyNotesField.id, normalizeEditorText(event.target.value))} placeholder={deficiencyNotesField.placeholder} value={String(row[deficiencyNotesField.id] ?? "")} />
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
                    <select className={`min-h-14 uppercase ${fieldShellClassName(field.readOnly)}`} disabled={isFieldDisabled(data.canEdit, data.reportStatus, field)} onChange={(event) => updateSectionField(activeSection.id, field.id, event.target.value)} value={String(draft.sections[activeSection.id]?.fields?.[field.id] ?? "")}>
                      <option value="">{normalizeOptionLabel("Select")}</option>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{normalizeOptionLabel(option.label)}</option>)}
                    </select>
                  ) : field.type === "photo" ? (
                    <div className="space-y-3 rounded-[1.5rem] border border-slate-200 p-3">
                      {draft.sections[activeSection.id]?.fields?.[field.id] ? <Image alt={field.label} className="h-40 w-full rounded-2xl object-cover" height={160} src={resolveStoredMediaSrc(data.reportId, String(draft.sections[activeSection.id]?.fields?.[field.id] ?? "")) ?? String(draft.sections[activeSection.id]?.fields?.[field.id] ?? "")} unoptimized width={320} /> : <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No photo attached.</p>}
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
                <textarea className="mt-2 min-h-32 w-full rounded-[1.5rem] border border-slate-200 px-4 py-4 text-base uppercase" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateSectionMeta(activeSection.id, "notes", event.target.value)} value={draft.sections[activeSection.id]?.notes ?? ""} />
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-5 shadow-panel">
            <h3 className="text-xl font-semibold text-ink">Technician notes</h3>
            <textarea className="mt-4 min-h-32 w-full rounded-[1.5rem] border border-slate-200 px-4 py-4 text-base uppercase" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateDraft({ ...draft, overallNotes: normalizeEditorText(event.target.value) })} value={draft.overallNotes} />
          </div>

          <div className="rounded-[2rem] bg-white p-5 shadow-panel">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-ink">Deficiencies</h3>
              <button className="min-h-12 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-ink disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized"} onClick={addDeficiency} type="button">
                Add deficiency
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {draft.deficiencies.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No deficiencies captured.</p> : draft.deficiencies.map((deficiency, index) => (
                <div key={deficiency.id} className="space-y-3 rounded-[1.5rem] border border-slate-200 p-4">
                  <input className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 py-3 uppercase" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateDeficiency(index, "title", event.target.value)} placeholder="Deficiency title" value={deficiency.title} />
                  <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 uppercase" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateDeficiency(index, "description", event.target.value)} placeholder="Describe the deficiency" value={deficiency.description} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <select className="min-h-12 rounded-2xl border border-slate-200 px-4 py-3 uppercase" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateDeficiency(index, "severity", event.target.value)} value={deficiency.severity}>
                      <option value="low">{normalizeOptionLabel("Low")}</option>
                      <option value="medium">{normalizeOptionLabel("Medium")}</option>
                      <option value="high">{normalizeOptionLabel("High")}</option>
                      <option value="critical">{normalizeOptionLabel("Critical")}</option>
                    </select>
                    <select className="min-h-12 rounded-2xl border border-slate-200 px-4 py-3 uppercase" disabled={!data.canEdit || data.reportStatus === "finalized"} onChange={(event) => updateDeficiency(index, "status", event.target.value)} value={deficiency.status}>
                      <option value="open">{normalizeOptionLabel("Open")}</option>
                      <option value="quoted">{normalizeOptionLabel("Quoted")}</option>
                      <option value="approved">{normalizeOptionLabel("Approved")}</option>
                      <option value="scheduled">{normalizeOptionLabel("Scheduled")}</option>
                      <option value="resolved">{normalizeOptionLabel("Resolved")}</option>
                      <option value="ignored">{normalizeOptionLabel("Ignored")}</option>
                    </select>
                  </div>
                  <button className="min-h-12 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized"} onClick={() => removeDeficiency(index)} type="button">
                    Remove deficiency
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-5 shadow-panel">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-ink">Photo attachments</h3>
                <p className="mt-1 text-sm text-slate-500">Image files only. Photos are automatically compressed for faster saving and capped at about {(reportPhotoPreparationConfig.preparedMaxBytes / (1024 * 1024)).toFixed(0)} MB each after preparation.</p>
              </div>
              <label className="inline-flex min-h-12 cursor-pointer items-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-ink">
                Add photos
                <input accept="image/*" className="hidden" disabled={!data.canEdit || data.reportStatus === "finalized"} multiple onChange={(event) => { void handleFilesSelected(event.target.files); event.target.value = ""; }} type="file" />
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {draft.attachments.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No photos attached.</p> : draft.attachments.map((attachment) => (
                <div key={attachment.id} className="space-y-3 rounded-[1.5rem] border border-slate-200 p-3">
                  <Image alt={attachment.fileName} className="h-40 w-full rounded-2xl object-cover" height={160} src={resolveStoredMediaSrc(data.reportId, attachment.storageKey) ?? attachment.storageKey} unoptimized width={320} />
                  <div>
                    <p className="font-medium text-ink">{attachment.fileName}</p>
                    <p className="text-sm text-slate-500">{attachment.mimeType}</p>
                  </div>
                  <button className="min-h-12 rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={!data.canEdit || data.reportStatus === "finalized"} onClick={() => removeAttachment(attachment.id)} type="button">
                    Remove photo
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
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
          {(visibleErrorMessage || backupWarning || finalizeReadinessMessage) ? (
            <div
              className="fixed inset-x-0 z-20 px-4 lg:hidden"
              style={{ bottom: "calc(5.75rem + env(safe-area-inset-bottom))" }}
            >
              <div className="mx-auto max-w-7xl space-y-2">
                {visibleErrorMessage ? <p className="rounded-2xl border border-rose-200 bg-white/95 px-4 py-3 text-sm text-rose-700 shadow-xl backdrop-blur">{visibleErrorMessage}</p> : null}
                {backupWarning ? <p className="rounded-2xl border border-amber-200 bg-white/95 px-4 py-3 text-sm text-amber-700 shadow-xl backdrop-blur">{backupWarning}</p> : null}
                {finalizeReadinessMessage ? <p className="rounded-2xl border border-amber-200 bg-white/95 px-4 py-3 text-sm text-amber-700 shadow-xl backdrop-blur">{finalizeReadinessMessage}</p> : null}
              </div>
            </div>
          ) : null}
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur lg:hidden"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto max-w-7xl">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
              <p>{saveState}</p>
              <p>{Math.round(preview.reportCompletion * 100)}% complete</p>
            </div>
          </div>
          <div className="mx-auto flex max-w-7xl gap-3">
            <button className="rounded-2xl border border-slate-200 px-3 py-3 text-sm font-semibold text-ink disabled:opacity-50" disabled={!previousSectionId} onClick={() => { if (previousSectionId) { void handleSectionChange(previousSectionId); } }} type="button">
              Prev
            </button>
            <button className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-ink" onClick={() => setShowPreview((current) => !current)} type="button">
              {showPreview ? "Hide preview" : "Preview"}
            </button>
            <button className="flex-1 rounded-2xl bg-ember px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={saveInFlightRef.current} onClick={() => { void saveDraft(draft, "manual"); }} type="button">
              Save now
            </button>
            <button className="flex-1 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!canFinalizeNow} onClick={() => { void finalizeReport(); }} type="button">
              Finalize
            </button>
            <button className="rounded-2xl border border-slate-200 px-3 py-3 text-sm font-semibold text-ink disabled:opacity-50" disabled={!nextSectionId} onClick={() => { if (nextSectionId) { void handleSectionChange(nextSectionId); } }} type="button">
              Next
            </button>
          </div>
        </div>
        </>
      ) : null}
    </div>
  );
}
