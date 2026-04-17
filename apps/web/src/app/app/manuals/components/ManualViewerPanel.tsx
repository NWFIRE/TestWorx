import type { ManualDetailData } from "../manual-types";

export function ManualViewerPanel({
  manual
}: {
  manual: ManualDetailData;
}) {
  return (
    <section className="rounded-[24px] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-sm font-semibold text-slate-900">Manual viewer</p>
            <p className="text-xs text-slate-500">Inline PDF preview for quick field reference.</p>
          </div>
          <a className="text-sm font-semibold text-[var(--tenant-primary)]" href={`/api/manuals/${manual.id}/file?disposition=inline`} target="_blank">
            Open full screen
          </a>
        </div>
        <div className="hidden overflow-hidden rounded-[18px] border border-slate-200 bg-white lg:block">
          <iframe className="h-[70dvh] w-full" src={`/api/manuals/${manual.id}/file?disposition=inline`} title={`${manual.title} viewer`} />
        </div>
        <div className="rounded-[18px] border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-600 lg:hidden">
          Use <span className="font-semibold">View document</span> to open the PDF in your device viewer for the cleanest mobile experience.
        </div>
      </div>
    </section>
  );
}
