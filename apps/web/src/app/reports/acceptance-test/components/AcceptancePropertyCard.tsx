import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

export function AcceptancePropertyCard({ model }: { model: AcceptanceTestViewModel }) {
  const rows = [
    ["Building Name", model.property.buildingName],
    ["Address", model.property.address],
    ["Building Owner", model.property.buildingOwner],
    ["Owner Contact", model.property.ownerContact]
  ].filter(([, value]) => Boolean(value));

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Property Information</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-950">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
