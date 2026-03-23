"use client";

import { useActionState, useState } from "react";

import { SignaturePad } from "./signature-pad";

const initialState = { error: null as string | null, success: null as string | null };

const statusClasses: Record<string, string> = {
  UPLOADED: "bg-slate-100 text-slate-700",
  READY_FOR_SIGNATURE: "bg-amber-50 text-amber-800",
  SIGNED: "bg-emerald-50 text-emerald-700",
  EXPORTED: "bg-sky-50 text-sky-700"
};

export function ExternalDocumentSigner({
  inspectionId,
  document,
  action
}: {
  inspectionId: string;
  document: {
    id: string;
    label: string | null;
    fileName: string;
    requiresSignature: boolean;
    status: string;
    signedStorageKey: string | null;
  };
  action: (_: { error: string | null; success: string | null }, formData: FormData) => Promise<{ error: string | null; success: string | null }>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">External document</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-semibold text-ink">{document.label || document.fileName}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusClasses[document.status] ?? statusClasses.UPLOADED}`}>
            {document.status.replaceAll("_", " ")}
          </span>
        </div>
        <p className="mt-3 text-slate-500">Open the original PDF, capture the technician signature, and save a signed copy back to this inspection without changing the original document.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[2rem] bg-white p-6 shadow-panel">
          <div className="flex flex-wrap gap-3">
            <a className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/api/inspection-documents/${document.id}?variant=original&disposition=inline`} target="_blank">
              Open original PDF
            </a>
            {document.signedStorageKey ? (
              <a className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/api/inspection-documents/${document.id}?variant=signed&disposition=inline`} target="_blank">
                Open signed PDF
              </a>
            ) : null}
          </div>
          <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-slate-200">
            <iframe className="h-[65vh] w-full bg-slate-50" src={`/api/inspection-documents/${document.id}?variant=original&disposition=inline`} title={document.label || document.fileName} />
          </div>
        </div>

        <form action={formAction} className="space-y-4 rounded-[2rem] bg-white p-6 shadow-panel">
          <input name="inspectionId" type="hidden" value={inspectionId} />
          <input name="documentId" type="hidden" value={document.id} />
          <input name="signerName" type="hidden" value={signerName} />
          <input name="signatureDataUrl" type="hidden" value={signatureDataUrl ?? ""} />
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Signature workflow</p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">Capture technician signature</h3>
            <p className="mt-2 text-sm text-slate-500">The signed PDF is stored separately so the original customer-provided document remains preserved on the inspection.</p>
          </div>
          <SignaturePad
            disabled={pending || !document.requiresSignature}
            label="Technician signature"
            onChange={setSignatureDataUrl}
            onSignerNameChange={setSignerName}
            signerName={signerName}
            value={signatureDataUrl ?? undefined}
          />
          {!document.requiresSignature ? <p className="text-sm text-slate-500">This document was uploaded as reference-only and does not require a signature.</p> : null}
          {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
          <button
            className="w-full rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={pending || !document.requiresSignature || !signerName.trim() || !signatureDataUrl}
            type="submit"
          >
            {pending ? "Saving signed PDF..." : "Save signed PDF"}
          </button>
        </form>
      </div>
    </div>
  );
}
