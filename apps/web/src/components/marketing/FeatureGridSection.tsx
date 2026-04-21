import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  FileWarning,
  FileText,
  Hammer,
  MonitorSmartphone,
  Receipt,
  Users2
} from "lucide-react";

import { FeatureCard } from "./shared/FeatureCard";
import { SectionContainer } from "./shared/SectionContainer";
import { SectionHeading } from "./shared/SectionHeading";

const features = [
  { title: "Inspections", description: "Run recurring, ad hoc, and due-now visits from one operational workspace.", icon: ClipboardList },
  { title: "Work Orders", description: "Turn quoted scope into active field work without rebuilding the job.", icon: Hammer },
  { title: "Reporting", description: "Deliver hosted reports and premium PDFs customers can review immediately.", icon: FileText },
  { title: "Invoicing", description: "Handle direct billing, provider billing, and contract pricing in one flow.", icon: Receipt },
  { title: "Manuals", description: "Keep service docs and model references inside the technician workflow.", icon: BookOpen },
  { title: "Offline Field Access", description: "Keep inspections moving in weak-signal environments with safe sync behavior.", icon: MonitorSmartphone },
  { title: "Scheduling", description: "Coordinate assignment, claimable work, recurrence, and due dates cleanly.", icon: CalendarClock },
  { title: "Customer Records", description: "Unify sites, assets, contacts, and inspection history in one record.", icon: Users2 },
  { title: "Deficiencies", description: "Capture findings, route follow-up work, and keep compliance visible.", icon: FileWarning }
];

export function FeatureGridSection() {
  return (
    <section className="py-20 xl:py-24" id="features">
      <SectionContainer>
        <SectionHeading title="Everything your team needs in one system" />
        <p className="mt-6 max-w-4xl text-lg font-medium tracking-[-0.02em] text-slate-800 md:text-[22px]">
          TradeWorx is not a collection of tools. It is the operating system for your fire inspection business.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 xl:gap-6">
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              description={feature.description}
              icon={<feature.icon className="h-5 w-5" />}
              title={feature.title}
            />
          ))}
        </div>
      </SectionContainer>
    </section>
  );
}
