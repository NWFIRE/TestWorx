import { format } from "date-fns";

import { formatManualDocumentType, formatManualSystemCategory } from "@testworx/lib";
import type { ManualDetailData } from "../manual-types";

export function ManualMetadataCard({
  manual
}: {
  manual: ManualDetailData;
}) {
  const items = [
    { label: "Manufacturer", value: manual.manufacturer },
    { label: "System category", value: formatManualSystemCategory(manual.systemCategory) },
    { label: "Product family", value: manual.productFamily },
    { label: "Model", value: manual.model },
    { label: "Document type", value: formatManualDocumentType(manual.documentType) },
    { label: "Revision", value: manual.revisionLabel },
    { label: "Revision date", value: manual.revisionDate ? format(manual.revisionDate, "MMM d, yyyy") : null },
    { label: "Source", value: manual.source }
  ].filter((item) => item.value);

  return (
    <section className="rounded-[24px] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Manual metadata</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
            <p className="mt-1 text-sm text-slate-700">{item.value}</p>
          </div>
        ))}
      </div>
      {manual.description ? <p className="mt-4 text-sm leading-6 text-slate-600">{manual.description}</p> : null}
      {manual.notes ? <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">{manual.notes}</p> : null}
    </section>
  );
}
