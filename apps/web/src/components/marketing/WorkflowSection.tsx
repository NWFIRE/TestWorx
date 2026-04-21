import { SectionContainer } from "./shared/SectionContainer";
import { SectionHeading } from "./shared/SectionHeading";
import { StepCard } from "./shared/StepCard";

const steps = [
  {
    step: "1",
    title: "Assign work",
    body: "Schedule inspections, attach report types, and route visits to the right technician or open claim pool."
  },
  {
    step: "2",
    title: "Complete in field",
    body: "Collect data, photos, notes, signatures, manuals, and deficiencies from a mobile-first technician workflow."
  },
  {
    step: "3",
    title: "Generate report",
    body: "Finalize polished customer-facing reports with strong summaries, hosted views, and professional PDFs."
  },
  {
    step: "4",
    title: "Bill and close out",
    body: "Resolve billing, sync invoicing, and close work with provider contracts and customer billing kept in line."
  }
];

export function WorkflowSection() {
  return (
    <section className="py-20 xl:py-24">
      <SectionContainer>
        <SectionHeading title="From assignment to invoice, in one workflow" />
        <div className="mt-10 grid grid-cols-1 gap-4 md:mt-12 md:grid-cols-2 md:gap-5 xl:grid-cols-4 xl:gap-6">
          {steps.map((step) => (
            <StepCard key={step.step} body={step.body} step={step.step} title={step.title} />
          ))}
        </div>
      </SectionContainer>
    </section>
  );
}
