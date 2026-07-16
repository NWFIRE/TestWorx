"use client";

import { useMemo, useState } from "react";

type BillingReportPdf = {
  inspectionTaskId: string;
  inspectionReportId: string;
  reportLabel: string;
  reportStatus: string;
  finalizedAt: Date | string | null;
  attachmentId: string;
  fileName: string;
  viewUrl: string;
  downloadUrl: string;
};

function formatReportDate(value: Date | string | null) {
  if (!value) {
    return "Not finalized";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not finalized";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function BillingReportPdfReviewPanel({ reports }: { reports: BillingReportPdf[] }) {
  const [selectedAttachmentId, setSelectedAttachmentId] = useState(reports[0]?.attachmentId ?? "");
  const selectedReport = useMemo(
    () => reports.find((report) => report.attachmentId === selectedAttachmentId) ?? reports[0] ?? null,
    [reports, selectedAttachmentId]
  );

  return (
    <section className="hidden rounded-[2rem] bg-white p-4 shadow-panel xl:block">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Report PDF Review</p>
          <h3 className="mt-1 text-xl font-semibold text-ink">Verify billing against report</h3>
        </div>
        {selectedReport ? (
          <a
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slateblue transition hover:border-slate-300 hover:bg-slate-50"
            href={selectedReport.downloadUrl}
          >
            Download
          </a>
        ) : null}
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No generated report PDF is available yet. Open the inspection report to finalize or regenerate the PDF before reviewing billing here.
        </div>
      ) : (
        <div className="space-y-4">
          {reports.length > 1 ? (
            <label className="block text-sm font-semibold text-slate-700">
              Report
              <select
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slateblue focus:ring-4 focus:ring-blue-100"
                onChange={(event) => setSelectedAttachmentId(event.target.value)}
                value={selectedReport?.attachmentId ?? ""}
              >
                {reports.map((report) => (
                  <option key={report.attachmentId} value={report.attachmentId}>
                    {report.reportLabel}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selectedReport ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-950">{selectedReport.reportLabel}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Finalized {formatReportDate(selectedReport.finalizedAt)} | {selectedReport.fileName}
                </p>
                <a className="mt-2 inline-flex text-xs font-semibold text-slateblue" href={selectedReport.viewUrl}>
                  Open PDF in current tab
                </a>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                <iframe
                  className="h-[82vh] min-h-[50rem] w-full bg-white"
                  src={selectedReport.viewUrl}
                  title={`${selectedReport.reportLabel} PDF`}
                />
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
