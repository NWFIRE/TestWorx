"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const initialState = { error: null as string | null, success: null as string | null };

export function CustomerSiteImportCard({
  templateHref
}: {
  templateHref: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState(initialState);

    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch("/api/admin/customer-import", {
            method: "POST",
            body: formData
          });
          const payload = (await response.json()) as { error?: string; success?: string };

          if (!response.ok) {
            throw new Error(payload.error ?? "Unable to import CSV.");
          }

          setState({ error: null, success: payload.success ?? "Import completed." });
          form.reset();
          router.refresh();
        } catch (submitError) {
          setState({
            error: submitError instanceof Error ? submitError.message : "Unable to import CSV.",
            success: null
          });
        }
      })();
    });
  }

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
      <form className="space-y-4 rounded-[1.5rem] border border-slate-200 p-4" onSubmit={handleSubmit}>
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
