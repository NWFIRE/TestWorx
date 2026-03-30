"use client";

import { useActionState, useMemo, useState } from "react";
import type { CustomerOption, SiteOption, TechnicianOption } from "@testworx/types";
import {
  customInspectionSiteName,
  customInspectionSiteOptionValue,
  defaultScheduledStartForMonth,
  editableInspectionStatuses,
  formatInspectionStatusLabel,
  genericInspectionSiteName,
  genericInspectionSiteOptionValue,
  getDefaultInspectionRecurrenceFrequency,
  inspectionTypeRegistry
} from "@testworx/lib";

type InspectionType = keyof typeof inspectionTypeRegistry;
type RecurrenceFrequency = "ONCE" | "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
const recurrenceOptions: RecurrenceFrequency[] = ["ONCE", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];
type EditableInspectionStatus = (typeof editableInspectionStatuses)[number];
const statusOptions = editableInspectionStatuses;
const initialState = { error: null as string | null, success: null as string | null };

type InspectionTaskValue = {
  inspectionType: InspectionType;
  frequency: RecurrenceFrequency;
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
  const [state, formAction, pending] = useActionState(action, initialState);
  const initialTaskSelections = new Map((initialValues?.tasks ?? []).map((task) => [task.inspectionType, task.frequency]));
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
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<string[]>(initialValues?.assignedTechnicianIds ?? []);
  const [selectedTasks, setSelectedTasks] = useState<Record<InspectionType, { selected: boolean; frequency: RecurrenceFrequency }>>(
    () =>
      Object.fromEntries(
        (Object.keys(inspectionTypeRegistry) as InspectionType[]).map((inspectionType) => [
          inspectionType,
          {
            selected: (initialValues?.tasks ?? []).some((task) => task.inspectionType === inspectionType),
            frequency: initialTaskSelections.get(inspectionType) ?? getDefaultInspectionRecurrenceFrequency(inspectionType)
          }
        ])
      ) as Record<InspectionType, { selected: boolean; frequency: RecurrenceFrequency }>
  );
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

  return (
    <form action={formAction} className="min-w-0 overflow-hidden space-y-5 rounded-[1.5rem] bg-white p-4 shadow-panel sm:space-y-6 sm:rounded-[2rem] sm:p-6">
      {initialValues?.inspectionId ? <input name="inspectionId" type="hidden" value={initialValues.inspectionId} /> : null}
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
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="inspectionMonth">Inspection month</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-4 py-3.5"
            id="inspectionMonth"
            name="inspectionMonth"
            onChange={(event) => {
              const nextMonth = event.target.value;
              setInspectionMonth(nextMonth);
              if (!startManuallyEdited) {
                setScheduledStart((current) => defaultScheduledStartForMonth(nextMonth, current));
              }
            }}
            required
            type="month"
            value={inspectionMonth}
          />
          <p className="mt-2 text-sm leading-5 text-slate-500">Selecting a month defaults the start date to the first day unless you choose a different start date.</p>
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="scheduledStart">Scheduled start</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-4 py-3.5"
            id="scheduledStart"
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
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="scheduledEnd">Scheduled end</label>
          <input
            className="block w-full min-w-0 max-w-full rounded-2xl border border-slate-200 px-4 py-3.5"
            id="scheduledEnd"
            name="scheduledEnd"
            onChange={(event) => setScheduledEnd(event.target.value)}
            type="datetime-local"
            value={scheduledEnd}
          />
          <p className="mt-2 text-sm leading-5 text-slate-500">Optional. Leave blank unless dispatch needs a specific end time.</p>
        </div>
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="status">Status</label>
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
      <div>
        <p className="mb-2 block text-sm font-medium text-slate-600">Assigned technicians</p>
        <div className="grid gap-3 rounded-2xl border border-slate-200 p-3 sm:p-4 md:grid-cols-2">
          {technicians.length === 0 ? (
            <p className="text-sm text-slate-500">No technicians are available for this tenant yet.</p>
          ) : technicians.map((tech) => (
            <label key={tech.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5">
              <input
                className="h-5 w-5 rounded border-slate-300"
                checked={selectedTechnicianIds.includes(tech.id)}
                name="assignedTechnicianIds"
                onChange={(event) =>
                  setSelectedTechnicianIds((current) =>
                    event.target.checked
                      ? [...current, tech.id]
                      : current.filter((technicianId) => technicianId !== tech.id)
                  )
                }
                type="checkbox"
                value={tech.id}
              />
              <span className="text-sm font-medium text-ink">{tech.name}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm leading-5 text-slate-500">Leave all unchecked to keep the visit in the shared queue. Select multiple techs for mixed-license visits.</p>
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
      <div className="min-w-0 space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-600">Inspection types and recurrence</p>
          <p className="text-sm leading-5 text-slate-500">Each selected report type gets its own recurring task under the same visit.</p>
        </div>
        <div className="grid gap-3">
          {(Object.entries(inspectionTypeRegistry) as Array<[InspectionType, (typeof inspectionTypeRegistry)[InspectionType]]>).map(([inspectionType, inspectionConfig]) => (
            <div key={inspectionType} className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[1.5fr_1fr] md:items-center">
              <label className="flex items-start gap-3">
                <input
                  className="mt-1 h-5 w-5 rounded border-slate-300"
                  checked={selectedTasks[inspectionType]?.selected ?? false}
                  onChange={(event) =>
                    setSelectedTasks((current) => ({
                      ...current,
                      [inspectionType]: {
                        ...(current[inspectionType] ?? { frequency: getDefaultInspectionRecurrenceFrequency(inspectionType) }),
                        selected: event.target.checked
                      }
                    }))
                  }
                  type="checkbox"
                  name={`type:${inspectionType}`}
                  value="true"
                />
                <span>
                  <span className="block font-medium text-ink">{inspectionConfig.label}</span>
                  <span className="mt-1 block text-sm leading-5 text-slate-500">{inspectionConfig.description}</span>
                </span>
              </label>
              <select
                className="rounded-2xl border border-slate-200 px-4 py-3.5"
                name={`frequency:${inspectionType}`}
                onChange={(event) =>
                  setSelectedTasks((current) => ({
                    ...current,
                    [inspectionType]: {
                      selected: current[inspectionType]?.selected ?? false,
                      frequency: event.target.value as RecurrenceFrequency
                    }
                  }))
                }
                value={selectedTasks[inspectionType]?.frequency ?? getDefaultInspectionRecurrenceFrequency(inspectionType)}
              >
                {recurrenceOptions.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state.success ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{state.success}</p> : null}
      <button className="w-full rounded-2xl bg-ember px-5 py-3 text-base font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Saving schedule..." : submitLabel}
      </button>
    </form>
  );
}
