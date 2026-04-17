import { format } from "date-fns";

import { formatManualSystemCategory } from "@testworx/lib";
import type { ManualDetailData } from "../manual-types";

export function ManualDetailHeader({
  manual
}: {
  manual: ManualDetailData;
}) {
  return (
    <section className="rounded-[28px] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-5 shadow-[0_16px_38px_rgba(15,23,42,0.06)] lg:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--tenant-primary)]">
        {formatManualSystemCategory(manual.systemCategory)}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
        {manual.title}
      </h1>
      <p className="mt-3 text-base text-slate-600">
        {[manual.manufacturer, manual.productFamily, manual.model].filter(Boolean).join(" • ")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-500">
        {manual.revisionLabel ? <span>Revision {manual.revisionLabel}</span> : null}
        {manual.revisionDate ? <span>{format(manual.revisionDate, "MMM d, yyyy")}</span> : null}
      </div>
    </section>
  );
}
