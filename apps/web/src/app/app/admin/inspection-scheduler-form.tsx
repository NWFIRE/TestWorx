"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useActionState, useMemo, useRef, useState } from "react";
import type { CustomerOption, SiteOption, TechnicianOption } from "@testworx/types";
import {
  customInspectionSiteName,
  customInspectionSiteOptionValue,
  defaultScheduledStartForMonth,
  editableInspectionStatuses,
  formatInspectionStatusLabel,
  formatInspectionTaskSchedulingStatusLabel,
  formatInspectionTaskTypeLabel,
  genericInspectionSiteName,
  genericInspectionSiteOptionValue,
  getDefaultInspectionRecurrenceFrequency,
  inspectionTaskSchedulingStatuses,
  inspectionTypeRegistry
} from "@testworx/lib";

type InspectionType = keyof typeof inspectionTypeRegistry;
type RecurrenceFrequency = "ONCE" | "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
type InspectionTaskSchedulingStatus = (typeof inspectionTaskSchedulingStatuses)[number];
const recurrenceOptions: RecurrenceFrequency[] = ["ONCE", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];
type EditableInspectionStatus = (typeof editableInspectionStatuses)[number];
const statusOptions = editableInspectionStatuses;
const initialState = { error: null as string | null, success: null as string | null };
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

type InitialValues = {
  inspectionId?: string;
  customerCompanyId?: string;
  siteId?: string;
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
  scheduledStart?: string,
  initialValue?: InspectionTaskValue
): ServiceLineDraft {
  const inspectionType = initialValue?.inspectionType ?? inspectionTypeOptions[0] ?? "fire_extinguisher";
  return {
    id: crypto.randomUUID(),
    inspectionType,
    frequency: initialValue?.frequency ?? getDefaultInspectionRecurrenceFrequency(inspectionType),
    assignedTechnicianId: initialValue?.assignedTechnicianId ?? "",
    dueMonth: initialValue?.dueMonth ?? inspectionMonth,
    dueDate: initialValue?.dueDate ?? scheduledStart?.slice(0, 10) ?? "",
    schedulingStatus: initialValue?.schedulingStatus ?? "scheduled_now",
    notes: initialValue?.notes ?? ""
  };
}

