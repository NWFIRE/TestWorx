import { SectionContainer } from "./shared/SectionContainer";
import { SectionHeading } from "./shared/SectionHeading";

const proofCards = [
  {
    title: "For technicians",
    body: "Complete inspections, capture signatures, and keep work moving even in low-service conditions."
  },
  {
    title: "For customers",
    body: "Deliver hosted reports and polished PDFs that feel like part of your brand."
  },
  {
    title: "For the office",
    body: "Handle inspection billing, invoice review, and customer follow-through from one operational system."
  }
];

export function CustomerProofSection() {
  return (
    <section className="bg-[#e8f2f6] py-20">
      <SectionContainer>
        <SectionHeading
          eyebrow="Built around your people"
          title="Different roles. One connected team."
          body="Make the day simpler for everyone who depends on your service."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3 xl:gap-6">
          {proofCards.map((card) => (
            <article
              key={card.title}
              className="min-w-0 border-l-2 border-blue-700 py-2 pl-6"
            >
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{card.body}</p>
            </article>
          ))}
        </div>
      </SectionContainer>
    </section>
  );
}
