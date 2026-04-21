"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

export function InspectionPdfUploadCard({
  inspectionId,
  attachments,
  tenantStoragePrefix
}: {
  inspectionId: string;
  tenantStoragePrefix: string;
  attachments: Array<{ id: string; fileName: string; source: "uploaded" | "generated"; customerVisible: boolean; createdAt: Date }>;
}) {
  const router = useRouter();
  const [isUploading, startUploadTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const files = formData.getAll("attachment").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) {
      setError("Select at least one PDF to upload.");
      return;
    }

    startUploadTransition(() => {
      void (async () => {
        try {
          const uploadResults = await Promise.all(files.map(async (file) => {
            const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "inspection.pdf";
            const uploaded = await upload(
              `${tenantStoragePrefix}/uploaded-pdf/${inspectionId}-${Date.now()}-${safeName}`,
              file,
              {
                access: "private",
                handleUploadUrl: `/api/inspections/${inspectionId}/attachments/blob`
              }
            );

            return {
              pathname: uploaded.pathname,
              fileName: file.name,
              mimeType: file.type || uploaded.contentType || "application/pdf"
            };
          }));

          const metadataFormData = new FormData();
          if (formData.get("customerVisible") === "on") {
            metadataFormData.set("customerVisible", "on");
          }
          for (const uploaded of uploadResults) {
            metadataFormData.append("uploadedBlobPathname", uploaded.pathname);
            metadataFormData.append("uploadedFileName", uploaded.fileName);
            metadataFormData.append("uploadedMimeType", uploaded.mimeType);
          }

          const response = await fetch(`/api/inspections/${inspectionId}/attachments/upload`, {
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

          setSuccess(payload.success ?? (files.length === 1 ? `${files[0]!.name} uploaded.` : `${files.length} PDFs uploaded.`));
          router.refresh();
          form.reset();
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "Unable to upload PDF.");
        }
      })();
    });
  }

  return (
    <div className="space-y-5 rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">PDF delivery</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">Inspection attachments</h3>
        <p className="mt-2 text-sm text-slate-500">Upload customer-ready PDFs and keep generated report packets alongside inspection records.</p>
      </div>
      <form className="space-y-4 rounded-[1.5rem] border border-slate-200 p-4" onSubmit={handleSubmit}>
        <input name="inspectionId" type="hidden" value={inspectionId} />
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="attachment">Upload PDF files</label>
          <input accept="application/pdf" className="block w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" id="attachment" multiple name="attachment" type="file" />
          <p className="mt-2 text-xs text-slate-500">You can select and upload multiple PDFs at once.</p>
        </div>
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <input className="h-5 w-5 rounded border-slate-300" defaultChecked name="customerVisible" type="checkbox" />
          Make this PDF visible in the customer portal
        </label>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
        <button className="w-full rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60" disabled={isUploading} type="submit">
          {isUploading ? "Uploading PDFs..." : "Upload PDFs"}
        </button>
      </form>
      <div className="space-y-3">
        {attachments.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No PDFs attached yet.</p>
        ) : (
          attachments.map((attachment) => (
            <div key={attachment.id} className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-ink">{attachment.fileName}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {attachment.source === "generated" ? "Generated report packet" : "Uploaded attachment"} • {attachment.customerVisible ? "Visible to customer" : "Internal only"}
                </p>
              </div>
              <a className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/api/attachments/${attachment.id}`}>
                Download PDF
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
