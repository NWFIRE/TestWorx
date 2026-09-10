"use client";

import { useMemo, useRef, useState } from "react";
import { SearchSelect } from "@/app/search-select";
import { submitFieldRequestAction, type FieldRequestActionState } from "./actions";

type CustomerOption = {
  id: string;
  name: string;
  sites: Array<{ id: string; name: string; addressLine1: string; city: string; state: string }>;
};

const initialState: FieldRequestActionState = { ok: false, message: "" };
const fieldClass = "min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

function SubmitButton({ pending }: { pending: boolean }) {
  return <button className="min-h-14 w-full rounded-2xl bg-blue-700 px-5 text-base font-semibold text-white shadow-[0_12px_26px_rgba(29,78,216,0.22)] transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70" disabled={pending} type="submit">{pending ? "Sending request..." : "Send to office"}</button>;
}

export function FieldRequestForm({ customers }: { customers: CustomerOption[] }) {
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const submissionId = useRef<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const customerOptions = useMemo(() => customers.map((customer) => ({
    value: customer.id,
    label: customer.name,
    secondaryLabel: customer.sites[0]
      ? [customer.sites[0].name, customer.sites[0].addressLine1, customer.sites[0].city, customer.sites[0].state].filter(Boolean).join(" · ")
      : "No saved sites",
    keywords: customer.sites.map((site) => [site.name, site.addressLine1, site.city, site.state].join(" ")).join(" ")
  })), [customers]);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  return (
    <form className="space-y-5" onSubmit={async (event) => {
      event.preventDefault();
      if (submitting.current) return;
      if (!selectedCustomer) {
        setState({ ok: false, message: "Select a customer from the search results before sending your request." });
        return;
      }
      const form = event.currentTarget;
      const data = new FormData(form);
      submissionId.current ??= crypto.randomUUID();
      data.set("submissionId", submissionId.current);
      submitting.current = true;
      setPending(true);
      setState(initialState);
      try {
        const result = await submitFieldRequestAction(initialState, data);
        setState(result);
        if (result.ok) {
          form.reset();
          setCustomerId("");
          submissionId.current = null;
        }
      } catch {
        setState({ ok: false, message: "Connection interrupted. Your details are still here. Please try again." });
      } finally {
        submitting.current = false;
        setPending(false);
      }
    }}>
      <fieldset disabled={pending} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <SearchSelect
          className="min-w-0 [&_input[role=combobox]]:text-base"
          disabled={pending}
          emptyText="No matching customers. Try another name or location."
          label="Customer"
          name="customerCompanyId"
          onChange={(value) => setCustomerId(value)}
          options={customerOptions}
          placeholder="Type to search customers"
          required
          value={customerId}
        />
        <label className="space-y-2 text-sm font-semibold text-slate-700">
          Site or location
          <select key={customerId} defaultValue="" className={fieldClass} disabled={!selectedCustomer?.sites.length} name="siteId">
            <option value="">{selectedCustomer?.sites.length ? "Select site (optional)" : "No saved sites"}</option>
            {selectedCustomer?.sites.map((site) => <option key={site.id} value={site.id}>{site.name} - {site.addressLine1}, {site.city}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm font-semibold text-slate-700">
          Request type
          <select className={fieldClass} defaultValue="service_ticket" name="requestType">
            <option value="service_ticket">Service ticket</option>
            <option value="work_order">Work order</option>
            <option value="follow_up">Follow-up visit</option>
            <option value="quote_request">Quote request</option>
            <option value="other">Other request</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-semibold text-slate-700">
          Urgency
          <select className={fieldClass} defaultValue="normal" name="priority">
            <option value="normal">Normal</option>
            <option value="urgent">Urgent - needs prompt attention</option>
          </select>
        </label>
      </div>
      <label className="block space-y-2 text-sm font-semibold text-slate-700">
        What is needed?
        <input className={fieldClass} maxLength={160} name="title" placeholder="Example: Replace damaged pull station" required />
      </label>
      <label className="block space-y-2 text-sm font-semibold text-slate-700">
        Field details
        <textarea className={`${fieldClass} min-h-32 py-3`} maxLength={4000} name="description" placeholder="Describe the issue, what you observed, and any action already taken." required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-slate-700">
          Equipment or exact location <span className="font-normal text-slate-400">Optional</span>
          <textarea className={`${fieldClass} min-h-24 py-3`} maxLength={1000} name="equipmentContext" placeholder="Panel, device, asset, room, serial number..." />
        </label>
        <label className="space-y-2 text-sm font-semibold text-slate-700">
          Preferred timing <span className="font-normal text-slate-400">Optional</span>
          <textarea className={`${fieldClass} min-h-24 py-3`} maxLength={500} name="preferredTiming" placeholder="Customer availability or requested service window" />
        </label>
      </div>
      {state.message ? <p aria-live="polite" className={state.ok ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800" : "rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800"}>{state.message}</p> : null}
      <SubmitButton pending={pending} />
      </fieldset>
    </form>
  );
}
