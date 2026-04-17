import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

export function AcceptanceCommentsCard({ model }: { model: AcceptanceTestViewModel }) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Additional Comments</p>
      <p className="mt-4 text-sm leading-7 text-slate-700">
        {model.comments || "No additional comments."}
      </p>
    </section>
  );
}
