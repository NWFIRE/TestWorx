"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { billingQueueStatusOptions, buildBillingQueueHref, type BillingQueueSort } from "@testworx/lib/billing-queue";
import { SearchInput } from "@/app/search-input";
import { SEARCH_DEBOUNCE_MS } from "@/app/search-behavior";

type Filters = { status: string; sort: BillingQueueSort; query: string };

export function BillingQueueFilters({ status, sort, query }: Filters) {
  const router = useRouter();
  const [filters, setFilters] = useState({ status, sort, query });
  const draft = useRef(filters);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitted = useRef(new Set<string>());
  const applied = useRef(buildBillingQueueHref(status, sort, query));
  const composing = useRef(false);
  const [pending, startTransition] = useTransition();

  function cancel() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => {
    const href = buildBillingQueueHref(status, sort, query);
    // Server responses to our own navigation must not overwrite newer input.
    if (submitted.current.delete(href)) return;
    cancel();
    applied.current = href;
    draft.current = { status, sort, query };
    setFilters(draft.current);
  }, [status, sort, query]);

  useEffect(() => {
    function restoreHistory() {
      cancel();
      submitted.current.clear();
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("status");
      const next = {
        status: billingQueueStatusOptions.some((option) => option.value === requested) ? requested! : "all",
        sort: (["oldest", "alphabetical"].includes(params.get("sort") ?? "") ? params.get("sort") : "newest") as BillingQueueSort,
        query: params.get("q") ?? ""
      };
      draft.current = next;
      applied.current = buildBillingQueueHref(next.status, next.sort, next.query);
      setFilters(next);
    }
    window.addEventListener("popstate", restoreHistory);
    return () => { cancel(); window.removeEventListener("popstate", restoreHistory); };
  }, []);

  function apply(next: Filters) {
    cancel();
    if (composing.current) return;
    const href = buildBillingQueueHref(next.status, next.sort, next.query);
    if (href === applied.current) return;
    applied.current = href;
    submitted.current.add(href);
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function update(patch: Partial<Filters>, immediate = true) {
    cancel();
    const next = { ...draft.current, ...patch };
    draft.current = next;
    setFilters(next);
    if (immediate) apply(next);
    else if (!composing.current) timer.current = setTimeout(() => apply(draft.current), SEARCH_DEBOUNCE_MS);
  }

  return <div className="space-y-3">
    <SearchInput value={filters.query} placeholder="Search customer, site, inspection, or invoice number"
      busy={pending} onChange={(event) => update({ query: event.target.value }, false)}
      onClear={() => update({ query: "" })}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Element && event.relatedTarget.closest("a[href]")) cancel();
        else apply(draft.current);
      }}
      onCompositionStart={() => { composing.current = true; cancel(); }}
      onCompositionEnd={(event) => { composing.current = false; update({ query: event.currentTarget.value }, false); }}
      onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); apply(draft.current); } }} />
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-wrap gap-2" aria-label="Billing queue status">
        {billingQueueStatusOptions.map((option) => <button key={option.value} type="button"
          aria-pressed={filters.status === option.value}
          onClick={() => update({ status: option.value })}
          className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold ${filters.status === option.value ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
          {option.label}
        </button>)}
      </div>
      <label className="w-full text-xs font-semibold text-slate-500 lg:w-56">Sort by
        <select className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900"
          value={filters.sort} onChange={(event) => update({ sort: event.target.value as BillingQueueSort })}>
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="alphabetical">Customer A-Z</option>
        </select>
      </label>
    </div>
    {filters.query || filters.status !== "all" || filters.sort !== "newest" ? <button type="button" className="text-sm font-semibold text-slate-600 underline" onClick={() => update({ query: "", status: "all", sort: "newest" })}>Clear filters</button> : null}
  </div>;
}
