import { ArrowRight, CalendarCheck, FileCheck2, Receipt } from "lucide-react";
import Link from "next/link";
import { SectionContainer } from "./shared/SectionContainer";
import { SectionHeading } from "./shared/SectionHeading";

const outcomes = [
  { icon: CalendarCheck, number: "01", title: "A better day in the field.", body: "Give technicians the schedule, customer details, and inspection tools they need. Capture photos, document deficiencies, and collect signatures without switching between disconnected tools.", detail: "Scheduling / Inspections / Work orders" },
  { icon: FileCheck2, number: "02", title: "Work you can stand behind.", body: "Turn completed inspections into clear, branded reports. Keep findings, signatures, and supporting documents together so customers and office staff can see the full picture.", detail: "Reports / Documents / Customer portal" },
  { icon: Receipt, number: "03", title: "A clearer path to billing.", body: "Review the services performed and materials used alongside the report. Send verified quantities to QuickBooks for final invoice pricing and taxes, without re-entering the job.", detail: "Billing review / Quantities / QuickBooks" }
];

export function ProblemSolutionSection() {
  return (
    <section className="py-20 lg:py-24" id="product">
      <SectionContainer>
        <div className="grid items-end gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
          <SectionHeading eyebrow="One connected platform" title="Less busywork. More work that matters." />
          <p className="text-lg leading-8 text-slate-600">From the first scheduled visit to the final report, keep everyone working from the same information.</p>
        </div>
        <div className="mt-12 grid gap-8 lg:grid-cols-3 lg:gap-10">
          {outcomes.map((outcome) => (
            <article key={outcome.number} className="min-w-0 border-t-2 border-blue-700 pt-7">
              <div className="flex items-center justify-between"><outcome.icon aria-hidden="true" className="h-8 w-8 text-blue-700" /><span className="text-sm font-semibold text-slate-400">{outcome.number}</span></div>
              <h3 className="mt-7 text-2xl font-bold tracking-tight">{outcome.title}</h3>
              <p className="mt-4 text-base leading-7 text-slate-600">{outcome.body}</p>
              <p className="mt-6 text-sm font-semibold leading-6 text-blue-900">{outcome.detail}</p>
            </article>
          ))}
        </div>
        <Link href="#features" className="mt-10 inline-flex min-h-12 items-center gap-3 font-semibold text-blue-700 hover:underline">See what TradeWorx can do <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
      </SectionContainer>
    </section>
  );
}
