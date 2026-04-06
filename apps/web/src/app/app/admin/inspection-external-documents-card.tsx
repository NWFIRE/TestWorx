"use client";

import { useActionState } from "react";

const initialState = { error: null as string | null, success: null as string | null };

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

const statusClasses: Record<string, string> = {
  UPLOADED: "bg-slate-100 text-slate-700",
  ANNOTATED: "bg-sky-50 text-sky-700",
  READY_FOR_SIGNATURE: "bg-amber-50 text-amber-800",
  SIGNED: "bg-emerald-50 text-emerald-700",
  EXPORTED: "bg-sky-50 text-sky-700"
};

export function InspectionExternalDocumentsCard({
  inspectionId,
  documents,
  action
}: {
  inspectionId: string;
  documents: Array<{
    id: string;
    fileName: string;
    label: string | null;
    requiresSignature: boolean;
    status: string;
    customerVisible: boolean;
    uploadedAt: string;
    annotatedAt: string | null;
    signedAt: string | null;
    annotatedStorageKey: string | null;
    signedStorageKey: string | null;
  }>;
  action: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <div className="space-y-5 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">External documents</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Customer PDFs</h3>
        <p className="mt-2 text-sm text-slate-500">Upload customer-provided PDFs, track signature status, and preserve the original and signed versions separately.</p>
      </div>
      <form action={formAction} className="space-y-4 rounded-[1.5rem] border border-slate-200 p-4">
        <input name="inspectionId" type="hidden" value={inspectionId} />
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="label">Document label</label>
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="label" name="label" placeholder="Customer service ticket, building form, etc." />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="document">Upload PDF</label>
          <input accept="application/pdf" className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" id="document" name="document" type="file" />
        </div>
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <input className="h-5 w-5 rounded border-slate-300" defaultChecked name="requiresSignature" type="checkbox" />
          Requires technician signature in the field
        </label>
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <input className="h-5 w-5 rounded border-slate-300" name="customerVisible" type="checkbox" />
          Make the signed document visible in the customer portal when available
        </label>
        {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
        <button className="w-full rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Uploading document..." : "Attach external PDF"}
        </button>
      </form>
      <div className="space-y-3">
        {documents.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No external documents attached yet.</p>
        ) : (
          documents.map((document) => (
            <div key={document.id} className="space-y-3 rounded-[1.5rem] border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink">{document.label || document.fileName}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusClasses[document.status] ?? statusClasses.UPLOADED}`}>
                  {statusLabel(document.status)}
                </span>
              </div>
              <p className="text-sm text-slate-500">
                {document.requiresSignature ? "Requires signature" : "Reference only"} | {document.customerVisible ? "Customer visible" : "Internal only"}
              </p>
              <p className="text-sm text-slate-500">
                Uploaded {new Date(document.uploadedAt).toLocaleString()}
                {document.annotatedAt ? ` | Annotated ${new Date(document.annotatedAt).toLocaleString()}` : ""}
                {document.signedAt ? ` | Signed ${new Date(document.signedAt).toLocaleString()}` : ""}
              </p>
              <div className="flex flex-wrap gap-3">
                <a className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/api/inspection-documents/${document.id}?variant=original`}>
                  View original
                </a>
                {document.annotatedStorageKey ? (
                  <a className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/api/inspection-documents/${document.id}?variant=annotated`}>
                    View annotated
                  </a>
                ) : null}
                {document.signedStorageKey ? (
                  <a className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/api/inspection-documents/${document.id}?variant=signed`}>
                    View signed
                  </a>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
