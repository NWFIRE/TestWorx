import Image from "next/image";

import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

export function AcceptanceInstallerCard({ model }: { model: AcceptanceTestViewModel }) {
  const rows = [
    ["Installer", model.installer.companyName],
    ["Address", model.installer.address],
    ["Contact Person", model.installer.contactPerson],
    ["Contact Info", model.installer.contactInfo],
    ["License", model.installer.licenseNumber]
  ].filter(([, value]) => Boolean(value));

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {model.company.logoUrl ? (
            <Image
              alt={`${model.company.name} logo`}
              className="h-14 w-14 rounded-2xl border border-slate-200 bg-white object-contain p-2"
              src={model.company.logoUrl}
              unoptimized
              width={56}
              height={56}
            />
          ) : null}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Installer Information</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{model.company.name}</h2>
            {model.company.phone || model.company.website ? (
              <p className="mt-2 text-sm text-slate-600">{[model.company.phone, model.company.website].filter(Boolean).join(" | ")}</p>
            ) : null}
          </div>
        </div>
        {model.company.licenseNumber ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
            {model.company.licenseNumber}
          </span>
        ) : null}
      </div>
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
