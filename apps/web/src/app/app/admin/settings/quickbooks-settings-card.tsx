"use client";

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
  syncCustomersAction,
  importCustomersAction,
  importCatalogAction,
  hasStoredConnection,
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
  syncCustomersAction: () => Promise<void>;
  importCustomersAction: () => Promise<void>;
  importCatalogAction: () => Promise<void>;
  hasStoredConnection: boolean;
  notice?: string | null;
  supportReference?: {
    intuitTid: string | null;
    message: string | null;
    action: string;
    createdAt: Date;
  } | null;
}) {
  const canImportCatalog = connected && !modeMismatch && !reconnectRequired;
  const showDisconnectAction = hasStoredConnection;

  return (
    <div className="rounded-[2rem] bg-white p-6 shadow-panel">
      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">QuickBooks Online</p>
      <h3 className="mt-2 text-2xl font-semibold text-ink">Invoice sync</h3>
      <p className="mt-2 text-sm text-slate-500">Connect QuickBooks Online so customer companies can be reconciled between QuickBooks and TradeWorx, TradeWorx customer imports can be pushed into QuickBooks, and finalized billing summaries can be pushed into accounting as invoices from the billing review screen.</p>

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
          <form action={syncCustomersAction}>
            <button className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={!canImportCatalog} type="submit">
              Sync Customers
            </button>
          </form>
        ) : null}
        {connected ? (
          <form action={importCustomersAction}>
            <button className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={!canImportCatalog} type="submit">
              Import Customers Only
            </button>
          </form>
        ) : null}
        {connected ? (
          <form action={importCatalogAction}>
            <button className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={!canImportCatalog} type="submit">
              Import Products and Services
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
    </div>
  );
}
