"use client";

import { buildBillingExportCsv, type BillingExportInput } from "@testworx/lib";

export function BillingExportButton(input: BillingExportInput) {
  return <button type="button" className="inline-flex min-h-11 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" onClick={() => {
    const url = URL.createObjectURL(new Blob([buildBillingExportCsv(input)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `billing-${input.inspectionId.replace(/[^a-zA-Z0-9_-]/g, "")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}>Export billing CSV</button>;
}
