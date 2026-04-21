import { SectionContainer } from "./shared/SectionContainer";

export function TrustStrip() {
  const items = [
    "Built for fire and life safety operations",
    "Customer-ready reporting",
    "Field-first mobile workflows",
    "Contract and billing support"
  ];

  return (
    <section className="py-8 md:py-10">
      <SectionContainer>
        <div className="grid gap-6 rounded-[24px] border border-slate-200 bg-slate-50 px-6 py-5 md:grid-cols-2 md:px-8 md:py-6 xl:grid-cols-4">
          {items.map((item) => (
            <p key={item} className="text-sm font-medium text-slate-700 md:text-base">{item}</p>
          ))}
        </div>
      </SectionContainer>
    </section>
  );
}
