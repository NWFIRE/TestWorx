"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchSelect, type SearchSelectOption } from "@/app/search-select";

type MatchCandidate = {
  catalogItemId: string;
  quickbooksItemId: string;
  name: string;
  sku: string | null;
  itemType: string;
  description: string | null;
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
  hasSearched: boolean;
};

type ActionState = { error: string | null; success: string | null };

const initialSearchState: SearchState = {
  error: null,
  query: "",
  results: [],
  pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 20 },
  hasSearched: false
};

const initialActionState: ActionState = { error: null, success: null };
const LIVE_SEARCH_DEBOUNCE_MS = 250;

function confidenceLabel(confidence: number) {
  if (confidence >= 0.96) {
    return "High confidence";
  }

  if (confidence >= 0.8) {
    return "Suggested";
  }

  return "Possible match";
}

function formatItemType(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatMatchMethod(value: string) {
  if (value === "source_mapping") {
    return "saved mapping";
  }
  if (value === "catalog_search") {
    return "catalog search";
  }
  return value.replaceAll("_", " ");
}

function buildCatalogOptionSecondaryLabel(candidate: MatchCandidate) {
  return [
    formatItemType(candidate.itemType),
    candidate.description,
    candidate.sku ? `SKU ${candidate.sku}` : null,
    candidate.unitPrice !== null ? `$${candidate.unitPrice.toFixed(2)}` : null,
    candidate.quickbooksItemId ? `QB ${candidate.quickbooksItemId}` : null,
    candidate.quickbooksItemId ? "QuickBooks mapped" : "No QuickBooks mapping"
  ].filter(Boolean).join(" | ");
}

export function BillingItemMatchPanel({
  summaryId,
  inspectionId,
  itemId,
  itemIds,
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
  itemIds?: string[];
  itemDescription: string;
  currentMatch: MatchCandidate | null;
  suggestedMatches: MatchCandidate[];
  searchAction: (_: SearchState, formData: FormData) => Promise<SearchState>;
  linkAction: (_: ActionState, formData: FormData) => Promise<ActionState>;
  clearAction: (_: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchState, searchFormAction, searchPending] = useActionState(searchAction, {
    ...initialSearchState,
    query: itemDescription
  });
  const [linkState, linkFormAction] = useActionState(linkAction, initialActionState);
  const [clearState, clearFormAction] = useActionState(clearAction, initialActionState);
  const [searchQuery, setSearchQuery] = useState(itemDescription);

  useEffect(() => {
    if (linkState.success || clearState.success) {
      router.refresh();
    }
  }, [clearState.success, linkState.success, router]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const formData = new FormData();
      formData.set("summaryId", summaryId);
      formData.set("itemId", itemId);
      for (const candidateId of itemIds ?? []) {
        formData.append("itemIds", candidateId);
      }
      formData.set("searchNonce", String(Date.now()));
      formData.set("query", searchQuery || itemDescription);
      formData.set("page", "1");
      searchFormAction(formData);
    }, LIVE_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [itemDescription, itemId, itemIds, open, searchFormAction, searchQuery, summaryId]);

  const results = useMemo(() => {
    if (searchState.hasSearched) {
      return searchState.results;
    }

    return suggestedMatches;
  }, [searchState.hasSearched, searchState.results, suggestedMatches]);
  const matchOptions = useMemo<SearchSelectOption[]>(
    () => results.map((candidate) => ({
      value: candidate.catalogItemId,
      label: candidate.name,
      secondaryLabel: buildCatalogOptionSecondaryLabel(candidate),
      badge: candidate.autoMatchEligible ? "Recommended" : candidate.quickbooksItemId ? "QB mapped" : "Unmapped"
    })),
    [results]
  );
  const activeMatch = currentMatch;

  function linkCandidate(catalogItemId: string) {
    if (!catalogItemId) {
      return;
    }

    const formData = new FormData();
    formData.set("summaryId", summaryId);
    formData.set("inspectionId", inspectionId);
    formData.set("itemId", itemId);
    for (const candidateId of itemIds ?? []) {
      formData.append("itemIds", candidateId);
    }
    formData.set("catalogItemId", catalogItemId);
    formData.set("alias", itemDescription);
    formData.set("saveMapping", "on");
    linkFormAction(formData);
  }

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
          <span className="min-w-0 break-words text-xs text-slate-500">
            {formatItemType(activeMatch.itemType)}
            {activeMatch.unitPrice !== null ? ` | $${activeMatch.unitPrice.toFixed(2)}` : ""}
            {` | ${activeMatch.quickbooksItemId ? "QuickBooks mapped" : "No QuickBooks mapping"}`}
            {` | ${confidenceLabel(activeMatch.confidence)} via ${formatMatchMethod(activeMatch.matchMethod)}`}
          </span>
        ) : suggestedMatches[0] ? (
          <span className="min-w-0 break-words text-xs text-slate-500">
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
          <SearchSelect
            customValue={activeMatch?.name ?? ""}
            emptyText={searchState.hasSearched
              ? "No active parts or services matched that search."
              : "Start typing to search the full active parts and services catalog."}
            label="Parts / services catalog item"
            loading={searchPending}
            onChange={(catalogItemId) => linkCandidate(catalogItemId)}
            onQueryChange={setSearchQuery}
            options={matchOptions}
            placeholder="Search by item, description, SKU, category, or QuickBooks id"
            value={activeMatch?.catalogItemId ?? ""}
          />
          <p className="text-xs leading-5 text-slate-500">
            Search covers the active TradeWorx parts/services catalog. Unmatched lines are allowed, but QuickBooks sync works best when every billable line is mapped.
          </p>

          {searchState.error ? <p className="text-sm text-rose-600">{searchState.error}</p> : null}
          {linkState.error ? <p className="text-sm text-rose-600">{linkState.error}</p> : null}
          {linkState.success ? <p className="text-sm text-emerald-600">{linkState.success}</p> : null}
          {clearState.error ? <p className="text-sm text-rose-600">{clearState.error}</p> : null}
          {clearState.success ? <p className="text-sm text-emerald-600">{clearState.success}</p> : null}

          {activeMatch ? (
            <form action={clearFormAction}>
              <input name="summaryId" type="hidden" value={summaryId} />
              <input name="inspectionId" type="hidden" value={inspectionId} />
              <input name="itemId" type="hidden" value={itemId} />
              {(itemIds ?? []).map((candidateId) => (
                <input key={candidateId} name="itemIds" type="hidden" value={candidateId} />
              ))}
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
