"use client";

import { useActionState, useState } from "react";

type MatchCandidate = {
  catalogItemId: string;
  quickbooksItemId: string;
  name: string;
  sku: string | null;
  itemType: string;
  unitPrice: number | null;
  alias: string | null;
  confidence: number;
  matchMethod: string;
  autoMatchEligible: boolean;
};

type SearchState = {
  error: string | null;
  query: string;
  results: MatchCandidate[];
  pagination: { page: number; totalPages: number; totalCount: number; limit: number };
};

type ActionState = { error: string | null; success: string | null };

const initialSearchState: SearchState = {
  error: null,
  query: "",
  results: [],
  pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 8 }
};

const initialActionState: ActionState = { error: null, success: null };

function confidenceLabel(confidence: number) {
  if (confidence >= 0.96) {
    return "High confidence";
  }

  if (confidence >= 0.8) {
    return "Suggested";
  }

  return "Possible match";
}

export function BillingItemMatchPanel({
  summaryId,
  inspectionId,
  itemId,
  itemDescription,
  currentMatch,
  suggestedMatches,
  searchAction,
  linkAction,
  clearAction
}: {
  summaryId: string;
  inspectionId: string;
  itemId: string;
  itemDescription: string;
  currentMatch: MatchCandidate | null;
  suggestedMatches: MatchCandidate[];
  searchAction: (_: SearchState, formData: FormData) => Promise<SearchState>;
  linkAction: (_: ActionState, formData: FormData) => Promise<ActionState>;
  clearAction: (_: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [searchState, searchFormAction] = useActionState(searchAction, {
    ...initialSearchState,
    query: itemDescription
  });
  const [linkState, linkFormAction] = useActionState(linkAction, initialActionState);
  const [clearState, clearFormAction] = useActionState(clearAction, initialActionState);

  const results = searchState.results.length > 0 ? searchState.results : suggestedMatches;
  const activeMatch = currentMatch;

  return (
    <div className="mt-3 rounded-[1.25rem] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {activeMatch ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Linked to {activeMatch.name}
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Unmatched
          </span>
        )}
        {activeMatch ? (
          <span className="text-xs text-slate-500">
            {confidenceLabel(activeMatch.confidence)} via {activeMatch.matchMethod.replaceAll("_", " ")}
          </span>
        ) : suggestedMatches[0] ? (
          <span className="text-xs text-slate-500">
            Suggested: {suggestedMatches[0].name} ({confidenceLabel(suggestedMatches[0].confidence)})
          </span>
        ) : null}
        <button
          className="ml-auto text-sm font-semibold text-slateblue"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Hide matching" : activeMatch ? "Change match" : "Match item"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          <form action={searchFormAction} className="flex flex-col gap-3 sm:flex-row">
            <input name="summaryId" type="hidden" value={summaryId} />
            <input name="itemId" type="hidden" value={itemId} />
            <input
              className="min-h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              defaultValue={searchState.query || itemDescription}
              name="query"
              placeholder="Search products and services"
            />
            <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
              Search
            </button>
          </form>

          {searchState.error ? <p className="text-sm text-rose-600">{searchState.error}</p> : null}
          {linkState.error ? <p className="text-sm text-rose-600">{linkState.error}</p> : null}
          {linkState.success ? <p className="text-sm text-emerald-600">{linkState.success}</p> : null}
          {clearState.error ? <p className="text-sm text-rose-600">{clearState.error}</p> : null}
          {clearState.success ? <p className="text-sm text-emerald-600">{clearState.success}</p> : null}

          {results.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
              No suggested matches yet. Search for an existing product or service and confirm the best fit.
            </p>
          ) : (
            <div className="space-y-3">
              {results.map((candidate) => (
                <div key={candidate.catalogItemId} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink">{candidate.name}</p>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                          {confidenceLabel(candidate.confidence)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {candidate.itemType}
                        {candidate.sku ? ` | SKU ${candidate.sku}` : ""}
                        {candidate.unitPrice !== null ? ` | $${candidate.unitPrice.toFixed(2)}` : ""}
                      </p>
                      {candidate.alias ? <p className="mt-1 text-xs text-slate-500">Matched via alias: {candidate.alias}</p> : null}
                    </div>
                    <form action={linkFormAction} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:min-w-[260px]">
                      <input name="summaryId" type="hidden" value={summaryId} />
                      <input name="inspectionId" type="hidden" value={inspectionId} />
                      <input name="itemId" type="hidden" value={itemId} />
                      <input name="catalogItemId" type="hidden" value={candidate.catalogItemId} />
                      <input name="alias" type="hidden" value={itemDescription} />
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input className="h-4 w-4 rounded border-slate-300 text-slateblue focus:ring-slateblue" defaultChecked type="checkbox" name="saveMapping" />
                        Save this mapping for future matches
                      </label>
                      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white" type="submit">
                        Use this match
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeMatch ? (
            <form action={clearFormAction}>
              <input name="summaryId" type="hidden" value={summaryId} />
              <input name="inspectionId" type="hidden" value={inspectionId} />
              <input name="itemId" type="hidden" value={itemId} />
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700" type="submit">
                Clear match
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
