import { manualQuickLookupLabels } from "@testworx/lib";
import type { ManualDetailData } from "../manual-types";

export function ManualQuickLookup({
  manual
}: {
  manual: ManualDetailData;
}) {
  const lookupTags = Object.entries(manualQuickLookupLabels)
    .filter(([key, label]) => manual.tags.some((tag) => tag.toLowerCase().includes(key.replaceAll("_", " ")) || tag.toLowerCase().includes(label.toLowerCase())))
    .map(([, label]) => label);

  const chips = lookupTags.length > 0 ? lookupTags : manual.tags.slice(0, 6);

  return (
    <section className="rounded-[24px] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Quick lookup</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {chips.length > 0 ? chips.map((chip) => (
          <span key={chip} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700">
            {chip}
          </span>
        )) : <p className="text-sm text-slate-500">No quick lookup tags available yet.</p>}
      </div>
    </section>
  );
}
