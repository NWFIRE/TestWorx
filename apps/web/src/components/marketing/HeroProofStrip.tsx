import { CheckCircle2 } from "lucide-react";

import { SectionContainer } from "./shared/SectionContainer";

const proofItems = [
  "Built for fire and life safety operations",
  "Hosted reports and premium PDFs",
  "Direct billing and QuickBooks-ready invoices",
  "Offline-capable technician workflows"
];

export function HeroProofStrip() {
  return (
    <section className="bg-[#09283c] text-white" aria-label="Platform capabilities">
      <SectionContainer>
        <div className="py-7">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:gap-6">
            {proofItems.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-blue-300" />
                <p className="text-sm font-medium leading-6 text-white">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
