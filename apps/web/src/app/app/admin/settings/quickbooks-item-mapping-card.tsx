type QuickBooksItemMappingCardProps = {
  configured: boolean;
  connected: boolean;
  reconnectRequired: boolean;
  modeMismatch: boolean;
  rows: Array<{
    internalCode: string;
    internalName: string;
    status: "mapped" | "unmapped" | "inactive_in_quickbooks";
    currentMapping: {
      qbItemId: string;
      qbItemName: string;
      qbItemType: string | null;
      matchSource: string;
      qbActive: boolean;
    } | null;
    suggestions: Array<{
      qbItemId: string;
      qbItemName: string;
      score: number;
    }>;
  }>;
  availableItems: Array<{
    qbItemId: string;
    qbItemName: string;
    qbItemType: string | null;
    qbActive: boolean;
  }>;
  saveMappingAction: (formData: FormData) => Promise<void>;
  clearMappingAction: (formData: FormData) => Promise<void>;
  resyncAction: () => Promise<void>;
  notice?: string | null;
};

function statusClasses(status: QuickBooksItemMappingCardProps["rows"][number]["status"]) {
  if (status === "mapped") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "inactive_in_quickbooks") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-rose-50 text-rose-700";
}

function statusLabel(status: QuickBooksItemMappingCardProps["rows"][number]["status"]) {
  if (status === "mapped") {
    return "Mapped";
  }

  if (status === "inactive_in_quickbooks") {
    return "Inactive in QuickBooks";
  }

  return "Unmapped";
}

export function QuickBooksItemMappingCard({
  configured,
  connected,
  reconnectRequired,
  modeMismatch,
  rows,
  availableItems,
  saveMappingAction,
  clearMappingAction,
  resyncAction,
  notice
}: QuickBooksItemMappingCardProps) {
  const canManageMappings = configured && connected && !reconnectRequired && !modeMismatch;

  return (
    <div className="space-y-6 rounded-[2rem] bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">QuickBooks item mappings</p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">Map billable codes to QuickBooks items</h3>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Exports now use stored QuickBooks item ids instead of guessing by name. Review unmapped or inactive codes here, then save the correct QuickBooks item once.
          </p>
        </div>
        <form action={resyncAction}>
          <button
            className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-60"
            disabled={!canManageMappings}
            type="submit"
          >
            Resync QuickBooks items
          </button>
        </form>
      </div>

      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-ink">Mapping workflow</p>
        <p className="mt-2">
          TradeWorx matches billing codes to cached QuickBooks products and services, then sends invoice lines using the QuickBooks item id. If an item becomes inactive, export is blocked until it is remapped.
        </p>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slateblue">
          {notice}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
          No billable codes have been generated yet. Create billing-ready inspections first, then return here to manage QuickBooks item mappings.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.internalCode} className="rounded-[1.5rem] border border-slate-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-ink">{row.internalName}</p>
                  <p className="mt-1 break-all text-xs uppercase tracking-[0.16em] text-slate-500">{row.internalCode}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusClasses(row.status)}`}>
                  {statusLabel(row.status)}
                </span>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-ink">Current QuickBooks item</p>
                  {row.currentMapping ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <p className="font-medium text-ink">{row.currentMapping.qbItemName}</p>
                      <p>ID: {row.currentMapping.qbItemId}</p>
                      <p>Type: {row.currentMapping.qbItemType ?? "Unknown"}</p>
                      <p>Match source: {row.currentMapping.matchSource}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No QuickBooks item is currently mapped for this billing code.</p>
                  )}

                  {row.currentMapping ? (
                    <form action={clearMappingAction} className="mt-4">
                      <input name="internalCode" type="hidden" value={row.internalCode} />
                      <button className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700" type="submit">
                        Clear mapping
                      </button>
                    </form>
                  ) : null}
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-ink">Suggested QuickBooks items</p>
                  {row.suggestions.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No strong suggestions yet. Resync the QuickBooks item cache or create a matching QuickBooks service item first.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {row.suggestions.map((suggestion) => (
                        <form key={suggestion.qbItemId} action={saveMappingAction} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                          <input name="internalCode" type="hidden" value={row.internalCode} />
                          <input name="internalName" type="hidden" value={row.internalName} />
                          <input name="qbItemId" type="hidden" value={suggestion.qbItemId} />
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{suggestion.qbItemName}</p>
                            <p className="mt-1 break-all text-xs text-slate-500">ID {suggestion.qbItemId} • Score {suggestion.score}</p>
                          </div>
                          <button
                            className="pressable pressable-filled inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                            disabled={!canManageMappings}
                            type="submit"
                          >
                            Use this item
                          </button>
                        </form>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <p className="text-sm font-semibold text-ink">Manually map an item</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Choose any active QuickBooks product or service from your synced cache when suggestions are missing or not the right match.
                    </p>
                    <form action={saveMappingAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                      <input name="internalCode" type="hidden" value={row.internalCode} />
                      <input name="internalName" type="hidden" value={row.internalName} />
                      <div className="min-w-0 flex-1">
                        <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`manual-map-${row.internalCode}`}>
                          QuickBooks item
                        </label>
                        <select
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                          defaultValue={row.currentMapping?.qbItemId ?? ""}
                          id={`manual-map-${row.internalCode}`}
                          name="qbItemId"
                        >
                          <option value="">Select a QuickBooks item</option>
                          {availableItems.map((item) => (
                            <option key={item.qbItemId} value={item.qbItemId}>
                              {item.qbItemName}{item.qbItemType ? ` (${item.qbItemType})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="pressable pressable-filled inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                        disabled={!canManageMappings || availableItems.length === 0}
                        type="submit"
                      >
                        Save manual mapping
                      </button>
                    </form>
                    {availableItems.length === 0 ? (
                      <p className="mt-2 text-sm text-amber-700">No active QuickBooks items are cached yet. Resync QuickBooks items first.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
