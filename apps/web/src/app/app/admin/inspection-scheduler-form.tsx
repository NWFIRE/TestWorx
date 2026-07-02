"use client";

import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerOption, SiteOption, TechnicianOption } from "@testworx/types";
import {
  customInspectionSiteName,
  customInspectionSiteOptionValue,
  defaultScheduledStartForMonth,
  editableInspectionStatuses,
  formatInspectionClassificationLabel,
  formatInspectionStatusLabel,
  formatInspectionTaskSchedulingStatusLabel,
  formatInspectionTaskTypeLabel,
  genericInspectionSiteOptionValue,
  getDefaultInspectionRecurrenceFrequency,
  inspectionClassificationValues,
  inspectionTaskSchedulingStatuses,
  inspectionTypeRegistry,
  isUserFacingSiteLabel,
  noFixedInspectionSiteLabel,
  purchaseOrderInspectionSiteLabel,
  purchaseOrderInspectionSiteOptionValue
} from "@testworx/lib";

import { SearchSelect, type SearchSelectOption } from "@/app/search-select";
import { useToast } from "@/app/toast-provider";

type InspectionType = keyof typeof inspectionTypeRegistry;
type RecurrenceFrequency = "ONCE" | "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
type InspectionTaskSchedulingStatus = (typeof inspectionTaskSchedulingStatuses)[number];
const recurrenceOptions: RecurrenceFrequency[] = ["ONCE", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];
type EditableInspectionStatus = (typeof editableInspectionStatuses)[number];
type InspectionClassification = (typeof inspectionClassificationValues)[number];
const statusOptions = editableInspectionStatuses;
const inspectionClassificationOptions = inspectionClassificationValues;
type InspectionSchedulerFormState = {
  error: string | null;
  success: string | null;
  redirectTo?: string | null;
  createdInspectionId?: string | null;
  duplicateWarning?: {
    matches: Array<{
      id: string;
      customerName: string;
      siteName: string;
      siteAddress: string | null;
      scheduledStart: string;
      scheduledEnd: string | null;
      status: string;
      inspectionClassification: string;
      reportTypes: Array<{ inspectionType: InspectionType; label: string; status: string }>;
      assignedTechnicians: string[];
      workOrderSource: string | null;
      quoteSource: string | null;
      duplicateReasons: string[];
      missingReportTypes: Array<{ inspectionType: InspectionType; label: string }>;
      canAddReportTypesToExisting: boolean;
    }>;
  } | null;
};

const initialState: InspectionSchedulerFormState = {
  error: null,
  success: null,
  redirectTo: null,
  createdInspectionId: null,
  duplicateWarning: null
};
const inspectionTypeOptions = Object.keys(inspectionTypeRegistry) as InspectionType[];
const serviceSchedulingOptions: InspectionTaskSchedulingStatus[] = [
  "due_now",
  "scheduled_now",
  "scheduled_future",
  "not_scheduled",
  "completed",
  "deferred"
];
const maxExternalDocumentUploadBytes = 50 * 1024 * 1024;
const maxExternalDocumentUploadLabel = "50 MB";

type InspectionTaskValue = {
  inspectionType: InspectionType;
  frequency: RecurrenceFrequency;
  assignedTechnicianId?: string | null;
  dueMonth?: string;
  dueDate?: string;
  schedulingStatus?: InspectionTaskSchedulingStatus;
  notes?: string;
};

type ServiceLineDraft = {
  id: string;
  inspectionType: InspectionType;
  frequency: RecurrenceFrequency;
  assignedTechnicianId: string;
  dueMonth: string;
  dueDate: string;
  schedulingStatus: InspectionTaskSchedulingStatus;
  notes: string;
};

export type InspectionSchedulerFormInitialValues = {
  inspectionId?: string;
  customerCompanyId?: string;
  siteId?: string;
  inspectionClassification?: InspectionClassification;
  isPriority?: boolean;
  inspectionMonth?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  assignedTechnicianIds?: string[];
  status?: EditableInspectionStatus;
  notes?: string;
  tasks?: InspectionTaskValue[];
};

function createServiceLineDraft(
  inspectionMonth: string,
  initialValue?: InspectionTaskValue
): ServiceLineDraft {
  const inspectionType = initialValue?.inspectionType ?? inspectionTypeOptions[0] ?? "fire_extinguisher";
  return {
    id: crypto.randomUUID(),
    inspectionType,
    frequency: initialValue?.frequency ?? getDefaultInspectionRecurrenceFrequency(inspectionType),
    assignedTechnicianId: initialValue?.assignedTechnicianId ?? "",
    dueMonth: initialValue?.dueMonth ?? inspectionMonth,
    dueDate: initialValue?.dueDate ?? "",
    schedulingStatus: initialValue?.schedulingStatus ?? "scheduled_now",
    notes: initialValue?.notes ?? ""
  };
}

