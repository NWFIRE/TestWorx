"use client";

import { LiveUrlSearchInput } from "@/app/live-url-search-input";
import { LiveUrlSelectFilter } from "@/app/live-url-select-filter";

export function ReadyToBillFilters({ initialMonth, initialQuery, monthOptions }: {
  initialMonth: string;
  initialQuery: string;
  monthOptions: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.32fr)]">
      <LiveUrlSearchInput
        initialValue={initialQuery}
        paramKey="q"
        placeholder="Search customer, inspection, site, technician, or report type"
      />
      <LiveUrlSelectFilter paramKey="month" value={initialMonth} options={monthOptions} resetPageKeys={[]} />
    </div>
  );
}
