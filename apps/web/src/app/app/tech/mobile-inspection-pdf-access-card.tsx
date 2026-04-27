"use client";

import Link from "next/link";

type MobileInspectionDocument = {
  id: string;
  label?: string | null;
  fileName: string;
  requiresSignature?: boolean | null;
  status?: string | null;
  annotatedStorageKey?: string | null;
  signedStorageKey?: string | null;
};

type MobileInspectionAttachment = {
  id: string;
  fileName: string;
  mimeType?: string | null;
};

function documentLabel(document: MobileInspectionDocument) {
  return document.label?.trim() || document.fileName;
}

function documentStatus(document: MobileInspectionDocument) {
  if (document.requiresSignature && document.status !== "SIGNED" && document.status !== "EXPORTED") {
    return "Needs signature";
  }

  if (document.status === "SIGNED" || document.status === "EXPORTED") {
    return "Signed";
  }

  if (document.status === "ANNOTATED" || document.annotatedStorageKey) {
    return "Annotated";
  }

  return "Attached";
}

function documentActionLabel(document: MobileInspectionDocument) {
  if (document.requiresSignature && document.status !== "SIGNED" && document.status !== "EXPORTED") {
    return "Review & sign";
  }

  return "Open PDF";
}

export function MobileInspectionPdfAccessCard({
  inspectionId,
  documents = [],
  attachments = []
}: {
  inspectionId: string;
  documents?: MobileInspectionDocument[];
  attachments?: MobileInspectionAttachment[];
}) {
  const pdfAttachments = attachments.filter((attachment) => !attachment.mimeType || attachment.mimeType === "application/pdf");
  const totalCount = documents.length + pdfAttachments.length;

  if (totalCount === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.35rem] border border-slate-200 bg-slate-50/90 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Attached PDFs</p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {totalCount === 1 ? "1 document available" : `${totalCount} documents available`}
          </p>
        </div>
        <span className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full bg-white px-3 text-sm font-semibold text-[var(--tenant-primary)] shadow-sm">
          {totalCount}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {documents.map((document) => (
          <div className="rounded-[1.1rem] border border-slate-200 bg-white p-3" key={`document-${document.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{documentLabel(document)}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{document.fileName}</p>
              </div>
              <span className="shrink-0 rounded-full border border-[color:var(--tenant-primary-border)] bg-[var(--tenant-primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--tenant-primary)]">
                {documentStatus(document)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                className="flex min-h-11 items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-3 py-2 text-center text-sm font-semibold text-[var(--tenant-primary-contrast)]"
                href={`/app/tech/inspections/${inspectionId}/documents/${document.id}`}
              >
                {documentActionLabel(document)}
              </Link>
              <a
                className="flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700"
                href={`/api/inspection-documents/${document.id}?variant=preferred&disposition=inline`}
              >
                Preview
              </a>
            </div>
          </div>
        ))}

        {pdfAttachments.map((attachment) => (
          <div className="rounded-[1.1rem] border border-slate-200 bg-white p-3" key={`attachment-${attachment.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{attachment.fileName}</p>
                <p className="mt-1 text-xs text-slate-500">PDF attachment</p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                Attached
              </span>
            </div>
            <a
              className="mt-3 flex min-h-11 items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-3 py-2 text-center text-sm font-semibold text-[var(--tenant-primary-contrast)]"
              href={`/api/attachments/${attachment.id}?disposition=inline`}
            >
              Open PDF
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
