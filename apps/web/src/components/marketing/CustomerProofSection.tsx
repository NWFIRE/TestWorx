import { SectionContainer } from "./shared/SectionContainer";
import { SectionHeading } from "./shared/SectionHeading";

const proofCards = [
  {
    title: "Field-ready workflows",
    body: "Complete inspections, capture signatures, and keep work moving even in low-service conditions."
  },
  {
    title: "Customer-ready reporting",
    body: "Deliver hosted reports and polished PDFs that feel like part of your brand."
  },
  {
    title: "Billing without workarounds",
    body: "Handle direct billing and provider-billed work from one operational system."
  }
];

export function CustomerProofSection() {
  return (
    <section className="py-[72px] xl:py-20">
      <SectionContainer>
        <SectionHeading
          title="Built for teams that need one system for field work, reporting, and billing."
          body="TradeWorx is designed for fire protection operations that need clean workflows, customer-ready outputs, and billing clarity."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3 xl:gap-6">
          {proofCards.map((card) => (
            <article
              key={card.title}
              className="rounded-[22px] border border-slate-200/90 bg-white p-6 shadow-[0_14px_32px_rgba(15,23,42,0.05)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Operational proof</p>
              <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-slate-950">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{card.body}</p>
            </article>
          ))}
        </div>
      </SectionContainer>
    </section>
  );
}
