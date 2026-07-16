"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useState } from "react";

import { SearchInput } from "@/app/search-input";

export function DashboardGlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function applySearch() {
    const trimmedQuery = query.trim();
    const target = trimmedQuery
      ? `/app/admin/inspections?q=${encodeURIComponent(trimmedQuery)}`
      : "/app/admin/inspections";

    router.push(target);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      applySearch();
      return;
    }

    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  }

  return (
    <SearchInput
      aria-label="Search inspections, reports, and customers"
      className="w-full min-w-0 flex-1 sm:min-w-[280px] lg:max-w-[420px]"
      onChange={(event) => setQuery(event.target.value)}
      onClear={() => setQuery("")}
      onKeyDown={handleKeyDown}
      placeholder="Search inspections, reports, customers"
      value={query}
    />
  );
}