function buildInitialServiceLines(initialValues?: InitialValues) {
  const inspectionMonth =
    initialValues?.inspectionMonth ??
    (initialValues?.scheduledStart ? initialValues.scheduledStart.slice(0, 7) : new Date().toISOString().slice(0, 7));
  const scheduledStart =
    initialValues?.scheduledStart ?? defaultScheduledStartForMonth(inspectionMonth);

  if (initialValues?.tasks?.length) {
    return initialValues.tasks.map((task) =>
      createServiceLineDraft(inspectionMonth, scheduledStart, task)
    );
  }

  return [createServiceLineDraft(inspectionMonth, scheduledStart)];
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
  allowCustomOneTimeSite = false
}: {
  action: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  title: string;
  submitLabel: string;
  customers: CustomerOption[];
  sites: SiteOption[];
  technicians: TechnicianOption[];
  initialValues?: InitialValues;
  banner?: string;
  workflowNote?: string;
  reasonLabel?: string;
  reasonRequired?: boolean;
  allowDocumentUpload?: boolean;
  autoSelectGenericSiteOnCustomerChange?: boolean;
  allowCustomOneTimeSite?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const isCreateWorkflow = !initialValues?.inspectionId && !reasonLabel;
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialValues?.customerCompanyId ?? "");
  const [selectedSiteId, setSelectedSiteId] = useState(initialValues?.siteId ?? "");
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
  const filteredSites = useMemo(
    () => sites.filter((site) => !selectedCustomerId || site.customerCompanyId === selectedCustomerId),
    [selectedCustomerId, sites]
  );
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
    setServiceLines((current) => [...current, createServiceLineDraft(inspectionMonth, scheduledStart)]);
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
    setInspectionMonth(defaultMonth);
    setScheduledStart(defaultStart);
    setScheduledEnd("");
    setStatus("to_be_completed");
    setNotes("");
    setStartManuallyEdited(false);
    setServiceLines([createServiceLineDraft(defaultMonth, defaultStart)]);
  };

  const [state, formAction, pending] = useActionState(async (previousState: typeof initialState, formData: FormData) => {
    const result = await action(previousState, formData);
    if (isCreateWorkflow && !result.error && result.success) {
      resetCreateWorkflow();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="min-w-0 overflow-hidden space-y-5 rounded-[1.5rem] bg-white p-4 shadow-panel sm:space-y-6 sm:rounded-[2rem] sm:p-6" ref={formRef}>
      {initialValues?.inspectionId ? <input name="inspectionId" type="hidden" value={initialValues.inspectionId} /> : null}
      <input name="serviceLinesJson" type="hidden" value={serviceLinesJson} />
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500 sm:text-sm sm:tracking-[0.25em]">Scheduling workflow</p>
        <h3 className="mt-2 text-xl font-semibold text-ink sm:text-2xl">{title}</h3>
        {banner ? <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">{banner}</p> : null}
        {workflowNote ? <p className="mt-3 text-sm leading-5 text-slate-500">{workflowNote}</p> : null}
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customerCompanyId">Customer</label>
          <select
            className="block w-full min-w-0 max-w-full rounded-2xl border border-slate-200 px-4 py-3.5"
            id="customerCompanyId"
            name="customerCompanyId"
            onChange={(event) => {
              setSelectedCustomerId(event.target.value);
              setSelectedSiteId(event.target.value && autoSelectGenericSiteOnCustomerChange ? genericInspectionSiteOptionValue : "");
            }}
            required
            value={selectedCustomerId}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="siteId">Site</label>
          <select
            className="block w-full min-w-0 max-w-full rounded-2xl border border-slate-200 px-4 py-3.5"
            disabled={selectedCustomerId === ""}
            id="siteId"
            name="siteId"
            onChange={(event) => setSelectedSiteId(event.target.value)}
            required
            value={resolvedSiteId}
          >
            <option value="">{selectedCustomerId ? "Select site for customer" : "Select customer first"}</option>
            {selectedCustomerId ? <option value={genericInspectionSiteOptionValue}>Use generic site ({genericInspectionSiteName})</option> : null}
            {selectedCustomerId && allowCustomOneTimeSite ? <option value={customInspectionSiteOptionValue}>{customInspectionSiteName}</option> : null}
            {filteredSites.map((site) => <option key={site.id} value={site.id}>{site.name} - {site.city}</option>)}
          </select>
          <p className="mt-2 text-sm leading-5 text-slate-500">
            {selectedCustomerId
              ? filteredSites.length
                ? `Only sites for the selected customer are shown.${allowCustomOneTimeSite ? " You can also create a one-time site for this inspection or use the generic site option when the visit is not tied to a specific location." : " Choose the generic site option when this visit is not tied to a specific location."}`
                : `No sites are available for this customer yet.${allowCustomOneTimeSite ? " Create a one-time site or use the generic site option to keep scheduling moving safely." : " Use the generic site option to keep scheduling moving safely."}`
              : "Pick a customer to narrow the site list and avoid mismatched scheduling."}
          </p>
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
          <p className="mt-2 text-sm leading-5 text-slate-500">This is the visit month. Each service line below can still carry its own due month or exact due date.</p>
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="scheduledStart">Visit start</label>
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 sm:text-sm sm:tracking-[0.2em]">Services on this visit</p>
            <h4 className="mt-1 text-lg font-semibold text-ink">Schedule for this visit and track future due work</h4>
            <p className="mt-2 text-sm leading-5 text-slate-500">Each service line can have its own technician, due month, due date, and scheduling status.</p>
          </div>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            onClick={(event) => {
              event.preventDefault();
              addServiceLine();
            }}
            type="button"
          >
            Add service line
          </button>
        </div>
        <div className="space-y-4">
          {serviceLines.map((line, index) => {
            const isCurrentVisitLine = line.schedulingStatus === "due_now" || line.schedulingStatus === "scheduled_now";
            const isFutureLine = line.schedulingStatus === "scheduled_future" || line.schedulingStatus === "not_scheduled";

            return (
              <div key={line.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
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
                      <option value="">{isCurrentVisitLine ? "Select technician" : "Leave unassigned for now"}</option>
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
                    <label className="mb-2 block text-sm font-medium text-slate-600">Due date</label>
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
          <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3.5" id="reason" name="reason" placeholder="Explain why this follow-up or amendment is needed" required={reasonRequired} />
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
            <input accept="application/pdf" className="block w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm" id="externalDocuments" multiple name="externalDocuments" type="file" />
            <p className="mt-2 text-sm leading-5 text-slate-500">You can attach one or more PDFs here. File names are used as the initial document identifiers.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="externalDocumentLabel">Optional label</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3.5" id="externalDocumentLabel" name="externalDocumentLabel" placeholder="Used when uploading a single external PDF" />
          </div>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <input className="h-5 w-5 rounded border-slate-300" defaultChecked name="externalDocumentsRequireSignature" type="checkbox" />
            Mark uploaded PDFs as requiring technician signature
          </label>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <input className="h-5 w-5 rounded border-slate-300" name="externalDocumentsCustomerVisible" type="checkbox" />
            Make signed versions visible in the customer portal
          </label>
        </div>
      ) : null}
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{state.success}</p> : null}
      <button className="w-full rounded-2xl bg-ember px-5 py-3 text-base font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Saving schedule..." : submitLabel}
      </button>
    </form>
  );
}
