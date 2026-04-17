import Image from "next/image";

import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

export function AcceptanceSignaturesCard({ model }: { model: AcceptanceTestViewModel }) {
  const signatures = [
    model.signatures.authorizedAgent
      ? { label: "Authorized Agent", value: model.signatures.authorizedAgent }
      : null,
    model.signatures.installingContractor
      ? { label: "Installing Contractor", value: model.signatures.installingContractor }
      : null
  ].filter((item): item is { label: string; value: NonNullable<AcceptanceTestViewModel["signatures"]["authorizedAgent"]> } => Boolean(item));

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Signatures</p>
      {signatures.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No signatures recorded.</p>
      ) : (
        <div className={`mt-4 grid gap-4 ${signatures.length === 1 ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
          {signatures.map((signature) => (
            <div key={signature.label} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{signature.label}</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{signature.value.name}</p>
              {signature.value.signedAt ? <p className="mt-1 text-sm text-slate-600">{signature.value.signedAt}</p> : null}
              {signature.value.imageUrl ? (
                <Image
                  alt={`${signature.label} signature`}
                  className="mt-4 max-h-24 w-full object-contain"
                  src={signature.value.imageUrl}
                  unoptimized
                  width={320}
                  height={96}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
