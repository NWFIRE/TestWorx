import Link from "next/link";
import { format } from "date-fns";

import { formatManualDocumentType, formatManualSystemCategory } from "@testworx/lib";
import { toggleManualFavoriteAction, toggleManualOfflineAction } from "../actions";
import type { ManualListItem } from "../manual-types";

function buildMetaLine(manual: ManualListItem) {
  return [manual.manufacturer, manual.productFamily, manual.model].filter(Boolean).join(" • ");
}

export function ManualCard({
  manual,
  adminContext = false
}: {
  manual: ManualListItem;
  adminContext?: boolean;
}) {
  return (
    <article className="rounded-[24px] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              {formatManualSystemCategory(manual.systemCategory)}
            </span>
            <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {formatManualDocumentType(manual.documentType)}
            </span>
            {adminContext ? (
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${manual.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {manual.isActive ? "Active" : "Inactive"}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-slate-950">{manual.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{buildMetaLine(manual)}</p>
          {manual.description ? <p className="mt-3 text-sm leading-6 text-slate-500">{manual.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {manual.tags.slice(0, 5).map((tag) => (
              <span key={tag} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-3 text-xs text-slate-400">
            {[manual.revisionLabel, manual.revisionDate ? format(manual.revisionDate, "MMM d, yyyy") : null, manual.pageCount ? `${manual.pageCount} pages` : null].filter(Boolean).join(" • ")}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:w-[260px] lg:justify-end">
          <Link className="rounded-2xl bg-[var(--tenant-primary)] px-4 py-2.5 text-sm font-semibold text-white" href={`/app/manuals/${manual.id}`}>
            View
          </Link>
          <a
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            href={`/api/manuals/${manual.id}/file?disposition=attachment`}
          >
            Download
          </a>
          <form action={toggleManualFavoriteAction}>
            <input name="manualId" type="hidden" value={manual.id} />
            <input name="favorite" type="hidden" value={manual.isFavorite ? "false" : "true"} />
            <button className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700" type="submit">
              {manual.isFavorite ? "Unfavorite" : "Favorite"}
            </button>
          </form>
          {manual.isOfflineEligible ? (
            <form action={toggleManualOfflineAction}>
              <input name="manualId" type="hidden" value={manual.id} />
              <input name="saveOffline" type="hidden" value={manual.savedOfflineAt ? "false" : "true"} />
              <button className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700" type="submit">
                {manual.savedOfflineAt ? "Saved offline" : "Save offline"}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  );
}
