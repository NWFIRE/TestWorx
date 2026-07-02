"use client";

import { useRef, useState, useTransition } from "react";
import type { DragEvent } from "react";
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

const MAX_INSPECTION_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_INSPECTION_DOCUMENT_UPLOAD_LABEL = "50 MB";

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileSelectionKey(file: File) {
  return `${file.name.toLowerCase()}-${file.size}-${file.lastModified}`;
}

function sanitizePathSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

function normalizeUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/file is too large|file length cannot be greater|maximumSizeInBytes/i.test(message)) {
    return `This PDF is too large. Upload PDFs up to ${MAX_INSPECTION_DOCUMENT_UPLOAD_LABEL}, or compress/split the file and try again.`;
  }
  return message || "Unable to upload PDF.";
}

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function addSelectedFiles(nextFiles: File[]) {
    setError(null);
    setSuccess(null);

    if (nextFiles.length === 0) {
      return;
    }

    const nonPdfFile = nextFiles.find((file) => !isPdfFile(file));
    if (nonPdfFile) {
      setError(`${nonPdfFile.name} is not a PDF. Upload PDF files only.`);
      return;
    }

    const oversizedFile = nextFiles.find((file) => file.size > MAX_INSPECTION_DOCUMENT_UPLOAD_BYTES);
    if (oversizedFile) {
      setError(`${oversizedFile.name} is ${formatFileSize(oversizedFile.size)}. Upload PDFs up to ${MAX_INSPECTION_DOCUMENT_UPLOAD_LABEL}, or compress/split the file and try again.`);
      return;
    }

    setSelectedFiles((currentFiles) => {
      const existingKeys = new Set(currentFiles.map(fileSelectionKey));
      const uniqueFiles = nextFiles.filter((file) => !existingKeys.has(fileSelectionKey(file)));
      if (uniqueFiles.length === 0) {
        setError("Those PDFs are already selected.");
        return currentFiles;
      }
      return [...currentFiles, ...uniqueFiles];
    });
  }

  function handleDragEnter(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current += 1;
    setIsDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setIsDragActive(false);
    addSelectedFiles(Array.from(event.dataTransfer.files));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const formFiles = formData.getAll("document").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const files = selectedFiles.length > 0 ? selectedFiles : formFiles;
    if (files.length === 0) {
      setError("Select at least one PDF to upload.");
      return;
    }
    const nonPdfFile = files.find((file) => !isPdfFile(file));
    if (nonPdfFile) {
      setError(`${nonPdfFile.name} is not a PDF. Upload PDF files only.`);
      return;
    }
    const oversizedFile = files.find((file) => file.size > MAX_INSPECTION_DOCUMENT_UPLOAD_BYTES);
    if (oversizedFile) {
      setError(`${oversizedFile.name} is ${formatFileSize(oversizedFile.size)}. Upload PDFs up to ${MAX_INSPECTION_DOCUMENT_UPLOAD_LABEL}, or compress/split the file and try again.`);
      return;
    }

    startUploadTransition(() => {
      void (async () => {
        try {
          const uploadStartedAt = Date.now();
          const safeInspectionId = sanitizePathSegment(inspectionId);
          const uploadResults = [];

          for (const [index, file] of files.entries()) {
            const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "inspection-document.pdf";
            const uploaded = await upload(
              `${tenantStoragePrefix}/inspection-document-original/${safeInspectionId}-${uploadStartedAt}-${index}-${safeName}`,
              file,
              {
                access: "private",
                handleUploadUrl: `/api/inspections/${inspectionId}/documents/blob`
              }
            );

            uploadResults.push({
              pathname: uploaded.pathname,
              fileName: file.name,
              mimeType: file.type || uploaded.contentType || "application/pdf"
            });
          }

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
          for (const uploaded of uploadResults) {
            metadataFormData.append("uploadedBlobPathname", uploaded.pathname);
            metadataFormData.append("uploadedFileName", uploaded.fileName);
            metadataFormData.append("uploadedMimeType", uploaded.mimeType);
          }

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

          setSuccess(payload.success ?? (files.length === 1 ? `${files[0]!.name} uploaded.` : `${files.length} PDFs uploaded.`));
          router.refresh();
          form.reset();
          setSelectedFiles([]);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        } catch (submitError) {
          setError(normalizeUploadError(submitError));
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
          <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" id="label" name="label" placeholder="Used when uploading a single PDF" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="document">Upload PDF files</label>
          <button
            aria-describedby="document-upload-help"
            className={`flex w-full flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-center transition ${
              isDragActive
                ? "border-slateblue bg-blue-50 text-slateblue"
                : "border-slate-300 bg-slate-50/70 text-slate-600 hover:border-slateblue hover:bg-blue-50/60"
            }`}
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            type="button"
          >
            <span className="text-sm font-semibold text-ink">Drag and drop PDF files here, or click to browse.</span>
            <span className="mt-1 text-xs text-slate-500">PDF only. Maximum {MAX_INSPECTION_DOCUMENT_UPLOAD_LABEL} per PDF.</span>
            {selectedFiles.length > 0 ? (
              <span className="mt-3 text-xs font-semibold text-slateblue">
                {selectedFiles.length === 1 ? selectedFiles[0]!.name : `${selectedFiles.length} PDFs selected`}
              </span>
            ) : null}
          </button>
          <input
            accept="application/pdf"
            className="sr-only"
            id="document"
            multiple
            name="document"
            onChange={(event) => addSelectedFiles(Array.from(event.currentTarget.files ?? []))}
            ref={fileInputRef}
            type="file"
          />
          <p className="mt-2 text-xs text-slate-500" id="document-upload-help">You can select or drop multiple PDFs at once.</p>
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
          {isUploading ? "Uploading PDFs..." : "Attach external PDFs"}
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
                <a
                  className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
                  href={`/api/inspection-documents/${document.id}?variant=original`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View original
                </a>
                {document.annotatedStorageKey ? (
                  <a
                    className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
                    href={`/api/inspection-documents/${document.id}?variant=annotated`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View annotated
                  </a>
                ) : null}
                {document.signedStorageKey ? (
                  <a
                    className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
                    href={`/api/inspection-documents/${document.id}?variant=signed`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
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
