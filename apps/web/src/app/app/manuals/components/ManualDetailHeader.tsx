import { format } from "date-fns";

import { formatManualSystemCategory } from "@testworx/lib";
import type { ManualDetailData } from "../manual-types";
import banner from "../../page-banner.module.css";

export function ManualDetailHeader({
  manual
}: {
  manual: ManualDetailData;
}) {
  return (
    <section className={`${banner.banner} p-4`}>
      <p className={`${banner.muted} text-[11px] font-bold uppercase tracking-[0.16em]`}>
        {formatManualSystemCategory(manual.systemCategory)}
      </p>
      <h1 className="mt-1">
        {manual.title}
      </h1>
      <p className={`${banner.muted} mt-3 text-base`}>
        {[manual.manufacturer, manual.productFamily, manual.model].filter(Boolean).join(" • ")}
      </p>
      <div className={`${banner.muted} mt-4 flex flex-wrap gap-2 text-sm`}>
        {manual.revisionLabel ? <span>Revision {manual.revisionLabel}</span> : null}
        {manual.revisionDate ? <span>{format(manual.revisionDate, "MMM d, yyyy")}</span> : null}
      </div>
    </section>
  );
}
