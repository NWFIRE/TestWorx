"use client";

import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

type MinimumTicketRule = {
  id: string;
  name: string;
  ruleType: string;
  amount: number;
  currency: string;
  appliesTo: string;
  locationMode: string;
  city: string | null;
  state: string | null;
  priority: number;
  isActive: boolean;
};

type MinimumTicketPricingSettingsCardProps = {
  rules: MinimumTicketRule[];
  upsertRuleAction: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  deleteRuleAction: (formData: FormData) => Promise<void>;
};

const ruleLabels: Record<string, string> = {
  local_service: "Local service",
  standard_service: "Standard service",
  walk_in: "Walk-in"
};

function ruleDescription(rule: MinimumTicketRule) {
  if (rule.ruleType === "walk_in") {
    return "Customer drop-off or in-office extinguisher work.";
  }
  if (rule.ruleType === "local_service") {
    return [rule.city, rule.state].filter(Boolean).join(", ") || "Local service area";
  }
  return "Field service outside the local service area.";
}

export function MinimumTicketPricingSettingsCard({
  rules,
  upsertRuleAction,
  deleteRuleAction
}: MinimumTicketPricingSettingsCardProps) {
  const [state, formAction, pending] = useActionState(upsertRuleAction, initialState);

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Minimum ticket pricing</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Location-based minimums</h3>
        <p className="mt-2 text-sm text-slate-500">
          TradeWorx checks the full ticket subtotal after service fees, compliance fees, labor, parts, and report lines. If the total is below the matching minimum, it adds one clear adjustment line.
        </p>
      </div>

      <form action={formAction} className="rounded-[1.5rem] border border-slate-200 p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="ruleType">Minimum type</label>
            <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="local_service" id="ruleType" name="ruleType">
              <option value="local_service">Enid local minimum</option>
              <option value="standard_service">Standard service minimum</option>
              <option value="walk_in">Walk-in minimum</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="name">Rule name</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="Enid Local Minimum" id="name" name="name" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="amount">Minimum amount</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={59} id="amount" min="0" name="amount" required step="0.01" type="number" />
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="appliesTo">Applies to</label>
            <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="all" id="appliesTo" name="appliesTo">
              <option value="all">All tickets</option>
              <option value="inspection">Inspection</option>
              <option value="service">Service/repair</option>
              <option value="walk_in">Walk-in only</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="locationMode">Location mode</label>
            <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="city" id="locationMode" name="locationMode">
              <option value="city">City</option>
              <option value="manual">Manual / catch-all</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="city">City</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="Enid" id="city" name="city" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="state">State</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="OK" id="state" name="state" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="priority">Priority</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={50} id="priority" min="0" name="priority" type="number" />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <input className="h-5 w-5 rounded border-slate-300" defaultChecked name="isActive" type="checkbox" />
          Rule is active
        </label>
        {state.error ? <p className="mt-3 text-sm text-rose-600">{state.error}</p> : null}
        {state.success ? <p className="mt-3 text-sm text-emerald-700">{state.success}</p> : null}
        <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Saving minimum..." : "Save minimum rule"}
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        {rules.map((rule) => (
          <div key={`${rule.ruleType}-${rule.id || rule.name}`} className="rounded-[1.5rem] border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{ruleLabels[rule.ruleType] ?? rule.ruleType}</p>
                <h4 className="mt-2 text-lg font-semibold text-ink">{rule.name}</h4>
                <p className="mt-1 text-sm text-slate-500">{ruleDescription(rule)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${rule.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {rule.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="mt-5 text-3xl font-semibold text-ink">${rule.amount.toFixed(2)}</p>
            <p className="mt-1 text-sm text-slate-500">Priority {rule.priority} · {rule.currency}</p>
            {rule.id ? (
              <form action={deleteRuleAction} className="mt-4">
                <input name="ruleId" type="hidden" value={rule.id} />
                <button className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600" type="submit">
                  Delete
                </button>
              </form>
            ) : (
              <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Built-in default. Save a rule above to customize this minimum.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
