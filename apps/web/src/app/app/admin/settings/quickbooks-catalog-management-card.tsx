"use client";

import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

type QuickBooksCatalogManagementCardProps = {
  connected: boolean;
  configured: boolean;
  reconnectRequired: boolean;
  modeMismatch: boolean;
  items: Array<{
    id: string;
    quickbooksItemId: string;
    name: string;
    sku: string | null;
    itemType: string;
    active: boolean;
    unitPrice: number | null;
    importedAt: Date;
  }>;
  createCatalogItemAction: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  updateCatalogItemAction: (formData: FormData) => Promise<void>;
  notice?: string | null;
};

export function QuickBooksCatalogManagementCard({
  connected,
  configured,
  reconnectRequired,
  modeMismatch,
  items,
  createCatalogItemAction,
  updateCatalogItemAction,
  notice
}: QuickBooksCatalogManagementCardProps) {
  const [createState, createFormAction, createPending] = useActionState(createCatalogItemAction, initialState);
  const canManageCatalog = configured && connected && !reconnectRequired && !modeMismatch;

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">QuickBooks products and services</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Create and edit billing catalog items</h3>
        <p className="mt-2 text-sm text-slate-500">Use this for the QuickBooks service catalog TradeWorx relies on during invoice sync. Changes write through to QuickBooks first, then refresh the local tenant catalog safely.</p>
      </div>

      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-ink">Connection requirement</p>
        <p className="mt-2">
          {canManageCatalog
            ? "QuickBooks is connected and ready. New items created here will be saved in QuickBooks and then cached in TradeWorx."
            : "Reconnect QuickBooks in the correct mode before creating or editing products and services here."}
        </p>
      </div>

      <form action={createFormAction} className="rounded-[1.5rem] border border-slate-200 p-5">
        <div className="mb-4">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">New item</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">Add a QuickBooks service or product</h4>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="catalogItemName">Name</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="catalogItemName" name="name" placeholder="Annual inspection" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="catalogItemSku">SKU / code</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="catalogItemSku" name="sku" placeholder="FE-ANNUAL" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="catalogItemType">Item type</label>
            <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="Service" id="catalogItemType" name="itemType">
              <option value="Service">Service</option>
              <option value="NonInventory">Product (non-inventory)</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="catalogItemUnitPrice">Unit price</label>
            <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="catalogItemUnitPrice" min="0" name="unitPrice" placeholder="95.00" step="0.01" type="number" />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <input className="h-5 w-5 rounded border-slate-300" defaultChecked name="active" type="checkbox" />
          Item is active
        </label>
        {createState.error ? <p className="mt-3 text-sm text-rose-600">{createState.error}</p> : null}
        {createState.success ? <p className="mt-3 text-sm text-emerald-600">{createState.success}</p> : null}
        {notice ? <p className="mt-3 text-sm text-slateblue">{notice}</p> : null}
        <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={!canManageCatalog || createPending} type="submit">
          {createPending ? "Saving item..." : "Add product or service"}
        </button>
      </form>

      <div className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Editable imported items</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">{items.length} in the current view</h4>
        </div>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">Import the QuickBooks catalog or clear the current filters to edit products and services here.</p>
        ) : items.map((item) => {
          const editable = item.itemType === "Service" || item.itemType === "NonInventory";

          return (
            <div key={item.id} className="rounded-[1.5rem] border border-slate-200 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-ink">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.itemType} · {item.quickbooksItemId}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${item.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {item.active ? "Active" : "Inactive"}
                </span>
              </div>
              {!editable ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  TradeWorx leaves this QuickBooks item type read-only for safety. Service and NonInventory items can be edited here.
                </div>
              ) : (
                <form action={updateCatalogItemAction} className="space-y-4">
                  <input name="catalogItemId" type="hidden" value={item.id} />
                  <input name="itemType" type="hidden" value={item.itemType} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Name</label>
                      <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={item.name} name="name" required />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">SKU / code</label>
                      <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={item.sku ?? ""} name="sku" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Unit price</label>
                      <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={item.unitPrice ?? ""} min="0" name="unitPrice" step="0.01" type="number" />
                    </div>
                    <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 md:self-end">
                      <input className="h-5 w-5 rounded border-slate-300" defaultChecked={item.active} name="active" type="checkbox" />
                      Item is active
                    </label>
                  </div>
                  <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-60" disabled={!canManageCatalog} type="submit">
                    Save product or service
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
