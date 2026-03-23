"use client";

import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

export function CustomerSiteImportCard({
  action,
  templateHref
}: {
  action: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
  templateHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="space-y-5 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Client import</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Import customers, sites, and assets</h3>
        <p className="mt-2 text-sm text-slate-500">Upload a CSV to create or update customer companies, sites, and optional asset records for this tenant.</p>
      </div>
      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-semibold text-ink">Start with the template</p>
        <p className="mt-2">Use the provided CSV headers so the import can map your customer list cleanly, and add asset columns only when you are ready to bring equipment records over too.</p>
        <a className="mt-3 inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slateblue" download="tradeworx-customer-site-import-template.csv" href={templateHref}>
          Download CSV template
        </a>
      </div>
      <form action={formAction} className="space-y-4 rounded-[1.5rem] border border-slate-200 p-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="csvFile">Customer/site/asset CSV</label>
          <input accept=".csv,text/csv" className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" id="csvFile" name="csvFile" type="file" />
        </div>
        {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
        <button className="w-full rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Importing CSV..." : "Import CSV"}
        </button>
      </form>
    </div>
  );
}
