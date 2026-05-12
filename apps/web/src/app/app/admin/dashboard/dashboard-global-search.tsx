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
      className="min-w-[280px] flex-1"
      onChange={(event) => setQuery(event.target.value)}
      onClear={() => setQuery("")}
      onKeyDown={handleKeyDown}
      placeholder="Search inspections, reports, customers"
      value={query}
    />
  );
}
