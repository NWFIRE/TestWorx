"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function buildCatalogHref(
  pathname: string,
  searchParams: URLSearchParams,
  nextValues: Record<string, string | number | null | undefined>
) {
  const params = new URLSearchParams(searchParams.toString());

  for (const [key, value] of Object.entries(nextValues)) {
    if (value === null || value === undefined || value === "") {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  return params.toString() ? `${pathname}?${params.toString()}` : pathname;
}

export function QuickBooksSettingsCard({
  connected,
  companyName,
  realmId,
  connectedAt,
  configured,
  appConnectionMode,
  appConnectionModeLabel,
  storedConnectionMode,
  storedConnectionModeLabel,
  modeMismatch,
  reconnectRequired,
  statusLabel,
  guidance,
  connectAction,
  disconnectAction,
  importCatalogAction,
  hasStoredConnection,
  importedItemCount,
  filteredItemCount,
  importedItems,
  lastImportedAt,
  activeItemCount,
  inactiveItemCount,
  itemTypes,
  filters,
  notice,
  supportReference
}: {
  connected: boolean;
  companyName: string | null;
  realmId: string | null;
  connectedAt: Date | null;
  configured: boolean;
  appConnectionMode: "sandbox" | "live";
  appConnectionModeLabel: "Sandbox" | "Live";
  storedConnectionMode: "sandbox" | "live" | null;
  storedConnectionModeLabel: "Sandbox" | "Live" | "Unknown";
  modeMismatch: boolean;
  reconnectRequired: boolean;
  statusLabel: string;
  guidance: string | null;
  connectAction: () => Promise<void>;
  disconnectAction: () => Promise<void>;
  importCatalogAction: () => Promise<void>;
  hasStoredConnection: boolean;
  importedItemCount: number;
  filteredItemCount: number;
  importedItems: Array<{
    id: string;
    quickbooksItemId: string;
    name: string;
    sku: string | null;
    itemType: string;
    active: boolean;
    unitPrice: number | null;
    importedAt: Date;
  }>;
  lastImportedAt: Date | null;
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
  notice?: string | null;
  supportReference?: {
    intuitTid: string | null;
    message: string | null;
    action: string;
    createdAt: Date;
  } | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canImportCatalog = connected && !modeMismatch && !reconnectRequired;
  const showDisconnectAction = hasStoredConnection;
  const previousPageHref = buildCatalogHref(pathname, searchParams, { qboPage: Math.max(filters.page - 1, 1) });
  const nextPageHref = buildCatalogHref(pathname, searchParams, { qboPage: Math.min(filters.page + 1, filters.totalPages) });

  return (
    <div className="rounded-[2rem] bg-white p-6 shadow-panel">
      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">QuickBooks Online</p>
      <h3 className="mt-2 text-2xl font-semibold text-ink">Invoice sync</h3>
      <p className="mt-2 text-sm text-slate-500">Connect QuickBooks Online so finalized billing summaries can be pushed into accounting as invoices from the billing review screen, and import the full tenant-scoped QuickBooks Products &amp; Services catalog for cleaner item matching.</p>

      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <p>Status: <span className="font-semibold text-ink">{configured ? statusLabel : "Env not configured"}</span></p>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${appConnectionMode === "live" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {appConnectionModeLabel} mode
          </span>
          {storedConnectionMode ? (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${storedConnectionMode === "live" ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-700"}`}>
              Stored {storedConnectionModeLabel}
            </span>
          ) : null}
        </div>
        <p className="mt-2">Company: <span className="font-semibold text-ink">{companyName ?? "Not connected"}</span></p>
        <p className="mt-2">Realm ID: <span className="font-semibold text-ink">{realmId ?? "Not connected"}</span></p>
        <p className="mt-2">Connected at: <span className="font-semibold text-ink">{connectedAt ? connectedAt.toLocaleString() : "Not connected"}</span></p>
        <p className="mt-2">Imported catalog items: <span className="font-semibold text-ink">{importedItemCount}</span></p>
        <p className="mt-2">Last imported: <span className="font-semibold text-ink">{lastImportedAt ? lastImportedAt.toLocaleString() : "Not imported yet"}</span></p>
        {guidance ? <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">{guidance}</p> : null}
        {supportReference ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-ink">Need help with QuickBooks?</p>
            <p className="mt-2">
              Contact{" "}
              <a className="font-semibold text-slateblue underline" href="mailto:Support@tradeworx.net">
                Support@tradeworx.net
              </a>
              {" "}and include the latest support details below.
            </p>
            {supportReference.intuitTid ? (
              <p className="mt-2">
                Intuit TID: <span className="font-semibold text-ink">{supportReference.intuitTid}</span>
              </p>
            ) : null}
            {supportReference.message ? (
              <p className="mt-2">
                Last QuickBooks error: <span className="font-semibold text-ink">{supportReference.message}</span>
              </p>
            ) : null}
            <p className="mt-2">
              Logged: <span className="font-semibold text-ink">{supportReference.createdAt.toLocaleString()}</span>
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-ink">Need help with QuickBooks?</p>
            <p className="mt-2">
              Contact{" "}
              <a className="font-semibold text-slateblue underline" href="mailto:Support@tradeworx.net">
                Support@tradeworx.net
              </a>
              {" "}from here if you run into QuickBooks connection or sync problems.
            </p>
          </div>
        )}
      </div>

      {notice ? <p className="mt-4 text-sm text-slateblue">{notice}</p> : null}
      {!configured ? <p className="mt-4 text-sm text-amber-700">Set `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET` before connecting.</p> : null}

      <div className="mt-4 grid gap-3">
        <form action={connectAction}>
          <button className="w-full rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!configured} type="submit">
            {hasStoredConnection ? `Reconnect QuickBooks (${appConnectionModeLabel})` : `Connect QuickBooks (${appConnectionModeLabel})`}
          </button>
        </form>
        {connected ? (
          <form action={importCatalogAction}>
            <button className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={!canImportCatalog} type="submit">
              Import Products &amp; Services
            </button>
          </form>
        ) : null}
        {showDisconnectAction ? (
          <form action={disconnectAction}>
            <button className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
              Disconnect QuickBooks
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-6">
        <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Imported QuickBooks Products &amp; Services</p>
        <h4 className="mt-1 text-lg font-semibold text-ink">{importedItemCount} item{importedItemCount === 1 ? "" : "s"} imported</h4>
        <p className="mt-2 text-sm text-slate-500">This is the full imported QuickBooks catalog for the currently connected {appConnectionModeLabel.toLowerCase()} company. It can include unrelated business items, not just fire-inspection-specific services.</p>
        <p className="mt-2 text-sm text-slate-500">Showing {filteredItemCount} item{filteredItemCount === 1 ? "" : "s"} in the current view.</p>

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
          <div className="grid gap-4 md:grid-cols-[1.3fr_0.9fr_0.8fr_auto]">
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
            <div className="flex items-end gap-3">
              <input name="qboPage" type="hidden" value="1" />
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white" type="submit">
                Apply
              </button>
              {(filters.search || filters.itemType || filters.status !== "all") ? (
                <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={pathname}>
                  Clear
                </Link>
              ) : null}
            </div>
          </div>
        </form>

        <div className="mt-4 space-y-3">
          {importedItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No QuickBooks items matched the current catalog view. TradeWorx will still auto-create missing service items during invoice sync until you import the catalog.</p>
          ) : importedItems.map((item) => (
            <div key={item.id} className="rounded-[1.25rem] border border-slate-200 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {[item.itemType, item.sku ? `SKU ${item.sku}` : null, `QBO ${item.quickbooksItemId}`].filter(Boolean).join(" | ")}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${item.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {item.active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Unit price: <span className="font-semibold text-ink">{item.unitPrice !== null ? `$${item.unitPrice.toFixed(2)}` : "Not set"}</span>
              </p>
            </div>
          ))}
        </div>

        {filteredItemCount > 0 ? (
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <p>Page {filters.page} of {filters.totalPages}</p>
            <div className="flex gap-3">
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
