import { toggleManualFavoriteAction, toggleManualOfflineAction } from "../actions";
import type { ManualDetailData } from "../manual-types";

export function ManualActionBar({
  manual
}: {
  manual: ManualDetailData;
}) {
  return (
    <section className="rounded-[24px] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap gap-3">
        <a className="rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-white" href={`/api/manuals/${manual.id}/file?disposition=inline`} target="_blank">
          View document
        </a>
        <a className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" href={`/api/manuals/${manual.id}/file?disposition=attachment`}>
          Download
        </a>
        <form action={toggleManualFavoriteAction}>
          <input name="manualId" type="hidden" value={manual.id} />
          <input name="favorite" type="hidden" value={manual.isFavorite ? "false" : "true"} />
          <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" type="submit">
            {manual.isFavorite ? "Unfavorite" : "Favorite"}
          </button>
        </form>
        {manual.isOfflineEligible ? (
          <form action={toggleManualOfflineAction}>
            <input name="manualId" type="hidden" value={manual.id} />
            <input name="saveOffline" type="hidden" value={manual.savedOfflineAt ? "false" : "true"} />
            <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700" type="submit">
              {manual.savedOfflineAt ? "Remove offline save" : "Save offline"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
