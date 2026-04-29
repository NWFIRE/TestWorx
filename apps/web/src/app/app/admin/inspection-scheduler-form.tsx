"use client";

import type { ChangeEvent, ReactNode } from "react";
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
  noFixedInspectionSiteLabel
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
};

const initialState: InspectionSchedulerFormState = {
  error: null,
  success: null,
  redirectTo: null,
  createdInspectionId: null
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
  const lastErrorRef = useRef<string | null>(null);
  const lastSuccessRef = useRef<string | null>(null);
  const lastAppliedInitialValuesRef = useRef<string>(serializeInitialValues(initialValues));
  const isCreateWorkflow = !initialValues?.inspectionId && !reasonLabel;
  const { showToast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialValues?.customerCompanyId ?? "");
  const [selectedSiteId, setSelectedSiteId] = useState(
    initialValues?.siteId ??
      (initialValues?.customerCompanyId && autoSelectGenericSiteOnCustomerChange
        ? genericInspectionSiteOptionValue
        : "")
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
  const [startManuallyEdited, setStartManuallyEdited] = useState(Boolean(initialValues?.scheduledStart));
  const [serviceLines, setServiceLines] = useState<ServiceLineDraft[]>(() => buildInitialServiceLines(initialValues));
  const [newestServiceLineId, setNewestServiceLineId] = useState<string | null>(null);
  const [showProtectedSaveConfirm, setShowProtectedSaveConfirm] = useState(false);
  const [externalDocumentFiles, setExternalDocumentFiles] = useState<File[]>([]);
  const [externalDocumentLabel, setExternalDocumentLabel] = useState("");
  const [externalDocumentsRequireSignature, setExternalDocumentsRequireSignature] = useState(true);
  const [externalDocumentsCustomerVisible, setExternalDocumentsCustomerVisible] = useState(false);
  const [isUploadingExternalDocuments, setIsUploadingExternalDocuments] = useState(false);
  const serviceLineRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
    selectedSiteId === customInspectionSiteOptionValue
      ? selectedSiteId
      : "";
  const customSiteSelected = resolvedSiteId === customInspectionSiteOptionValue;
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
    setServiceLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
  };

  const addServiceLine = () => {
    const nextLine = createServiceLineDraft(inspectionMonth);
    setServiceLines((current) => [...current, nextLine]);
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
    setStartManuallyEdited(false);
    setServiceLines([createServiceLineDraft(defaultMonth)]);
    setExternalDocumentFiles([]);
    setExternalDocumentLabel("");
    setExternalDocumentsRequireSignature(true);
    setExternalDocumentsCustomerVisible(false);
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
    setSelectedSiteId(
      initialValues.siteId ??
        (initialValues.customerCompanyId && autoSelectGenericSiteOnCustomerChange
          ? genericInspectionSiteOptionValue
          : "")
    );
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
    setStartManuallyEdited(Boolean(initialValues.scheduledStart));
    setServiceLines(buildInitialServiceLines(initialValues));
    setShowProtectedSaveConfirm(false);
  }, [autoSelectGenericSiteOnCustomerChange, initialValues, initialValuesSignature]);

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

  return (
    <form action={formAction} className="min-w-0 overflow-hidden space-y-5 rounded-[1.5rem] bg-white p-4 shadow-panel sm:space-y-6 sm:rounded-[2rem] sm:p-6" ref={formRef}>
      {initialValues?.inspectionId ? <input name="inspectionId" type="hidden" value={initialValues.inspectionId} /> : null}
      <input name="serviceLinesJson" type="hidden" value={serviceLinesJson} />
      <input name="inspectionClassification" type="hidden" value={inspectionClassification} />
      <input name="isPriority" type="hidden" value={isPriority ? "on" : ""} />
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
            label="Site"
            name="siteId"
            onChange={(nextSiteId) => setSelectedSiteId(nextSiteId)}
            options={siteOptions}
            placeholder={selectedCustomerId ? "Search sites" : "Select a customer first"}
            required
            value={resolvedSiteId}
          />
        </div>
      </div>
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
              setInspectionMonth(nextMonth);
              if (!startManuallyEdited) {
                setScheduledStart((current) => defaultScheduledStartForMonth(nextMonth, current));
              }
              setServiceLines((current) =>
                current.map((line) => (line.dueMonth ? line : { ...line, dueMonth: nextMonth }))
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
            <input
              accept="application/pdf"
              className="block w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm"
              id="externalDocuments"
              multiple
              onChange={(event) => setExternalDocumentFiles(Array.from(event.target.files ?? []))}
              ref={externalDocumentsInputRef}
              type="file"
            />
            <p className="mt-2 text-sm leading-5 text-slate-500">You can attach one or more PDFs here. File names are used as the initial document identifiers.</p>
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
              disabled={pending || isUploadingExternalDocuments}
              type="submit"
            >
              {pending || isUploadingExternalDocuments ? "Saving new visit..." : protectedSaveConfirmLabel}
            </button>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              disabled={pending || isUploadingExternalDocuments}
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
          disabled={pending || isUploadingExternalDocuments}
          onClick={(event) => {
            if (!protectedSaveMode) {
              return;
            }

            event.preventDefault();
            setShowProtectedSaveConfirm(true);
          }}
          type="submit"
        >
          {pending ? "Saving schedule..." : isUploadingExternalDocuments ? "Uploading PDFs..." : submitLabel}
        </button>
      )}
    </form>
  );
}
