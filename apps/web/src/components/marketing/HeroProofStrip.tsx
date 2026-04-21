import { CheckCircle2 } from "lucide-react";

import { SectionContainer } from "./shared/SectionContainer";

const proofItems = [
  "Built for fire and life safety operations",
  "Hosted reports and premium PDFs",
  "Provider billing and contract pricing",
  "Offline-capable technician workflows"
];

export function HeroProofStrip() {
  return (
    <section className="mt-5">
      <SectionContainer>
        <div className="rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.92))] px-5 py-[18px] shadow-[0_12px_28px_rgba(15,23,42,0.04)] md:px-6 md:py-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:gap-6">
            {proofItems.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-slate-500" />
                <p className="text-sm font-medium leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
