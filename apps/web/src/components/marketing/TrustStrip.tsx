import { SectionContainer } from "./shared/SectionContainer";

export function TrustStrip() {
  const items = [
    {
      title: "Field Operations",
      body: "Inspections, deficiencies, photos, signatures, offline workflows."
    },
    {
      title: "Reporting",
      body: "Customer-ready reports with clear compliance and premium output."
    },
    {
      title: "Billing",
      body: "Direct billing, provider billing, contract pricing, one unified system."
    }
  ];

  return (
    <section className="mt-6 border-t border-slate-200/80 py-6">
      <SectionContainer>
        <div className="grid gap-8 md:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="space-y-2">
              <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-slate-950">{item.title}</h2>
              <p className="max-w-[34ch] text-[15px] leading-7 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </SectionContainer>
    </section>
  );
}
