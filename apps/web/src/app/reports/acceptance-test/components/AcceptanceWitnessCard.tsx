import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

export function AcceptanceWitnessCard({ model }: { model: AcceptanceTestViewModel }) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Witness Information</p>
      <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-slate-950">
        {model.witness.witnessedBy || "No witness recorded."}
      </p>
    </section>
  );
}
