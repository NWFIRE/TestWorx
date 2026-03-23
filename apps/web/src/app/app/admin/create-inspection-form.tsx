"use client";

import { useActionState } from "react";
import type { CustomerOption, SiteOption, TechnicianOption } from "@testworx/types";
import { getDefaultInspectionRecurrenceFrequency, inspectionTypeRegistry } from "@testworx/lib";

import { createInspectionAction } from "./actions";

type InspectionType = keyof typeof inspectionTypeRegistry;
type RecurrenceFrequency = "ONCE" | "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";
const recurrenceOptions: RecurrenceFrequency[] = ["ONCE", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];
const initialState = { error: null as string | null, success: null as string | null };

export function CreateInspectionForm({ customers, sites, technicians }: { customers: CustomerOption[]; sites: SiteOption[]; technicians: TechnicianOption[] }) {
  const [state, formAction, pending] = useActionState(createInspectionAction, initialState);

  return (
    <form action={formAction} className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customerCompanyId">Customer</label>
          <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="customerCompanyId" name="customerCompanyId" required>
            <option value="">Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="siteId">Site</label>
          <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="siteId" name="siteId" required>
            <option value="">Select site</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name} - {site.city}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="scheduledStart">Scheduled start</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="scheduledStart" name="scheduledStart" type="datetime-local" required />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="assignedTechnicianId">Assigned technician</label>
          <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="assignedTechnicianId" name="assignedTechnicianId">
            <option value="">Leave unassigned</option>
            {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="notes">Dispatch notes</label>
        <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" id="notes" name="notes" />
      </div>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-600">Inspection types and recurrence</p>
          <p className="text-sm text-slate-500">Each selected inspection type becomes its own reportable task under one visit.</p>
        </div>
        <div className="grid gap-3">
          {(Object.entries(inspectionTypeRegistry) as Array<[InspectionType, (typeof inspectionTypeRegistry)[InspectionType]]>).map(([inspectionType, inspectionConfig]) => (
            <div key={inspectionType} className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[1.5fr_1fr] md:items-center">
              <label className="flex items-start gap-3">
                <input className="mt-1 h-5 w-5 rounded border-slate-300" type="checkbox" name={`type:${inspectionType}`} value="true" />
                <span>
                  <span className="block font-medium text-ink">{inspectionConfig.label}</span>
                  <span className="block text-sm text-slate-500">{inspectionConfig.description}</span>
                </span>
              </label>
              <select className="rounded-2xl border border-slate-200 px-4 py-3" name={`frequency:${inspectionType}`} defaultValue={getDefaultInspectionRecurrenceFrequency(inspectionType)}>
                {recurrenceOptions.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <button className="rounded-2xl bg-ember px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Creating inspection..." : "Create inspection"}</button>
    </form>
  );
}

