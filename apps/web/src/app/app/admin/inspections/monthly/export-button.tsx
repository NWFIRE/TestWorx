"use client";
import { monthlyInspectionCsv } from "./csv";

export function MonthlyExportButton({ rows, month, timezone, disabled = false }: { rows: { id: string; values: string[] }[]; month: string; timezone: string; disabled?: boolean }) {
  function download() {
    const url = URL.createObjectURL(new Blob([monthlyInspectionCsv(rows, timezone)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `inspections-${month}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <button type="button" onClick={download} disabled={disabled} className="rounded-xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50">Download CSV</button>;
}
