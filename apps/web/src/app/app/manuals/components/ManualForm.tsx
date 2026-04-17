"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  formatManualDocumentType,
  formatManualSystemCategory,
  manualDocumentTypes,
  manualSearchableTextStatuses,
  manualSystemCategories
} from "@testworx/lib";

type ManualActionState = {
  error: string | null;
  success: string | null;
  redirectTo: string | null;
};

const initialManualActionState: ManualActionState = {
  error: null,
  success: null,
  redirectTo: null
};

type ManualFormValues = {
  manualId?: string;
  title?: string | null;
  manufacturer?: string | null;
  systemCategory?: string | null;
  productFamily?: string | null;
  model?: string | null;
  documentType?: string | null;
  revisionLabel?: string | null;
  revisionDate?: string | null;
  description?: string | null;
  notes?: string | null;
  tags?: string[];
  source?: string | null;
  isActive?: boolean;
  isOfflineEligible?: boolean;
  searchableTextStatus?: string | null;
  searchableText?: string | null;
  supersedesManualId?: string | null;
};

export function ManualForm({
  action,
  values,
  heading,
  submitLabel
}: {
  action: (state: ManualActionState, formData: FormData) => Promise<ManualActionState>;
  values?: ManualFormValues;
  heading: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialManualActionState);

  useEffect(() => {
    if (state.redirectTo) {
      router.push(state.redirectTo);
      router.refresh();
    }
  }, [router, state.redirectTo]);

  return (
    <form action={formAction} className="space-y-5 rounded-[28px] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-5 shadow-[0_16px_38px_rgba(15,23,42,0.06)] lg:p-6">
      {values?.manualId ? <input name="manualId" type="hidden" value={values.manualId} /> : null}
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{heading}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Upload the document, add clean metadata, and keep the field team focused on the right manual instead of raw files.</p>
      </div>

      {state.error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</p> : null}
      {state.success ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{state.success}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">Title</span>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.title ?? ""} name="title" required />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">Manufacturer</span>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.manufacturer ?? ""} name="manufacturer" required />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">System category</span>
          <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.systemCategory ?? "wet_chemical"} name="systemCategory" required>
            {manualSystemCategories.map((item) => (
              <option key={item} value={item}>
                {formatManualSystemCategory(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">Document type</span>
          <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.documentType ?? "service"} name="documentType" required>
            {manualDocumentTypes.map((item) => (
              <option key={item} value={item}>
                {formatManualDocumentType(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">Product family</span>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.productFamily ?? ""} name="productFamily" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">Model</span>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.model ?? ""} name="model" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">Revision label</span>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.revisionLabel ?? ""} name="revisionLabel" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">Revision date</span>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.revisionDate ?? ""} name="revisionDate" type="date" />
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-600">Description</span>
        <textarea className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.description ?? ""} name="description" />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-600">Notes</span>
        <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.notes ?? ""} name="notes" />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">Tags</span>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.tags?.join(", ") ?? ""} name="tags" placeholder="service, troubleshooting, nozzle chart" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">Source</span>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.source ?? ""} name="source" placeholder="Manufacturer portal" />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-slate-600">PDF file</span>
          <input accept="application/pdf" className="w-full rounded-2xl border border-slate-200 px-4 py-3" name="file" type="file" />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-600">Searchable text status</span>
          <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.searchableTextStatus ?? "not_requested"} name="searchableTextStatus">
            {manualSearchableTextStatuses.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 md:self-end">
          <input defaultChecked={values?.isActive ?? true} name="isActive" type="checkbox" />
          Manual is active
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input defaultChecked={values?.isOfflineEligible ?? false} name="isOfflineEligible" type="checkbox" />
          Eligible for offline save
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-600">Searchable text</span>
        <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={values?.searchableText ?? ""} name="searchableText" />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">PDF upload is optional on edit. Leave it blank to keep the current file.</p>
        <button className="rounded-2xl bg-[var(--tenant-primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
