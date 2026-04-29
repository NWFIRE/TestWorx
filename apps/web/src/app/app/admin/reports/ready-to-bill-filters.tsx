"use client";

import Link from "next/link";
import { useState } from "react";

import { SearchSelect, type SearchSelectOption } from "@/app/search-select";

function buildReadyToBillHref(input: { month?: string; query?: string }) {
  const search = new URLSearchParams();
  if (input.month) {
    search.set("month", input.month);
  }
  if (input.query?.trim()) {
    search.set("q", input.query.trim());
  }

  const query = search.toString();
  return query ? `/app/admin/reports?${query}` : "/app/admin/reports";
}

export function ReadyToBillFilters({
  initialMonth,
  initialQuery,
  monthOptions,
  searchOptions
}: {
  initialMonth: string;
  initialQuery: string;
  monthOptions: Array<{ value: string; label: string }>;
  searchOptions: SearchSelectOption[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [month, setMonth] = useState(initialMonth);
  const selectedOptionValue = searchOptions.some((option) => option.value === query) ? query : "";

  return (
    <form action="/app/admin/reports" className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.32fr)_auto_auto]">
      <input name="q" type="hidden" value={query} />
      <SearchSelect
        allowCustomValue
        className="min-w-0"
        customValue={selectedOptionValue ? "" : query}
        emptyText="No matching ready-to-bill inspections found"
        onChange={(nextValue) => setQuery(nextValue)}
        onCustomValueChange={setQuery}
        onQueryChange={setQuery}
        options={searchOptions}
        placeholder="Search customer, inspection, site, technician, or report type"
        value={selectedOptionValue}
      />
      <select
        className="field-contrast h-12 rounded-2xl border bg-white px-4 text-sm outline-none"
        name="month"
        onChange={(event) => setMonth(event.target.value)}
        value={month}
      >
        {monthOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[color:var(--border-default)] bg-white px-4 py-3 text-sm font-semibold text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-subtle)]" type="submit">
        Apply filters
      </button>
      {initialQuery ? (
        <Link
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[color:var(--border-default)] bg-white px-4 py-3 text-sm font-semibold text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-subtle)]"
          href={buildReadyToBillHref({ month: initialMonth })}
        >
          Clear search
        </Link>
      ) : null}
    </form>
  );
}
