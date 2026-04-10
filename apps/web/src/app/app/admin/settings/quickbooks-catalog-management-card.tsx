"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { ActionButton } from "@/app/action-button";
import { useToast } from "@/app/toast-provider";
import { buildSettingsHref } from "./settings-query";

const initialState = { error: null as string | null, success: null as string | null };

type QuickBooksCatalogManagementCardProps = {
  connected: boolean;
  configured: boolean;
  reconnectRequired: boolean;
  modeMismatch: boolean;
  importedItemCount: number;
  filteredItemCount: number;
  items: Array<{
    id: string;
    quickbooksItemId: string;
    name: string;
    sku: string | null;
    itemType: string;
    active: boolean;
    taxable: boolean;
    unitPrice: number | null;
    importedAt: Date;
  }>;
  activeItemCount: number;
  inactiveItemCount: number;
  itemTypes: Array<{
    itemType: string;
    count: number;
  }>;
  filters: {
    search: string;
    itemType: string;
    status: "all" | "active" | "inactive";
    page: number;
    limit: number;
    totalPages: number;
  };
  createCatalogItemAction: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  updateCatalogItemAction: (formData: FormData) => Promise<{ ok: boolean; error: string | null; success: string | null }>;
  importCatalogAction?: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  notice?: string | null;
};

