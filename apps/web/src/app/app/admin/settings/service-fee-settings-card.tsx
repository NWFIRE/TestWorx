"use client";

import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

type ServiceFeeSettingsCardProps = {
  defaultValues: {
    defaultServiceFeeCode: string;
    defaultServiceFeeUnitPrice: number | null;
  };
  customers: Array<{ id: string; name: string }>;
  sites: Array<{ id: string; name: string; customerCompany: { name: string } }>;
  rules: Array<{
    id: string;
    customerCompanyId: string | null;
    siteId: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    feeCode: string;
    unitPrice: number;
    priority: number;
    isActive: boolean;
    customerCompany: { name: string } | null;
    site: { name: string } | null;
  }>;
  updateDefaultAction: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  createRuleAction: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  updateRuleAction: (formData: FormData) => Promise<void>;
  deleteRuleAction: (formData: FormData) => Promise<void>;
};

export function ServiceFeeSettingsCard({
  defaultValues,
  customers,
  sites,
  rules,
  updateDefaultAction,
  createRuleAction,
  updateRuleAction,
  deleteRuleAction
}: ServiceFeeSettingsCardProps) {
  const [defaultState, defaultFormAction, defaultPending] = useActionState(updateDefaultAction, initialState);
  const [createState, createFormAction, createPending] = useActionState(createRuleAction, initialState);

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Inspection service fees</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Default fee and location rules</h3>
        <p className="mt-2 text-sm text-slate-500">Every inspection generates one service fee line. Site and customer overrides win first, then matching location rules, then the default service fee.</p>
      </div>

      <form action={defaultFormAction} className="rounded-[1.5rem] border border-slate-200 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="defaultServiceFeeCode">Default fee code</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={defaultValues.defaultServiceFeeCode} id="defaultServiceFeeCode" name="defaultServiceFeeCode" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="defaultServiceFeeUnitPrice">Default unit price</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={defaultValues.defaultServiceFeeUnitPrice ?? ""} id="defaultServiceFeeUnitPrice" min="0" name="defaultServiceFeeUnitPrice" placeholder="95.00" step="0.01" type="number" />
          </div>
        </div>
        {defaultState.error ? <p className="mt-3 text-sm text-rose-600">{defaultState.error}</p> : null}
        {defaultState.success ? <p className="mt-3 text-sm text-emerald-600">{defaultState.success}</p> : null}
        <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={defaultPending} type="submit">
          {defaultPending ? "Saving default..." : "Save default fee"}
        </button>
      </form>

      <form action={createFormAction} className="rounded-[1.5rem] border border-slate-200 p-5">
        <div className="mb-4">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">New rule</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">Add location or override pricing</h4>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="customerCompanyId">Customer override</label>
            <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="" id="customerCompanyId" name="customerCompanyId">
              <option value="">Any customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="siteId">Site override</label>
            <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="" id="siteId" name="siteId">
              <option value="">Any site</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name} ({site.customerCompany.name})</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="city">City</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="city" name="city" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="state">State</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="state" name="state" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="zipCode">ZIP code</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="zipCode" name="zipCode" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="feeCode">Fee code</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="SERVICE_FEE" id="feeCode" name="feeCode" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="priority">Priority</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={0} id="priority" min="0" name="priority" type="number" />
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="unitPrice">Unit price</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="unitPrice" min="0" name="unitPrice" placeholder="125.00" required step="0.01" type="number" />
          </div>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 md:self-end">
            <input className="h-5 w-5 rounded border-slate-300" defaultChecked name="isActive" type="checkbox" />
            Rule is active
          </label>
        </div>
        {createState.error ? <p className="mt-3 text-sm text-rose-600">{createState.error}</p> : null}
        {createState.success ? <p className="mt-3 text-sm text-emerald-600">{createState.success}</p> : null}
        <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={createPending} type="submit">
          {createPending ? "Saving rule..." : "Add service fee rule"}
        </button>
      </form>

      <div className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Existing rules</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">{rules.length} configured</h4>
        </div>
        {rules.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No service fee rules yet. The default fee will be used for every inspection until you add overrides.</p>
        ) : rules.map((rule) => (
          <div key={rule.id} className="rounded-[1.5rem] border border-slate-200 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-lg font-semibold text-ink">
                  {rule.site?.name ?? rule.customerCompany?.name ?? rule.zipCode ?? ([rule.city, rule.state].filter(Boolean).join(", ") || "Catch-all rule")}
                </p>
                <p className="text-sm text-slate-500">
                  {rule.site?.name ? `Site override${rule.customerCompany?.name ? ` · ${rule.customerCompany.name}` : ""}` : rule.customerCompany?.name ? `Customer override · ${rule.customerCompany.name}` : "Location rule"}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${rule.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {rule.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <form action={updateRuleAction} className="space-y-4">
              <input name="ruleId" type="hidden" value={rule.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Customer</label>
                  <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.customerCompanyId ?? ""} name="customerCompanyId">
                    <option value="">Any customer</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Site</label>
                  <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.siteId ?? ""} name="siteId">
                    <option value="">Any site</option>
                    {sites.map((site) => <option key={site.id} value={site.id}>{site.name} ({site.customerCompany.name})</option>)}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">City</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.city ?? ""} name="city" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">State</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.state ?? ""} name="state" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">ZIP</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.zipCode ?? ""} name="zipCode" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Fee code</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.feeCode} name="feeCode" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Priority</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.priority} min="0" name="priority" type="number" />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Unit price</label>
                  <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rule.unitPrice} min="0" name="unitPrice" step="0.01" type="number" />
                </div>
                <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 md:self-end">
                  <input className="h-5 w-5 rounded border-slate-300" defaultChecked={rule.isActive} name="isActive" type="checkbox" />
                  Active
                </label>
                <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue md:self-end" type="submit">
                  Save rule
                </button>
              </div>
            </form>
            <form action={deleteRuleAction} className="mt-3">
              <input name="ruleId" type="hidden" value={rule.id} />
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-600" type="submit">
                Delete rule
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
