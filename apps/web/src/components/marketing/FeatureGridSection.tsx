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
  { title: "Inspections", description: "Run scheduled, ad hoc, and recurring inspections from one shared workspace.", icon: ClipboardList },
  { title: "Work Orders", description: "Convert quoted work into operational jobs without rebuilding the scope.", icon: Hammer },
  { title: "Reporting", description: "Deliver clean hosted reports and professional PDFs customers can trust.", icon: FileText },
  { title: "Invoicing", description: "Support direct billing, provider billing, and contract pricing without spreadsheets.", icon: Receipt },
  { title: "Manuals", description: "Put manuals, service docs, and model references directly in the technician workflow.", icon: BookOpen },
  { title: "Offline Field Access", description: "Keep work moving in weak-signal environments with save-and-sync behavior.", icon: MonitorSmartphone },
  { title: "Scheduling", description: "Coordinate assigned and unassigned visits, recurrence, and due work in one calendar flow.", icon: CalendarClock },
  { title: "Customer Records", description: "Track sites, assets, contacts, and inspection history in a unified customer record.", icon: Users2 },
  { title: "Deficiencies", description: "Capture findings, route follow-up work, and keep compliance visibility front and center.", icon: FileWarning }
];

export function FeatureGridSection() {
  return (
    <section className="py-20 xl:py-24" id="features">
      <SectionContainer>
        <SectionHeading title="Everything your team needs in one system" />
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
