import { format } from "date-fns";

type PacketDocument = {
  id: string;
  source: "attachment" | "inspection_document" | "report";
  category: "hosted_report" | "report_pdf" | "signed_document" | "inspection_pdf";
  categoryLabel: string;
  title: string;
  fileName: string;
  customerVisible: boolean;
  happenedAt: Date;
  downloadPath: string | null;
  viewPath: string;
  viewLabel?: string;
  downloadLabel?: string;
};

function groupDocuments(documents: PacketDocument[]) {
  const groups = new Map<string, PacketDocument[]>();
  for (const document of documents) {
    const existing = groups.get(document.categoryLabel) ?? [];
    existing.push(document);
    groups.set(document.categoryLabel, existing);
  }

  return [...groups.entries()];
}

export function InspectionPacketCard({
  title = "Inspection packet",
  description,
  emptyTitle,
  emptyDescription,
  documents,
  showCustomerVisibility = false
}: {
  title?: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  documents: PacketDocument[];
  showCustomerVisibility?: boolean;
}) {
  const grouped = groupDocuments(documents);

  return (
    <div className="rounded-[2rem] bg-white p-6 shadow-panel">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Documents</p>
        <h3 className="mt-2 text-2xl font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </div>
      <div className="mt-5 space-y-5">
        {documents.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-slate-200 px-4 py-5">
            <p className="text-sm font-medium text-slate-700">{emptyTitle}</p>
            <p className="mt-1 text-sm text-slate-500">{emptyDescription}</p>
          </div>
        ) : (
          grouped.map(([groupLabel, groupDocuments]) => (
            <div key={groupLabel} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{groupLabel}</p>
              <div className="space-y-3">
                {groupDocuments.map((document) => (
                  <div
                    key={`${document.source}-${document.id}`}
                    className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50/70 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{document.title}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {format(document.happenedAt, "MMM d, yyyy h:mm a")}
                        {showCustomerVisibility ? ` | ${document.customerVisible ? "Visible to customer" : "Internal only"}` : ""}
                      </p>
                      {document.title !== document.fileName ? (
                        <p className="mt-1 text-sm text-slate-500">{document.fileName}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
                        href={document.viewPath}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {document.viewLabel ?? "View PDF"}
                      </a>
                      {document.downloadPath ? (
                        <a
                          className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue"
                          href={document.downloadPath}
                        >
                          {document.downloadLabel ?? "Download PDF"}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
