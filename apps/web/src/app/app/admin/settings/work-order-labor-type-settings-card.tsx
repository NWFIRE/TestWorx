"use client";

import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

type LaborType = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  rate: number;
  taxable: boolean;
  active: boolean;
  quickBooksItemId: string | null;
  catalogItemId: string | null;
  catalogItemName: string | null;
};

type CatalogItem = {
  id: string;
  name: string;
  quickbooksItemId: string;
  itemType: string;
  unitPrice: number | null;
  taxable: boolean;
};

type WorkOrderLaborTypeSettingsCardProps = {
  laborTypes: LaborType[];
  catalogItems: CatalogItem[];
  storageReady?: boolean;
  updateAction: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
};

export function WorkOrderLaborTypeSettingsCard({
  laborTypes,
  catalogItems,
  storageReady = true,
  updateAction
}: WorkOrderLaborTypeSettingsCardProps) {
  const [state, formAction, pending] = useActionState(updateAction, initialState);

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Work order labor billing</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Labor types and rates</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          These rates drive the technician work order Labor Type dropdown. Billing snapshots the selected rate, taxability, and QuickBooks item when labor is saved.
        </p>
        {!storageReady ? (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Labor type settings will be editable after the work order labor migration is applied.
          </p>
        ) : null}
        {state.error ? <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</p> : null}
        {state.success ? <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{state.success}</p> : null}
      </div>

      <div className="space-y-3">
        {laborTypes.map((laborType) => (
          <form action={formAction} className="rounded-[1.5rem] border border-slate-200 p-4" key={laborType.id}>
            <input name="laborTypeId" type="hidden" value={laborType.id} />
            <div className="grid gap-3 lg:grid-cols-[1.1fr_0.45fr_1.2fr_0.35fr_0.35fr_auto] lg:items-end">
              <div>
                <p className="text-sm font-semibold text-slate-950">{laborType.name}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{laborType.code}</p>
                <p className="mt-1 text-xs text-slate-500">{laborType.quickBooksItemId ? `QB item ${laborType.quickBooksItemId}` : "No QuickBooks item mapped"}</p>
              </div>
              <label className="block text-sm font-medium text-slate-600">
                Rate
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-50"
                  defaultValue={laborType.rate.toFixed(2)}
                  disabled={!storageReady}
                  min="0"
                  name="rate"
                  step="0.01"
                  type="number"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                QuickBooks product/service
                <select
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 disabled:bg-slate-50"
                  defaultValue={laborType.catalogItemId ?? ""}
                  disabled={!storageReady}
                  name="catalogItemId"
                >
                  <option value="">No mapping</option>
                  {catalogItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} | {item.itemType} | {item.taxable ? "Taxable" : "Non-taxable"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                <input defaultChecked={laborType.taxable} disabled={!storageReady} name="taxable" type="checkbox" />
                Taxable
              </label>
              <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                <input defaultChecked={laborType.active} disabled={!storageReady} name="active" type="checkbox" />
                Active
              </label>
              <button className="min-h-12 rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!storageReady || pending} type="submit">
                {pending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
