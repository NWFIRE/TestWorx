"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

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
  tenantStoragePrefix
}: {
  inspectionId: string;
  tenantStoragePrefix: string;
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
}) {
  const router = useRouter();
  const [isUploading, startUploadTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(event.currentTarget);
    const file = formData.get("document");
    if (!(file instanceof File) || file.size === 0) {
      setError("Select a PDF to upload.");
      return;
    }

    startUploadTransition(() => {
      void (async () => {
        try {
          const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "inspection-document.pdf";
          const uploaded = await upload(
            `${tenantStoragePrefix}/inspection-document-original/${inspectionId}-${Date.now()}-${safeName}`,
            file,
            {
              access: "private",
              handleUploadUrl: `/api/inspections/${inspectionId}/documents/blob`
            }
          );

          const metadataFormData = new FormData();
          const label = String(formData.get("label") ?? "").trim();
          if (label) {
            metadataFormData.set("label", label);
          }
          if (formData.get("requiresSignature") === "on") {
            metadataFormData.set("requiresSignature", "on");
          }
          if (formData.get("customerVisible") === "on") {
            metadataFormData.set("customerVisible", "on");
          }
          metadataFormData.set("uploadedBlobPathname", uploaded.pathname);
          metadataFormData.set("uploadedFileName", file.name);
          metadataFormData.set("uploadedMimeType", file.type || uploaded.contentType || "application/pdf");

          const response = await fetch(`/api/inspections/${inspectionId}/documents/upload`, {
            method: "POST",
            body: metadataFormData
          });
          const responseText = await response.text();
          const payload = responseText
            ? (() => {
                try {
                  return JSON.parse(responseText) as { error?: string; success?: string };
                } catch {
                  return { error: responseText };
                }
              })()
            : {};

          if (!response.ok) {
            throw new Error(payload.error ?? "Unable to upload PDF.");
          }

          setSuccess(payload.success ?? `${file.name} uploaded.`);
          router.refresh();
          event.currentTarget.reset();
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "Unable to upload PDF.");
        }
      })();
    });
  }

  return (
    <div className="space-y-5 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">External documents</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Customer PDFs</h3>
        <p className="mt-2 text-sm text-slate-500">Upload customer-provided PDFs, track signature status, and preserve the original and signed versions separately.</p>
      </div>
      <form className="space-y-4 rounded-[1.5rem] border border-slate-200 p-4" onSubmit={handleSubmit}>
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
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
        <button className="w-full rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={isUploading} type="submit">
          {isUploading ? "Uploading document..." : "Attach external PDF"}
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
