import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

export function AcceptanceSummaryStrip({ model }: { model: AcceptanceTestViewModel }) {
  const items = [
    { label: "Total Tests", value: model.summary.total, tone: "default" },
    { label: "Passed", value: model.summary.passed, tone: "success" },
    { label: "Failed", value: model.summary.failed, tone: model.summary.failed > 0 ? "danger" : "default" }
  ] as const;

  return (
    <section className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
            <p
              className={`mt-2 text-2xl font-semibold tracking-[-0.05em] ${
                item.tone === "success"
                  ? "text-emerald-700"
                  : item.tone === "danger"
                    ? "text-rose-700"
                    : "text-slate-950"
              }`}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
