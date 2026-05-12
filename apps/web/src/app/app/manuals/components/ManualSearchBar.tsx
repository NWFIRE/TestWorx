"use client";

import { LiveUrlSearchInput } from "@/app/live-url-search-input";

export function ManualSearchBar({
  query
}: {
  query?: string;
}) {
  return (
    <LiveUrlSearchInput
      className="block flex-1"
      initialValue={query ?? ""}
      name="query"
      paramKey="query"
      placeholder="Search by title, manufacturer, model, or tag"
    />
  );
}
