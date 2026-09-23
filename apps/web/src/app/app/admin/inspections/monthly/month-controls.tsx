"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MonthlyExportButton } from "./export-button";

export function MonthlyInspectionControls({ month, rows, timezone }: { month: string; rows: { id: string; values: string[] }[]; timezone: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [pending, startTransition] = useTransition();
  useEffect(() => { setSelectedMonth(month); }, [month]);
  const valid = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(selectedMonth);
  const changing = pending || selectedMonth !== month;

  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <label className="text-sm font-medium">Month<input type="month" name="month" required min="1900-01" max="2199-12" value={selectedMonth} className="mt-2 block rounded-xl border border-slate-200 p-3" onChange={event => {
        const nextMonth = event.target.value;
        setSelectedMonth(nextMonth);
        if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(nextMonth) || (nextMonth === month && !changing)) return;
        const next = new URLSearchParams(params.toString());
        next.set("month", nextMonth);
        startTransition(() => { router.push(`${pathname}?${next.toString()}`, { scroll: false }); });
      }} /></label>
      <p role="status" className="mt-2 text-sm text-slate-500">{!valid ? "Select a valid month." : changing ? "Loading selected month..." : "Month changes apply automatically."}</p>
    </div>
    <MonthlyExportButton month={month} rows={rows} timezone={timezone} disabled={changing || !valid} />
  </div>;
}