function buildInitialServiceLines(initialValues?: InspectionSchedulerFormInitialValues) {
  const inspectionMonth =
    initialValues?.inspectionMonth ??
    (initialValues?.scheduledStart ? initialValues.scheduledStart.slice(0, 7) : new Date().toISOString().slice(0, 7));
  if (initialValues?.tasks?.length) {
    return initialValues.tasks.map((task) =>
      createServiceLineDraft(inspectionMonth, task)
    );
  }

  return [createServiceLineDraft(inspectionMonth)];
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileSelectionKey(file: File) {
  return `${file.name.toLowerCase()}-${file.size}-${file.lastModified}`;
}

function getDroppedFiles(dataTransfer: DataTransfer) {
  const itemFiles = Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (itemFiles.length > 0) {
    return itemFiles;
  }

  return Array.from(dataTransfer.files ?? []);
}

function hasUnsupportedCloudReference(dataTransfer: DataTransfer) {
  const types = Array.from(dataTransfer.types ?? []);
  const hasFileIntent = types.includes("Files") || Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file");
  const hasLinkIntent = types.some((type) => type === "text/uri-list" || type === "text/plain" || type === "text/x-moz-url");
  return hasFileIntent || hasLinkIntent;
}

function serializeInitialValues(initialValues?: InspectionSchedulerFormInitialValues) {
  if (!initialValues) {
    return "";
  }

  return JSON.stringify({
    inspectionId: initialValues.inspectionId ?? null,
    customerCompanyId: initialValues.customerCompanyId ?? null,
    siteId: initialValues.siteId ?? null,
    inspectionClassification: initialValues.inspectionClassification ?? null,
    isPriority: Boolean(initialValues.isPriority),
    inspectionMonth: initialValues.inspectionMonth ?? null,
    scheduledStart: initialValues.scheduledStart ?? null,
    scheduledEnd: initialValues.scheduledEnd ?? null,
    status: initialValues.status ?? null,
    notes: initialValues.notes ?? null,
    tasks: (initialValues.tasks ?? []).map((task) => ({
      inspectionType: task.inspectionType,
      frequency: task.frequency,
      assignedTechnicianId: task.assignedTechnicianId ?? null,
      dueMonth: task.dueMonth ?? null,
      dueDate: task.dueDate ?? null,
      schedulingStatus: task.schedulingStatus ?? null,
      notes: task.notes ?? null
    }))
  });
}

function extractPurchaseOrderNumber(notes: string | null | undefined) {
  const match = (notes ?? "").match(/(?:^|\n)\s*PO\s*:\s*([^\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

function formatDuplicateDateTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function resolveSchedulerSiteSelection(input: {
  siteId?: string | null;
  customerCompanyId?: string | null;
  sites: SiteOption[];
  autoSelectGenericSiteOnCustomerChange?: boolean;
}) {
  if (input.siteId) {
    const selectedSite = input.sites.find((site) => site.id === input.siteId);
    if (
      selectedSite &&
      (!input.customerCompanyId || selectedSite.customerCompanyId === input.customerCompanyId) &&
      !isUserFacingSiteLabel(selectedSite.name)
    ) {
      return genericInspectionSiteOptionValue;
    }

    return input.siteId;
  }

  return input.customerCompanyId && input.autoSelectGenericSiteOnCustomerChange
    ? genericInspectionSiteOptionValue
    : "";
}

function PickerField({
  id,
  name,
  type,
  value,
  onChange,
  required,
  icon,
  placeholder
}: {
  id: string;
  name: string;
  type: "month" | "datetime-local" | "date";
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  icon: ReactNode;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 transition-colors focus-within:border-slateblue/40 focus-within:bg-white">
      <span className="pointer-events-none absolute left-4 top-1/2 z-[1] flex h-4.5 w-4.5 -translate-y-1/2 items-center justify-center text-slate-400">
        {icon}
      </span>
      <input
        className="ios-picker-field block h-11 w-full min-w-0 max-w-full appearance-none bg-transparent pl-[2.7rem] pr-11 text-left text-[15px] font-medium text-slate-900 outline-none"
        id={id}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 z-[1] flex h-4 w-4 -translate-y-1/2 items-center justify-center text-slate-400">
        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20">
          <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      </span>
    </div>
  );
}

export function InspectionSchedulerForm({
  action,
  title,
  submitLabel,
  customers,
  sites,
  technicians,
  initialValues,
  banner,
  workflowNote,
  reasonLabel,
  reasonRequired,
  allowDocumentUpload = false,
  autoSelectGenericSiteOnCustomerChange = false,
  allowCustomOneTimeSite = false,
  onSuccess,
  toastResults = true,
  showInlineSuccess = false,
  protectedSaveMode = false,
  protectedSaveTitle = "This visit already has work recorded",
  protectedSaveDescription = "To keep records accurate, your changes will create a new visit instead of changing the original one.",
  protectedSaveConfirmLabel = "Save as new visit"
}: {
  action: (_: InspectionSchedulerFormState, formData: FormData) => Promise<InspectionSchedulerFormState>;
  title: string;
  submitLabel: string;
  customers: CustomerOption[];
  sites: SiteOption[];
  technicians: TechnicianOption[];
  initialValues?: InspectionSchedulerFormInitialValues;
  banner?: string;
  workflowNote?: string;
  reasonLabel?: string;
  reasonRequired?: boolean;
  allowDocumentUpload?: boolean;
  autoSelectGenericSiteOnCustomerChange?: boolean;
  allowCustomOneTimeSite?: boolean;
  onSuccess?: (result: InspectionSchedulerFormState) => void;
  toastResults?: boolean;
  showInlineSuccess?: boolean;
  protectedSaveMode?: boolean;
  protectedSaveTitle?: string;
  protectedSaveDescription?: string;
  protectedSaveConfirmLabel?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const externalDocumentsInputRef = useRef<HTMLInputElement>(null);
  const duplicateResolutionInputRef = useRef<HTMLInputElement>(null);
  const duplicateExistingInspectionInputRef = useRef<HTMLInputElement>(null);
  const duplicateModalRef = useRef<HTMLDivElement | null>(null);
  const lastErrorRef = useRef<string | null>(null);
  const lastSuccessRef = useRef<string | null>(null);
  const lastAppliedInitialValuesRef = useRef<string>(serializeInitialValues(initialValues));
  const isCreateWorkflow = !initialValues?.inspectionId && !reasonLabel;
  const { showToast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialValues?.customerCompanyId ?? "");
  const [selectedSiteId, setSelectedSiteId] = useState(
    () => resolveSchedulerSiteSelection({
      siteId: initialValues?.siteId,
      customerCompanyId: initialValues?.customerCompanyId,
      sites,
      autoSelectGenericSiteOnCustomerChange
    })
  );
  const [inspectionClassification, setInspectionClassification] = useState<InspectionClassification>(
    initialValues?.inspectionClassification ?? "standard"
  );
  const [isPriority, setIsPriority] = useState(Boolean(initialValues?.isPriority));
  const [inspectionMonth, setInspectionMonth] = useState(
    initialValues?.inspectionMonth ?? (initialValues?.scheduledStart ? initialValues.scheduledStart.slice(0, 7) : new Date().toISOString().slice(0, 7))
  );
  const [scheduledStart, setScheduledStart] = useState(
    initialValues?.scheduledStart ?? defaultScheduledStartForMonth(inspectionMonth)
  );
  const [scheduledEnd, setScheduledEnd] = useState(initialValues?.scheduledEnd ?? "");
  const [status, setStatus] = useState<EditableInspectionStatus>(initialValues?.status ?? "to_be_completed");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState(() => extractPurchaseOrderNumber(initialValues?.notes));
  const [startManuallyEdited, setStartManuallyEdited] = useState(Boolean(initialValues?.scheduledStart));
  const [serviceLines, setServiceLines] = useState<ServiceLineDraft[]>(() => buildInitialServiceLines(initialValues));
  const [newestServiceLineId, setNewestServiceLineId] = useState<string | null>(null);
  const [showProtectedSaveConfirm, setShowProtectedSaveConfirm] = useState(false);
  const [duplicateWarningDismissed, setDuplicateWarningDismissed] = useState(false);
  const [duplicateInspectionResolution, setDuplicateInspectionResolution] = useState("");
  const [duplicateExistingInspectionId, setDuplicateExistingInspectionId] = useState("");
  const [externalDocumentFiles, setExternalDocumentFiles] = useState<File[]>([]);
  const [externalDocumentLabel, setExternalDocumentLabel] = useState("");
  const [externalDocumentsRequireSignature, setExternalDocumentsRequireSignature] = useState(true);
  const [externalDocumentsCustomerVisible, setExternalDocumentsCustomerVisible] = useState(false);
  const [isUploadingExternalDocuments, setIsUploadingExternalDocuments] = useState(false);
  const [externalDocumentsDragActive, setExternalDocumentsDragActive] = useState(false);
  const [externalDocumentUploadError, setExternalDocumentUploadError] = useState<string | null>(null);
  const [submitLocked, setSubmitLocked] = useState(false);
  const serviceLineRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const externalDocumentsDragDepthRef = useRef(0);
  const initialValuesSignature = serializeInitialValues(initialValues);
  const filteredSites = useMemo(
    () => sites.filter((site) => isUserFacingSiteLabel(site.name) && (!selectedCustomerId || site.customerCompanyId === selectedCustomerId)),
    [selectedCustomerId, sites]
  );
  const customerOptions = useMemo<SearchSelectOption[]>(
    () => customers.map((customer) => ({
      value: customer.id,
      label: customer.name
    })),
    [customers]
  );
  const siteOptions = useMemo<SearchSelectOption[]>(() => {
    if (!selectedCustomerId) {
      return [];
    }

    return [
      { value: genericInspectionSiteOptionValue, label: noFixedInspectionSiteLabel, secondaryLabel: "Use the customer account for this inspection" },
      { value: purchaseOrderInspectionSiteOptionValue, label: purchaseOrderInspectionSiteLabel, secondaryLabel: "Track this visit by purchase order" },
      ...(allowCustomOneTimeSite
        ? [{ value: customInspectionSiteOptionValue, label: customInspectionSiteName, secondaryLabel: "Create a one-time site for this inspection" }]
        : []),
      ...filteredSites.map((site) => ({
        value: site.id,
        label: site.name,
        secondaryLabel: site.city || "Customer site"
      }))
    ];
  }, [allowCustomOneTimeSite, filteredSites, selectedCustomerId]);
  const resolvedSiteId =
    filteredSites.some((site) => site.id === selectedSiteId) ||
    selectedSiteId === genericInspectionSiteOptionValue ||
    selectedSiteId === purchaseOrderInspectionSiteOptionValue ||
    selectedSiteId === customInspectionSiteOptionValue
      ? selectedSiteId
      : "";
  const customSiteSelected = resolvedSiteId === customInspectionSiteOptionValue;
  const purchaseOrderSiteSelected = resolvedSiteId === purchaseOrderInspectionSiteOptionValue;
  const serviceLinesJson = JSON.stringify(
    serviceLines.map((line) => ({
      inspectionType: line.inspectionType,
      frequency: line.frequency,
      assignedTechnicianId: line.assignedTechnicianId || null,
      dueMonth: line.dueMonth || null,
      dueDate: line.dueDate ? `${line.dueDate}T00:00` : null,
      schedulingStatus: line.schedulingStatus,
      notes: line.notes.trim() || null
    }))
  );

  const updateServiceLine = (lineId: string, patch: Partial<ServiceLineDraft>) => {
    setServiceLines((current) => {
      const lineIndex = current.findIndex((line) => line.id === lineId);
      const updated = current.map((line) => (line.id === lineId ? { ...line, ...patch } : line));

      if (lineIndex !== 0 || !Object.prototype.hasOwnProperty.call(patch, "assignedTechnicianId") || !patch.assignedTechnicianId) {
        return updated;
      }

      return updated.map((line, index) =>
        index > 0 && !line.assignedTechnicianId
          ? { ...line, assignedTechnicianId: patch.assignedTechnicianId ?? "" }
          : line
      );
    });
  };

  const addExternalDocumentFiles = (files: File[]) => {
    setExternalDocumentUploadError(null);

    if (files.length === 0) {
      return;
    }

    const nonPdfFile = files.find((file) => !isPdfFile(file));
    if (nonPdfFile) {
      setExternalDocumentUploadError(`${nonPdfFile.name} is not a PDF. Upload PDF files only.`);
      return;
    }

    const oversizedFile = files.find((file) => file.size > maxExternalDocumentUploadBytes);
    if (oversizedFile) {
      setExternalDocumentUploadError(`${oversizedFile.name} is ${formatFileSize(oversizedFile.size)}. Upload PDFs up to ${maxExternalDocumentUploadLabel}, or compress/split the file and try again.`);
      return;
    }

    setExternalDocumentFiles((currentFiles) => {
      const existingKeys = new Set(currentFiles.map(fileSelectionKey));
      const uniqueFiles = files.filter((file) => !existingKeys.has(fileSelectionKey(file)));
      if (uniqueFiles.length === 0) {
        setExternalDocumentUploadError("Those PDFs are already selected.");
        return currentFiles;
      }
      return [...currentFiles, ...uniqueFiles];
    });
  };

  const handleExternalDocumentDragEnter = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    externalDocumentsDragDepthRef.current += 1;
    setExternalDocumentsDragActive(true);
  };

  const handleExternalDocumentDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setExternalDocumentsDragActive(true);
  };

  const handleExternalDocumentDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    externalDocumentsDragDepthRef.current = Math.max(0, externalDocumentsDragDepthRef.current - 1);
    if (externalDocumentsDragDepthRef.current === 0) {
      setExternalDocumentsDragActive(false);
    }
  };

  const handleExternalDocumentDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    externalDocumentsDragDepthRef.current = 0;
    setExternalDocumentsDragActive(false);
    const files = getDroppedFiles(event.dataTransfer);
    if (files.length === 0 && hasUnsupportedCloudReference(event.dataTransfer)) {
      setExternalDocumentUploadError("That drop did not include an actual PDF file. If this is a Dropbox, OneDrive, or Google Drive file, make it available offline and try again.");
      return;
    }
    addExternalDocumentFiles(files);
  };

  const addServiceLine = () => {
    const nextLine = createServiceLineDraft(inspectionMonth);
    setServiceLines((current) => [
      ...current,
      {
        ...nextLine,
        assignedTechnicianId: current[0]?.assignedTechnicianId ?? ""
      }
    ]);
    setNewestServiceLineId(nextLine.id);
  };

  const removeServiceLine = (lineId: string) => {
    setServiceLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== lineId)));
  };

  const resetCreateWorkflow = () => {
    const defaultMonth = new Date().toISOString().slice(0, 7);
    const defaultStart = defaultScheduledStartForMonth(defaultMonth);
    formRef.current?.reset();
    setSelectedCustomerId("");
    setSelectedSiteId("");
    setInspectionClassification("standard");
    setIsPriority(false);
    setInspectionMonth(defaultMonth);
    setScheduledStart(defaultStart);
    setScheduledEnd("");
    setStatus("to_be_completed");
    setNotes("");
    setPurchaseOrderNumber("");
    setStartManuallyEdited(false);
    setServiceLines([createServiceLineDraft(defaultMonth)]);
    setExternalDocumentFiles([]);
    setExternalDocumentLabel("");
    setExternalDocumentsRequireSignature(true);
    setExternalDocumentsCustomerVisible(false);
    setExternalDocumentUploadError(null);
    setExternalDocumentsDragActive(false);
    externalDocumentsDragDepthRef.current = 0;
    if (externalDocumentsInputRef.current) {
      externalDocumentsInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!initialValues || lastAppliedInitialValuesRef.current === initialValuesSignature) {
      return;
    }

    lastAppliedInitialValuesRef.current = initialValuesSignature;
    setSelectedCustomerId(initialValues.customerCompanyId ?? "");
    setSelectedSiteId(resolveSchedulerSiteSelection({
      siteId: initialValues.siteId,
      customerCompanyId: initialValues.customerCompanyId,
      sites,
      autoSelectGenericSiteOnCustomerChange
    }));
    setInspectionClassification(initialValues.inspectionClassification ?? "standard");
    setIsPriority(Boolean(initialValues.isPriority));

    const nextInspectionMonth =
      initialValues.inspectionMonth ??
      (initialValues.scheduledStart ? initialValues.scheduledStart.slice(0, 7) : new Date().toISOString().slice(0, 7));
    setInspectionMonth(nextInspectionMonth);
    setScheduledStart(initialValues.scheduledStart ?? defaultScheduledStartForMonth(nextInspectionMonth));
    setScheduledEnd(initialValues.scheduledEnd ?? "");
    setStatus(initialValues.status ?? "to_be_completed");
    setNotes(initialValues.notes ?? "");
    setPurchaseOrderNumber(extractPurchaseOrderNumber(initialValues.notes));
    setStartManuallyEdited(Boolean(initialValues.scheduledStart));
    setServiceLines(buildInitialServiceLines(initialValues));
    setShowProtectedSaveConfirm(false);
  }, [autoSelectGenericSiteOnCustomerChange, initialValues, initialValuesSignature, sites]);

  const [state, formAction, pending] = useActionState(async (previousState: typeof initialState, formData: FormData) => {
    const result = await action(previousState, formData);
    const shouldDeferReset =
      isCreateWorkflow &&
      allowDocumentUpload &&
      externalDocumentFiles.length > 0 &&
      Boolean(result.createdInspectionId);

    if (isCreateWorkflow && !result.error && result.success && !shouldDeferReset) {
      resetCreateWorkflow();
    }
    return result;
  }, initialState);
  const duplicateWarning = state.duplicateWarning?.matches.length && !duplicateWarningDismissed
    ? state.duplicateWarning
    : null;

  useEffect(() => {
    if (state.error || state.success || state.duplicateWarning) {
      setSubmitLocked(false);
    }
    if (state.duplicateWarning) {
      setDuplicateWarningDismissed(false);
      setDuplicateInspectionResolution("");
      setDuplicateExistingInspectionId("");
    }
  }, [state.error, state.success, state.duplicateWarning]);

  useEffect(() => {
    if (!newestServiceLineId) {
      return;
    }

    const nextFrame = requestAnimationFrame(() => {
      serviceLineRefs.current[newestServiceLineId]?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      setNewestServiceLineId(null);
    });

    return () => cancelAnimationFrame(nextFrame);
  }, [newestServiceLineId]);

  useEffect(() => {
    if (!toastResults || !state.error || lastErrorRef.current === state.error) {
      return;
    }

    lastErrorRef.current = state.error;
    showToast({ title: state.error, tone: "error" });
  }, [showToast, state.error, toastResults]);

  useEffect(() => {
    if (!toastResults || !state.success || lastSuccessRef.current === state.success) {
      return;
    }

    lastSuccessRef.current = state.success;

    const finalizeSuccess = () => {
      if (isCreateWorkflow) {
        resetCreateWorkflow();
      }
      showToast({ title: state.success!, tone: "success" });
      onSuccess?.(state);
      if (!isCreateWorkflow && !state.redirectTo) {
        router.refresh();
      }
    };

    if (!allowDocumentUpload || !isCreateWorkflow || externalDocumentFiles.length === 0 || !state.createdInspectionId) {
      finalizeSuccess();
      return;
    }

    setIsUploadingExternalDocuments(true);

    void (async () => {
      const uploadFormData = new FormData();
      for (const file of externalDocumentFiles) {
        uploadFormData.append("document", file);
      }
      uploadFormData.set("requiresSignature", externalDocumentsRequireSignature ? "on" : "");
      uploadFormData.set("customerVisible", externalDocumentsCustomerVisible ? "on" : "");
      uploadFormData.set("label", externalDocumentFiles.length === 1 ? externalDocumentLabel.trim() : "");

      try {
        const response = await fetch(`/api/inspections/${state.createdInspectionId}/documents/upload`, {
          method: "POST",
          body: uploadFormData
        });
        const payload = (await response.json()) as { error?: string; success?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Inspection was created, but the external PDFs could not be uploaded.");
        }

        finalizeSuccess();
      } catch (uploadError) {
        const message = uploadError instanceof Error
          ? uploadError.message
          : "Inspection was created, but the external PDFs could not be uploaded.";
        showToast({
          title: "Inspection created, but external PDFs still need to be uploaded from the inspection page.",
          description: message,
          tone: "error"
        });
        resetCreateWorkflow();
        router.push(`/app/admin/inspections/${state.createdInspectionId}`);
      } finally {
        setIsUploadingExternalDocuments(false);
      }
    })();
  }, [
    allowDocumentUpload,
    externalDocumentFiles,
    externalDocumentLabel,
    externalDocumentsCustomerVisible,
    externalDocumentsRequireSignature,
    isCreateWorkflow,
    onSuccess,
    router,
    showToast,
    state,
    toastResults
  ]);

  useEffect(() => {
    if (!state.redirectTo) {
      return;
    }

    router.push(state.redirectTo);
  }, [router, state.redirectTo]);

  useEffect(() => {
    if (!duplicateWarning) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimeout = window.setTimeout(() => duplicateModalRef.current?.querySelector<HTMLElement>("button, input, select, textarea, [href]")?.focus(), 20);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDuplicateWarningDismissed(true);
      }
      if (event.key === "Tab") {
        const focusable = duplicateModalRef.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])");
        if (!focusable?.length) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimeout);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [duplicateWarning]);

  return (
    <form
      action={formAction}
      className="min-w-0 overflow-hidden space-y-5 rounded-[1.5rem] bg-white p-4 shadow-panel sm:space-y-6 sm:rounded-[2rem] sm:p-6"
      onSubmit={(event) => {
        if (pending || submitLocked || isUploadingExternalDocuments) {
          event.preventDefault();
          return;
        }

        setSubmitLocked(true);
      }}
      ref={formRef}
    >
      {initialValues?.inspectionId ? <input name="inspectionId" type="hidden" value={initialValues.inspectionId} /> : null}
      <input name="serviceLinesJson" type="hidden" value={serviceLinesJson} />
      <input name="inspectionClassification" type="hidden" value={inspectionClassification} />
      <input name="isPriority" type="hidden" value={isPriority ? "on" : ""} />
      <input name="duplicateInspectionResolution" ref={duplicateResolutionInputRef} type="hidden" value={duplicateInspectionResolution} />
      <input name="duplicateExistingInspectionId" ref={duplicateExistingInspectionInputRef} type="hidden" value={duplicateExistingInspectionId} />
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500 sm:text-sm sm:tracking-[0.25em]">Visit details</p>
        <h3 className="mt-2 text-xl font-semibold text-ink sm:text-2xl">{title}</h3>
        {banner ? <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">{banner}</p> : null}
        {workflowNote ? <p className="mt-3 text-sm leading-5 text-slate-500">{workflowNote}</p> : null}
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0 rounded-[1.25rem] border border-slate-200 p-4 sm:rounded-[1.5rem]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 sm:text-sm sm:tracking-[0.2em]">Inspection context</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">Inspection Classification</h4>
          <p className="mt-2 text-sm leading-5 text-slate-500">Identify the nature of the inspection.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {inspectionClassificationOptions.map((option) => {
              const active = inspectionClassification === option;
              return (
                <button
                  key={option}
                  className={active
                    ? "inline-flex min-h-11 items-center rounded-full border border-slateblue bg-slateblue px-4 py-2 text-sm font-semibold text-white"
                    : "inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"}
                  onClick={(event) => {
                    event.preventDefault();
                    setInspectionClassification(option);
                  }}
                  type="button"
                >
                  {formatInspectionClassificationLabel(option)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-w-0 rounded-[1.25rem] border border-slate-200 p-4 sm:rounded-[1.5rem]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 sm:text-sm sm:tracking-[0.2em]">Operational visibility</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">Priority</h4>
          <p className="mt-2 text-sm leading-5 text-slate-500">Use priority to make the inspection stand out for office staff and technicians.</p>
          <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{isPriority ? "Priority on" : "Priority off"}</p>
              <p className="mt-1 text-sm text-slate-500">Priority is separate from inspection classification and status.</p>
            </div>
            <input
              checked={isPriority}
              className="h-5 w-5 rounded border-slate-300"
              onChange={(event) => setIsPriority(event.target.checked)}
              type="checkbox"
            />
          </label>
        </div>
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <SearchSelect
            id="customerCompanyId"
            label="Customer"
            name="customerCompanyId"
            onChange={(nextCustomerId) => {
              setSelectedCustomerId(nextCustomerId);
              setSelectedSiteId(nextCustomerId && autoSelectGenericSiteOnCustomerChange ? genericInspectionSiteOptionValue : "");
            }}
            options={customerOptions}
            placeholder="Search customers"
            required
            value={selectedCustomerId}
          />
        </div>
        <div className="min-w-0">
          <SearchSelect
            disabled={selectedCustomerId === ""}
            disabledPlaceholder="Select a customer first"
            id="siteId"
            label="Site or PO"
            name="siteId"
            onChange={(nextSiteId) => setSelectedSiteId(nextSiteId)}
            options={siteOptions}
            placeholder={selectedCustomerId ? "Search sites" : "Select a customer first"}
            required
            value={resolvedSiteId}
          />
        </div>
      </div>
      {purchaseOrderSiteSelected ? (
        <div className="min-w-0 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 sm:rounded-[1.5rem]">
          <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="purchaseOrderNumber">PO number</label>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 outline-none transition-colors focus:border-slateblue/50"
            id="purchaseOrderNumber"
            name="purchaseOrderNumber"
            onChange={(event) => setPurchaseOrderNumber(event.target.value)}
            placeholder="Enter customer PO"
            required={purchaseOrderSiteSelected}
            value={purchaseOrderNumber}
          />
        </div>
      ) : null}
      {customSiteSelected ? (
        <div className="min-w-0 space-y-4 rounded-[1.25rem] border border-slate-200 p-4 sm:rounded-[1.5rem]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 sm:text-sm sm:tracking-[0.2em]">One-time site</p>
            <h4 className="mt-1 text-lg font-semibold text-ink">Create a site just for this inspection</h4>
            <p className="mt-2 text-sm leading-5 text-slate-500">This creates a real site under the selected customer so the inspection, report, billing, and PDF flow stay intact.</p>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customSiteName">Site name</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3.5" id="customSiteName" name="customSiteName" required={customSiteSelected} />
            </div>
            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customSiteAddressLine1">Address line 1</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3.5" id="customSiteAddressLine1" name="customSiteAddressLine1" required={customSiteSelected} />
            </div>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customSiteAddressLine2">Address line 2</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3.5" id="customSiteAddressLine2" name="customSiteAddressLine2" />
            </div>
            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customSiteCity">City</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3.5" id="customSiteCity" name="customSiteCity" required={customSiteSelected} />
            </div>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customSiteState">State / region</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3.5" id="customSiteState" name="customSiteState" required={customSiteSelected} />
            </div>
            <div className="min-w-0">
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customSitePostalCode">Postal code</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3.5" id="customSitePostalCode" name="customSitePostalCode" required={customSiteSelected} />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customSiteNotes">Site note</label>
            <textarea className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3.5" id="customSiteNotes" name="customSiteNotes" placeholder="Optional note for dispatch or site context" />
          </div>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="inspectionMonth">Visit month</label>
          <PickerField
            id="inspectionMonth"
            icon={
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                <rect fill="none" height="16" rx="3" ry="3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" width="18" x="3" y="5" />
                <path d="M8 3v4M16 3v4M3 10h18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
            }
            name="inspectionMonth"
            onChange={(event) => {
              const nextMonth = event.target.value;
              const previousMonth = inspectionMonth;
              setInspectionMonth(nextMonth);
              if (!startManuallyEdited) {
                setScheduledStart((current) => defaultScheduledStartForMonth(nextMonth, current));
              }
              setServiceLines((current) =>
                current.map((line) => (!line.dueMonth || line.dueMonth === previousMonth ? { ...line, dueMonth: nextMonth } : line))
              );
            }}
            required
            type="month"
            value={inspectionMonth}
          />
          <p className="mt-2 text-sm leading-5 text-slate-500">This is the normal due period technicians use for planning. Use a hard date only when the visit truly has to happen on a specific day.</p>
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="scheduledStart">Dispatch anchor</label>
          <PickerField
            id="scheduledStart"
            icon={
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                <circle cx="12" cy="12" fill="none" r="8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                <path d="M12 7.5v5l3 2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
            }
            name="scheduledStart"
            onChange={(event) => {
              setScheduledStart(event.target.value);
              setStartManuallyEdited(true);
            }}
            required
            type="datetime-local"
            value={scheduledStart}
          />
          <p className="mt-2 text-sm leading-5 text-slate-500">Defaults to the first day of the visit month for calendar grouping. This is not shown as a hard due date unless a service line hard date is set.</p>
        </div>
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="scheduledEnd">Visit end</label>
          <PickerField
            id="scheduledEnd"
            icon={
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                <circle cx="12" cy="12" fill="none" r="8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                <path d="M12 7.5v5l3 2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
            }
            name="scheduledEnd"
            onChange={(event) => setScheduledEnd(event.target.value)}
            type="datetime-local"
            value={scheduledEnd}
          />
          <p className="mt-2 text-sm leading-5 text-slate-500">Optional. Leave blank unless dispatch needs a specific visit end time.</p>
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="status">Visit status</label>
          <select
            className="block w-full min-w-0 max-w-full rounded-2xl border border-slate-200 px-4 py-3.5"
            id="status"
            name="status"
            onChange={(event) => setStatus(event.target.value as EditableInspectionStatus)}
            value={status}
          >
            {statusOptions.map((status) => <option key={status} value={status}>{formatInspectionStatusLabel(status)}</option>)}
          </select>
        </div>
      </div>
      <div className="min-w-0 space-y-4 rounded-[1.25rem] border border-slate-200 p-4 sm:rounded-[1.5rem]">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 sm:text-sm sm:tracking-[0.2em]">Services on this visit</p>
            <h4 className="mt-1 text-lg font-semibold text-ink">Schedule for this visit and track future due work</h4>
            <p className="mt-2 text-sm leading-5 text-slate-500">Each service line can have its own technician, due month, optional hard date, and scheduling status.</p>
          </div>
        </div>
        <div className="space-y-4">
          {serviceLines.map((line, index) => {
            const isCurrentVisitLine = line.schedulingStatus === "due_now" || line.schedulingStatus === "scheduled_now";
            const isFutureLine = line.schedulingStatus === "scheduled_future" || line.schedulingStatus === "not_scheduled";

            return (
              <div
                key={line.id}
                className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4"
                ref={(node) => {
                  serviceLineRefs.current[line.id] = node;
                }}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">Service line {index + 1}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {isCurrentVisitLine
                        ? "Included in this visit and expected to move through dispatch now."
                        : isFutureLine
                          ? "Captured for future planning so the service is not lost."
                          : "Use this line to track the current scheduling intent for the service."}
                    </p>
                  </div>
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                    disabled={serviceLines.length === 1}
                    onClick={(event) => {
                      event.preventDefault();
                      removeServiceLine(line.id);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="min-w-0">
                    <label className="mb-2 block text-sm font-medium text-slate-600">Service type</label>
                    <select
                      className="block w-full rounded-2xl border border-slate-200 px-4 py-3.5"
                      onChange={(event) =>
                        updateServiceLine(line.id, {
                          inspectionType: event.target.value as InspectionType,
                          frequency: getDefaultInspectionRecurrenceFrequency(event.target.value as InspectionType)
                        })
                      }
                      value={line.inspectionType}
                    >
                      {inspectionTypeOptions.map((inspectionType) => (
                        <option key={inspectionType} value={inspectionType}>
                          {formatInspectionTaskTypeLabel(inspectionType)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="mb-2 block text-sm font-medium text-slate-600">Assigned technician</label>
                    <select
                      className="block w-full rounded-2xl border border-slate-200 px-4 py-3.5"
                      onChange={(event) => updateServiceLine(line.id, { assignedTechnicianId: event.target.value })}
                      value={line.assignedTechnicianId}
                    >
                      <option value="">{isCurrentVisitLine ? "Leave unassigned for shared queue" : "Leave unassigned for now"}</option>
                      {technicians.map((technician) => (
                        <option key={technician.id} value={technician.id}>
                          {technician.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="min-w-0">
                    <label className="mb-2 block text-sm font-medium text-slate-600">Recurrence</label>
                    <select
                      className="block w-full rounded-2xl border border-slate-200 px-4 py-3.5"
                      onChange={(event) => updateServiceLine(line.id, { frequency: event.target.value as RecurrenceFrequency })}
                      value={line.frequency}
                    >
                      {recurrenceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="mb-2 block text-sm font-medium text-slate-600">Scheduling status</label>
                    <select
                      className="block w-full rounded-2xl border border-slate-200 px-4 py-3.5"
                      onChange={(event) =>
                        updateServiceLine(line.id, {
                          schedulingStatus: event.target.value as InspectionTaskSchedulingStatus
                        })
                      }
                      value={line.schedulingStatus}
                    >
                      {serviceSchedulingOptions.map((option) => (
                        <option key={option} value={option}>
                          {formatInspectionTaskSchedulingStatusLabel(option)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="min-w-0">
                    <label className="mb-2 block text-sm font-medium text-slate-600">Due month</label>
                    <PickerField
                      id={`serviceLineDueMonth-${line.id}`}
                      icon={
                        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                          <rect fill="none" height="16" rx="3" ry="3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" width="18" x="3" y="5" />
                          <path d="M8 3v4M16 3v4M3 10h18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                        </svg>
                      }
                      name={`serviceLineDueMonth-${line.id}`}
                      onChange={(event) => updateServiceLine(line.id, { dueMonth: event.target.value })}
                      required
                      type="month"
                      value={line.dueMonth}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-2 block text-sm font-medium text-slate-600">Hard scheduled date</label>
                    <PickerField
                      id={`serviceLineDueDate-${line.id}`}
                      icon={
                        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                          <rect fill="none" height="16" rx="3" ry="3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" width="18" x="3" y="5" />
                          <path d="M8 3v4M16 3v4M3 10h18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                        </svg>
                      }
                      name={`serviceLineDueDate-${line.id}`}
                      onChange={(event) => updateServiceLine(line.id, { dueDate: event.target.value })}
                      type="date"
                      value={line.dueDate}
                    />
                    <p className="mt-2 text-sm leading-5 text-slate-500">Optional. Leave blank for normal due-month scheduling.</p>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-slate-600">Service notes</label>
                  <textarea
                    className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3.5"
                    onChange={(event) => updateServiceLine(line.id, { notes: event.target.value })}
                    placeholder="Optional notes for this service line"
                    value={line.notes}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-start">
          <button
            className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            onClick={(event) => {
              event.preventDefault();
              addServiceLine();
            }}
            type="button"
          >
            Add service line
          </button>
        </div>
      </div>
      <div className="min-w-0">
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="notes">Dispatch notes</label>
        <textarea
          className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3.5"
          id="notes"
          name="notes"
          onChange={(event) => setNotes(event.target.value)}
          value={notes}
        />
      </div>
      {reasonLabel ? (
      <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="reason">{reasonLabel}</label>
          <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3.5" id="reason" name="reason" placeholder="Share any context the next visit should keep with it" required={reasonRequired} />
        </div>
      ) : null}
      {allowDocumentUpload ? (
        <div className="min-w-0 space-y-4 rounded-[1.25rem] border border-slate-200 p-4 sm:rounded-[1.5rem]">
          <div>
            <p className="text-sm font-medium text-slate-600">External customer PDFs</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">Optional. Attach customer-provided PDFs while scheduling so they are ready for the field team on day one.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="externalDocuments">Upload PDF documents</label>
            <button
              aria-describedby="external-documents-help"
              className={`flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-center transition ${
                externalDocumentsDragActive
                  ? "border-slateblue bg-blue-50 text-slateblue"
                  : "border-slate-300 bg-slate-50/70 text-slate-600 hover:border-slateblue hover:bg-blue-50/60"
              }`}
              disabled={pending || submitLocked || isUploadingExternalDocuments}
              onClick={() => externalDocumentsInputRef.current?.click()}
              onDragEnter={handleExternalDocumentDragEnter}
              onDragLeave={handleExternalDocumentDragLeave}
              onDragOver={handleExternalDocumentDragOver}
              onDrop={handleExternalDocumentDrop}
              type="button"
            >
              <span className="text-sm font-semibold text-ink">Drag and drop PDF files here, or click to browse.</span>
              <span className="mt-1 text-xs text-slate-500">PDF only. Maximum {maxExternalDocumentUploadLabel} per PDF.</span>
              {externalDocumentFiles.length > 0 ? (
                <span className="mt-3 text-xs font-semibold text-slateblue">
                  {externalDocumentFiles.length === 1 ? externalDocumentFiles[0]!.name : `${externalDocumentFiles.length} PDFs selected`}
                </span>
              ) : null}
            </button>
            <input
              accept="application/pdf"
              className="sr-only"
              id="externalDocuments"
              multiple
              onChange={(event) => addExternalDocumentFiles(Array.from(event.currentTarget.files ?? []))}
              ref={externalDocumentsInputRef}
              type="file"
            />
            <p className="mt-2 text-sm leading-5 text-slate-500" id="external-documents-help">You can attach one or more PDFs here. File names are used as the initial document identifiers.</p>
            {externalDocumentUploadError ? <p className="mt-2 text-sm text-rose-600">{externalDocumentUploadError}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="externalDocumentLabel">Optional label</label>
            <input
              className="w-full rounded-2xl border border-slate-200 px-4 py-3.5"
              id="externalDocumentLabel"
              name="externalDocumentLabel"
              onChange={(event) => setExternalDocumentLabel(event.target.value)}
              placeholder="Used when uploading a single external PDF"
              value={externalDocumentLabel}
            />
          </div>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <input
              checked={externalDocumentsRequireSignature}
              className="h-5 w-5 rounded border-slate-300"
              name="externalDocumentsRequireSignature"
              onChange={(event) => setExternalDocumentsRequireSignature(event.target.checked)}
              type="checkbox"
            />
            Mark uploaded PDFs as requiring technician signature
          </label>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <input
              checked={externalDocumentsCustomerVisible}
              className="h-5 w-5 rounded border-slate-300"
              name="externalDocumentsCustomerVisible"
              onChange={(event) => setExternalDocumentsCustomerVisible(event.target.checked)}
              type="checkbox"
            />
            Make signed versions visible in the customer portal
          </label>
        </div>
      ) : null}
      {duplicateWarning ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:px-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDuplicateWarningDismissed(true);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-inspection-title"
        >
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/70 bg-white p-5 shadow-2xl sm:p-6" ref={duplicateModalRef}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-600">Duplicate protection</p>
                <h3 className="mt-2 text-2xl font-semibold text-ink" id="duplicate-inspection-title">Potential Duplicate Inspection Detected</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  We found an existing inspection that may already cover this work. Review the matching visit before creating a second ticket.
                </p>
              </div>
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                onClick={() => setDuplicateWarningDismissed(true)}
                type="button"
              >
                Cancel
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {duplicateWarning.matches.map((match) => (
                <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/60 p-4" key={match.id}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-amber-700">
                          {formatInspectionStatusLabel(match.status as EditableInspectionStatus)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-600">
                          {formatInspectionClassificationLabel(match.inspectionClassification as InspectionClassification)}
                        </span>
                      </div>
                      <h4 className="mt-3 text-lg font-semibold text-ink">{match.customerName}</h4>
                      <p className="mt-1 text-sm font-medium text-slate-700">{match.siteName}</p>
                      {match.siteAddress ? <p className="mt-1 text-sm text-slate-500">{match.siteAddress}</p> : null}
                      <p className="mt-2 text-sm text-slate-600">
                        {formatDuplicateDateTime(match.scheduledStart)}
                        {match.scheduledEnd ? ` - ${formatDuplicateDateTime(match.scheduledEnd)}` : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {match.reportTypes.map((reportType, index) => (
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700" key={`${reportType.inspectionType}-${index}`}>
                            {reportType.label}
                          </span>
                        ))}
                      </div>
                      {match.assignedTechnicians.length ? (
                        <p className="mt-3 text-sm text-slate-600">Assigned: {match.assignedTechnicians.join(", ")}</p>
                      ) : (
                        <p className="mt-3 text-sm text-slate-600">Unassigned / shared queue</p>
                      )}
                      {match.quoteSource || match.workOrderSource ? (
                        <p className="mt-1 text-sm text-slate-600">
                          {[match.quoteSource ? `Quote ${match.quoteSource}` : null, match.workOrderSource].filter(Boolean).join(" | ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="w-full space-y-2 lg:max-w-sm">
                      <button
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        onClick={() => router.push(`/app/admin/inspections/${match.id}`)}
                        type="button"
                      >
                        Open Existing Inspection
                      </button>
                      {match.canAddReportTypesToExisting ? (
                        <button
                          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                          disabled={pending || submitLocked || isUploadingExternalDocuments}
                          onClick={() => {
                            setDuplicateInspectionResolution("add_to_existing");
                            setDuplicateExistingInspectionId(match.id);
                            if (duplicateResolutionInputRef.current) {
                              duplicateResolutionInputRef.current.value = "add_to_existing";
                            }
                            if (duplicateExistingInspectionInputRef.current) {
                              duplicateExistingInspectionInputRef.current.value = match.id;
                            }
                          }}
                          type="submit"
                        >
                          Add {match.missingReportTypes.map((type) => type.label).join(", ")} To Existing Inspection
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl bg-white/80 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Why TradeWorx flagged this</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {match.duplicateReasons.map((reason) => (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600" key={reason}>
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setDuplicateWarningDismissed(true)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-100 px-5 py-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-200 disabled:opacity-60"
                disabled={pending || submitLocked || isUploadingExternalDocuments}
                onClick={() => {
                  setDuplicateInspectionResolution("create_anyway");
                  setDuplicateExistingInspectionId("");
                  if (duplicateResolutionInputRef.current) {
                    duplicateResolutionInputRef.current.value = "create_anyway";
                  }
                  if (duplicateExistingInspectionInputRef.current) {
                    duplicateExistingInspectionInputRef.current.value = "";
                  }
                }}
                type="submit"
              >
                Create New Inspection Anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {showInlineSuccess && state.success ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{state.success}</p> : null}
      {protectedSaveMode && showProtectedSaveConfirm ? (
        <div className="space-y-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-5">
          <div>
            <p className="text-sm font-semibold text-amber-950">{protectedSaveTitle}</p>
            <p className="mt-2 text-sm leading-6 text-amber-900">{protectedSaveDescription}</p>
            <p className="mt-2 text-sm text-amber-800">The original visit stays in history.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-ember px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              disabled={pending || submitLocked || isUploadingExternalDocuments}
              type="submit"
            >
              {pending || submitLocked || isUploadingExternalDocuments ? "Saving new visit..." : protectedSaveConfirmLabel}
            </button>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              disabled={pending || submitLocked || isUploadingExternalDocuments}
              onClick={() => setShowProtectedSaveConfirm(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="w-full rounded-2xl bg-ember px-5 py-3 text-base font-semibold text-white disabled:opacity-60"
          disabled={pending || submitLocked || isUploadingExternalDocuments}
          onClick={(event) => {
            if (!protectedSaveMode) {
              return;
            }

            event.preventDefault();
            setShowProtectedSaveConfirm(true);
          }}
          type="submit"
        >
          {pending || submitLocked ? "Saving schedule..." : isUploadingExternalDocuments ? "Uploading PDFs..." : submitLabel}
        </button>
      )}
    </form>
  );
}
