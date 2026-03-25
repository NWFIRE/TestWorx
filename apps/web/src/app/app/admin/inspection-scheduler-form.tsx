"use client";

import { useActionState, useMemo, useState } from "react";
import type { CustomerOption, SiteOption, TechnicianOption } from "@testworx/types";
import {
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
  allowDocumentUpload = false
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
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const selectedTasks = new Map((initialValues?.tasks ?? []).map((task) => [task.inspectionType, task.frequency]));
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialValues?.customerCompanyId ?? "");
  const [selectedSiteId, setSelectedSiteId] = useState(initialValues?.siteId ?? "");
  const [inspectionMonth, setInspectionMonth] = useState(
    initialValues?.inspectionMonth ?? (initialValues?.scheduledStart ? initialValues.scheduledStart.slice(0, 7) : new Date().toISOString().slice(0, 7))
  );
  const [scheduledStart, setScheduledStart] = useState(
    initialValues?.scheduledStart ?? defaultScheduledStartForMonth(inspectionMonth)
  );
  const [startManuallyEdited, setStartManuallyEdited] = useState(Boolean(initialValues?.scheduledStart));
  const selectedTechnicianIds = new Set(initialValues?.assignedTechnicianIds ?? []);
  const filteredSites = useMemo(
    () => sites.filter((site) => !selectedCustomerId || site.customerCompanyId === selectedCustomerId),
    [selectedCustomerId, sites]
  );
  const resolvedSiteId = filteredSites.some((site) => site.id === selectedSiteId) || selectedSiteId === genericInspectionSiteOptionValue ? selectedSiteId : "";

  return (
    <form action={formAction} className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      {initialValues?.inspectionId ? <input name="inspectionId" type="hidden" value={initialValues.inspectionId} /> : null}
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Scheduling workflow</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">{title}</h3>
        {banner ? <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{banner}</p> : null}
        {workflowNote ? <p className="mt-3 text-sm text-slate-500">{workflowNote}</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customerCompanyId">Customer</label>
          <select
            className="w-full rounded-2xl border border-slate-200 px-4 py-3"
            id="customerCompanyId"
            name="customerCompanyId"
            onChange={(event) => setSelectedCustomerId(event.target.value)}
            required
            value={selectedCustomerId}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="siteId">Site</label>
          <select
            className="w-full rounded-2xl border border-slate-200 px-4 py-3"
            disabled={selectedCustomerId !== "" && filteredSites.length === 0}
            id="siteId"
            name="siteId"
            onChange={(event) => setSelectedSiteId(event.target.value)}
            required
            value={resolvedSiteId}
          >
            <option value="">{selectedCustomerId ? "Select site for customer" : "Select customer first"}</option>
            {selectedCustomerId ? <option value={genericInspectionSiteOptionValue}>Use generic site ({genericInspectionSiteName})</option> : null}
            {filteredSites.map((site) => <option key={site.id} value={site.id}>{site.name} - {site.city}</option>)}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            {selectedCustomerId
              ? filteredSites.length
                ? "Only sites for the selected customer are shown. Choose the generic site option when this visit is not tied to a specific location."
                : "No sites are available for this customer yet. Use the generic site option to keep scheduling moving safely."
              : "Pick a customer to narrow the site list and avoid mismatched scheduling."}
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="inspectionMonth">Inspection month</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-4 py-3"
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
          <p className="mt-2 text-xs text-slate-500">Selecting a month defaults the start date to the first day unless you choose a different start date.</p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="scheduledStart">Scheduled start</label>
          <input
            className="w-full rounded-2xl border border-slate-200 px-4 py-3"
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
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="scheduledEnd">Scheduled end</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={initialValues?.scheduledEnd ?? ""} id="scheduledEnd" name="scheduledEnd" type="datetime-local" />
          <p className="mt-2 text-xs text-slate-500">Optional. Leave blank unless dispatch needs a specific end time.</p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="status">Status</label>
          <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={initialValues?.status ?? "to_be_completed"} id="status" name="status">
            {statusOptions.map((status) => <option key={status} value={status}>{formatInspectionStatusLabel(status)}</option>)}
          </select>
        </div>
      </div>
      <div>
        <p className="mb-2 block text-sm font-medium text-slate-600">Assigned technicians</p>
        <div className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-2">
          {technicians.length === 0 ? (
            <p className="text-sm text-slate-500">No technicians are available for this tenant yet.</p>
          ) : technicians.map((tech) => (
            <label key={tech.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <input
                className="h-5 w-5 rounded border-slate-300"
                defaultChecked={selectedTechnicianIds.has(tech.id)}
                name="assignedTechnicianIds"
                type="checkbox"
                value={tech.id}
              />
              <span className="text-sm font-medium text-ink">{tech.name}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Leave all unchecked to keep the visit in the shared queue. Select multiple techs for mixed-license visits.</p>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="notes">Dispatch notes</label>
        <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={initialValues?.notes ?? ""} id="notes" name="notes" />
      </div>
      {reasonLabel ? (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="reason">{reasonLabel}</label>
          <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" id="reason" name="reason" placeholder="Explain why this follow-up or amendment is needed" required={reasonRequired} />
        </div>
      ) : null}
      {allowDocumentUpload ? (
        <div className="space-y-4 rounded-[1.5rem] border border-slate-200 p-4">
          <div>
            <p className="text-sm font-medium text-slate-600">External customer PDFs</p>
            <p className="mt-1 text-sm text-slate-500">Optional. Attach customer-provided PDFs while scheduling so they are ready for the field team on day one.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="externalDocuments">Upload PDF documents</label>
            <input accept="application/pdf" className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" id="externalDocuments" multiple name="externalDocuments" type="file" />
            <p className="mt-2 text-xs text-slate-500">You can attach one or more PDFs here. File names are used as the initial document identifiers.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="externalDocumentLabel">Optional label</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="externalDocumentLabel" name="externalDocumentLabel" placeholder="Used when uploading a single external PDF" />
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
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-600">Inspection types and recurrence</p>
          <p className="text-sm text-slate-500">Each selected report type gets its own recurring task under the same visit.</p>
        </div>
        <div className="grid gap-3">
          {(Object.entries(inspectionTypeRegistry) as Array<[InspectionType, (typeof inspectionTypeRegistry)[InspectionType]]>).map(([inspectionType, inspectionConfig]) => (
            <div key={inspectionType} className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[1.5fr_1fr] md:items-center">
              <label className="flex items-start gap-3">
                <input className="mt-1 h-5 w-5 rounded border-slate-300" defaultChecked={selectedTasks.has(inspectionType)} type="checkbox" name={`type:${inspectionType}`} value="true" />
                <span>
                  <span className="block font-medium text-ink">{inspectionConfig.label}</span>
                  <span className="block text-sm text-slate-500">{inspectionConfig.description}</span>
                </span>
              </label>
              <select className="rounded-2xl border border-slate-200 px-4 py-3" defaultValue={selectedTasks.get(inspectionType) ?? getDefaultInspectionRecurrenceFrequency(inspectionType)} name={`frequency:${inspectionType}`}>
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
