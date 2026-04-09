"use client";

import { useActionState, useEffect, useState } from "react";

type MappingRow = {
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
};

type ManualItemOption = {
  qbItemId: string;
  qbItemName: string;
  qbItemType: string | null;
  qbActive: boolean;
};

type SaveMappingState = {
  error: string | null;
  success: string | null;
  internalCode?: string | null;
  mapping?: {
    qbItemId: string;
    qbItemName: string;
    qbItemType: string | null;
    matchSource: string;
    qbActive: boolean;
  } | null;
};

type ClearMappingState = {
  error: string | null;
  success: string | null;
  internalCode?: string | null;
};

type QuickBooksItemMappingCardProps = {
  configured: boolean;
  connected: boolean;
  reconnectRequired: boolean;
  modeMismatch: boolean;
  rows: MappingRow[];
  availableItems: ManualItemOption[];
  saveMappingAction: (_: SaveMappingState, formData: FormData) => Promise<SaveMappingState>;
  clearMappingAction: (_: ClearMappingState, formData: FormData) => Promise<ClearMappingState>;
  resyncAction: () => Promise<void>;
  notice?: string | null;
};

const initialSaveState: SaveMappingState = {
  error: null,
  success: null,
  internalCode: null,
  mapping: null
};

const initialClearState: ClearMappingState = {
  error: null,
  success: null,
  internalCode: null
};

function statusClasses(status: MappingRow["status"]) {
  if (status === "mapped") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "inactive_in_quickbooks") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-rose-50 text-rose-700";
}

function statusLabel(status: MappingRow["status"]) {
  if (status === "mapped") {
    return "Mapped";
  }

  if (status === "inactive_in_quickbooks") {
    return "Inactive in QuickBooks";
  }

  return "Unmapped";
}

function buildMappedRow(
  row: MappingRow,
  mapping: NonNullable<SaveMappingState["mapping"]>
): MappingRow {
  return {
    ...row,
    status: mapping.qbActive ? "mapped" : "inactive_in_quickbooks",
    currentMapping: {
      qbItemId: mapping.qbItemId,
      qbItemName: mapping.qbItemName,
      qbItemType: mapping.qbItemType,
      matchSource: mapping.matchSource,
      qbActive: mapping.qbActive
    }
  };
}

function MappingRowCard({
  row,
  availableItems,
  canManageMappings,
  saveMappingAction,
  clearMappingAction,
  onRowMapped,
  onRowCleared,
  onNotice
}: {
  row: MappingRow;
  availableItems: ManualItemOption[];
  canManageMappings: boolean;
  saveMappingAction: QuickBooksItemMappingCardProps["saveMappingAction"];
  clearMappingAction: QuickBooksItemMappingCardProps["clearMappingAction"];
  onRowMapped: (internalCode: string, mapping: NonNullable<SaveMappingState["mapping"]>) => void;
  onRowCleared: (internalCode: string) => void;
  onNotice: (value: { error: string | null; success: string | null }) => void;
}) {
  const [selectedManualItemId, setSelectedManualItemId] = useState(row.currentMapping?.qbItemId ?? "");
  const [saveState, saveFormAction, savePending] = useActionState(saveMappingAction, initialSaveState);
  const [clearState, clearFormAction, clearPending] = useActionState(clearMappingAction, initialClearState);

  useEffect(() => {
    if (saveState.success && saveState.internalCode === row.internalCode && saveState.mapping) {
      onRowMapped(row.internalCode, saveState.mapping);
      onNotice({ error: null, success: saveState.success });
    }

    if (saveState.error && saveState.internalCode === row.internalCode) {
      onNotice({ error: saveState.error, success: null });
    }
  }, [onNotice, onRowMapped, row.internalCode, saveState]);

  useEffect(() => {
    if (clearState.success && clearState.internalCode === row.internalCode) {
      onRowCleared(row.internalCode);
      onNotice({ error: null, success: clearState.success });
    }

    if (clearState.error && clearState.internalCode === row.internalCode) {
      onNotice({ error: clearState.error, success: null });
    }
  }, [clearState, onNotice, onRowCleared, row.internalCode]);

  return (
    <div className="rounded-[1.5rem] border border-slate-200 p-5">
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
            <form action={clearFormAction} className="mt-4">
              <input name="internalCode" type="hidden" value={row.internalCode} />
              <button
                className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700"
                disabled={!canManageMappings || clearPending}
                type="submit"
              >
                {clearPending ? "Clearing..." : "Clear mapping"}
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
                <form key={suggestion.qbItemId} action={saveFormAction} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <input name="internalCode" type="hidden" value={row.internalCode} />
                  <input name="internalName" type="hidden" value={row.internalName} />
                  <input name="qbItemId" type="hidden" value={suggestion.qbItemId} />
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{suggestion.qbItemName}</p>
                    <p className="mt-1 break-all text-xs text-slate-500">ID {suggestion.qbItemId} | Score {suggestion.score}</p>
                  </div>
                  <button
                    className="pressable pressable-filled inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={!canManageMappings || savePending}
                    type="submit"
                  >
                    {savePending ? "Saving..." : "Use this item"}
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
            <form action={saveFormAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <input name="internalCode" type="hidden" value={row.internalCode} />
              <input name="internalName" type="hidden" value={row.internalName} />
              <div className="min-w-0 flex-1">
                <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor={`manual-map-${row.internalCode}`}>
                  QuickBooks item
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                  id={`manual-map-${row.internalCode}`}
                  name="qbItemId"
                  onChange={(event) => setSelectedManualItemId(event.target.value)}
                  value={selectedManualItemId}
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
                disabled={!canManageMappings || availableItems.length === 0 || !selectedManualItemId || savePending}
                type="submit"
              >
                {savePending ? "Saving..." : "Save manual mapping"}
              </button>
            </form>
            {availableItems.length === 0 ? (
              <p className="mt-2 text-sm text-amber-700">No active QuickBooks items are cached yet. Resync QuickBooks items first.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
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
  const [localRows, setLocalRows] = useState(rows);
  const [localNotice, setLocalNotice] = useState<{ error: string | null; success: string | null }>({
    error: null,
    success: notice ?? null
  });

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  useEffect(() => {
    setLocalNotice({ error: null, success: notice ?? null });
  }, [notice]);

  function handleRowMapped(internalCode: string, mapping: NonNullable<SaveMappingState["mapping"]>) {
    setLocalRows((current) =>
      current.map((row) => (row.internalCode === internalCode ? buildMappedRow(row, mapping) : row))
    );
  }

  function handleRowCleared(internalCode: string) {
    setLocalRows((current) =>
      current.map((row) =>
        row.internalCode === internalCode
          ? { ...row, status: "unmapped", currentMapping: null }
          : row
      )
    );
  }

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

      {localNotice.success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {localNotice.success}
        </div>
      ) : null}
      {localNotice.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {localNotice.error}
        </div>
      ) : null}

      {localRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
          No billable codes have been generated yet. Create billing-ready inspections first, then return here to manage QuickBooks item mappings.
        </p>
      ) : (
        <div className="space-y-4">
          {localRows.map((row) => (
            <MappingRowCard
              key={`${row.internalCode}:${row.currentMapping?.qbItemId ?? "none"}:${row.status}`}
              availableItems={availableItems}
              canManageMappings={canManageMappings}
              clearMappingAction={clearMappingAction}
              onNotice={setLocalNotice}
              onRowCleared={handleRowCleared}
              onRowMapped={handleRowMapped}
              row={row}
              saveMappingAction={saveMappingAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