export function QuickBooksCatalogManagementCard({
  connected,
  configured,
  reconnectRequired,
  modeMismatch,
  importedItemCount,
  filteredItemCount,
  items,
  activeItemCount,
  inactiveItemCount,
  itemTypes,
  filters,
  createCatalogItemAction,
  updateCatalogItemAction,
  importCatalogAction,
  notice
}: QuickBooksCatalogManagementCardProps) {
  const [createState, createFormAction, createPending] = useActionState(createCatalogItemAction, initialState);
  const [importState, importFormAction, importPending] = useActionState(importCatalogAction ?? (async () => initialState), initialState);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const canManageCatalog = configured && connected && !reconnectRequired && !modeMismatch;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousPageHref = buildSettingsHref(pathname, searchParams, {
    catalogOpen: 1,
    qboPage: Math.max(filters.page - 1, 1)
  });
  const nextPageHref = buildSettingsHref(pathname, searchParams, {
    catalogOpen: 1,
    qboPage: Math.min(filters.page + 1, filters.totalPages)
  });
  const clearFiltersHref = buildSettingsHref(pathname, searchParams, {
    catalogOpen: 1,
    qboSearch: null,
    qboType: null,
    qboStatus: null,
    qboPage: 1
  });

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">QuickBooks products and services</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Create and edit billing catalog items</h3>
        <p className="mt-2 text-sm text-slate-500">Manage the synced QuickBooks products and services catalog TradeWorx uses for quotes, billing, and direct invoice creation.</p>
      </div>

      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-ink">Connection requirement</p>
        <p className="mt-2">
          {canManageCatalog
            ? "QuickBooks is connected and ready. New items created here will be saved in QuickBooks and then cached in TradeWorx."
            : "Reconnect QuickBooks in the correct mode before creating or editing products and services here."}
        </p>
      </div>

      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Imported QuickBooks products and services</p>
        <h4 className="mt-1 text-lg font-semibold text-ink">{importedItemCount} item{importedItemCount === 1 ? "" : "s"} imported</h4>
        <p className="mt-2 text-sm text-slate-500">TradeWorx keeps the current view paginated so the page stays responsive as your QuickBooks company grows.</p>
        <p className="mt-2 text-sm text-slate-500">Showing {filteredItemCount} item{filteredItemCount === 1 ? "" : "s"} in the current view.</p>
        {importCatalogAction ? (
          <form action={importFormAction} className="mt-4">
            <ActionButton pending={importPending} pendingLabel="Refreshing catalog..." tone="secondary" type="submit">
              Refresh from QuickBooks
            </ActionButton>
          </form>
        ) : null}
        {importState.error ? <p className="mt-3 text-sm text-rose-600">{importState.error}</p> : null}
        {importState.success ? <p className="mt-3 text-sm text-emerald-600">{importState.success}</p> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <p>Active items</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{activeItemCount}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <p>Inactive items</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{inactiveItemCount}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <p>Item types</p>
            <p className="mt-2 text-2xl font-semibold text-ink">{itemTypes.length}</p>
          </div>
        </div>

        <form className="mt-4 rounded-[1.5rem] border border-slate-200 p-4" method="GET">
          <input name="catalogOpen" type="hidden" value="1" />
          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr_0.8fr_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="qboSearch">Search name, SKU, or QBO item id</label>
              <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={filters.search} id="qboSearch" name="qboSearch" placeholder="FE-ANNUAL or Battery replacement" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="qboType">Item type</label>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={filters.itemType} id="qboType" name="qboType">
                <option value="">All item types</option>
                {itemTypes.map((itemType) => (
                  <option key={itemType.itemType} value={itemType.itemType}>{itemType.itemType} ({itemType.count})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="qboStatus">Status</label>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={filters.status} id="qboStatus" name="qboStatus">
                <option value="all">All items</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <input name="qboPage" type="hidden" value="1" />
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white" type="submit">
                Apply
              </button>
              {(filters.search || filters.itemType || filters.status !== "all") ? (
                <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={clearFiltersHref}>
                  Clear
                </Link>
              ) : null}
            </div>
          </div>
        </form>
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
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <input className="h-5 w-5 rounded border-slate-300" defaultChecked name="active" type="checkbox" />
            Item is active
          </label>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <input className="h-5 w-5 rounded border-slate-300" name="taxable" type="checkbox" />
            Taxable item
          </label>
        </div>
        {createState.error ? <p className="mt-3 text-sm text-rose-600">{createState.error}</p> : null}
        {createState.success ? <p className="mt-3 text-sm text-emerald-600">{createState.success}</p> : null}
        {notice ? <p className="mt-3 text-sm text-slateblue">{notice}</p> : null}
        <ActionButton className="mt-4" disabled={!canManageCatalog} pending={createPending} pendingLabel="Saving item..." tone="primary" type="submit">
          Add product or service
        </ActionButton>
      </form>

      <div className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Editable imported items</p>
          <h4 className="mt-1 text-lg font-semibold text-ink">Page {filters.page} of {filters.totalPages}</h4>
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
                    {item.itemType} | {item.quickbooksItemId}
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
                <form className="space-y-4">
                  <input name="catalogItemId" type="hidden" value={item.id} />
                  <input name="itemType" type="hidden" value={item.itemType} />
                  <input name="catalogOpen" type="hidden" value="1" />
                  <input name="qboPage" type="hidden" value={String(filters.page)} />
                  <input name="qboSearch" type="hidden" value={filters.search} />
                  <input name="qboType" type="hidden" value={filters.itemType} />
                  <input name="qboStatus" type="hidden" value={filters.status} />
                  <div className="grid gap-4 lg:grid-cols-2">
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
                    <div className="grid gap-3 md:self-end">
                      <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <input className="h-5 w-5 rounded border-slate-300" defaultChecked={item.active} name="active" type="checkbox" />
                        Item is active
                      </label>
                      <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <input className="h-5 w-5 rounded border-slate-300" defaultChecked={item.taxable} name="taxable" type="checkbox" />
                        Taxable item
                      </label>
                    </div>
                  </div>
                  <ActionButton
                    disabled={!canManageCatalog}
                    onClick={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget.form;
                      if (!form) {
                        return;
                      }
                      const formData = new FormData(form);
                      setPendingItemId(item.id);
                      startTransition(async () => {
                        const result = await updateCatalogItemAction(formData);
                        if (result.ok && result.success) {
                          showToast({ title: result.success, tone: "success" });
                        } else if (result.error) {
                          showToast({ title: result.error, tone: "error" });
                        }
                        setPendingItemId(null);
                      });
                    }}
                    pending={isPending && pendingItemId === item.id}
                    pendingLabel="Saving item..."
                    type="button"
                  >
                    Save product or service
                  </ActionButton>
                </form>
              )}
            </div>
          );
        })}

        {filteredItemCount > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {(filters.page - 1) * filters.limit + 1}-{Math.min(filters.page * filters.limit, filteredItemCount)} of {filteredItemCount}
            </p>
            <div className="flex flex-wrap gap-3">
              {filters.page > 1 ? (
                <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={previousPageHref}>
                  Previous
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-300">
                  Previous
                </span>
              )}
              {filters.page < filters.totalPages ? (
                <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={nextPageHref}>
                  Next
                </Link>
              ) : (
                <span className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-300">
                  Next
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
