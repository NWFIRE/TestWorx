import { AcceptanceCommentsCard } from "../components/AcceptanceCommentsCard";
import { AcceptanceInstallerCard } from "../components/AcceptanceInstallerCard";
import { AcceptanceOutcomeHero } from "../components/AcceptanceOutcomeHero";
import { AcceptancePropertyCard } from "../components/AcceptancePropertyCard";
import { AcceptanceReportHeader } from "../components/AcceptanceReportHeader";
import { AcceptanceResultsTable } from "../components/AcceptanceResultsTable";
import { AcceptanceSignaturesCard } from "../components/AcceptanceSignaturesCard";
import { AcceptanceSummaryStrip } from "../components/AcceptanceSummaryStrip";
import { AcceptanceSystemCard } from "../components/AcceptanceSystemCard";
import { AcceptanceWitnessCard } from "../components/AcceptanceWitnessCard";
import type { AcceptanceTestViewModel } from "../types/acceptanceTest";

export function AcceptanceReportView({ model }: { model: AcceptanceTestViewModel }) {
  return (
    <section className="space-y-6">
      <AcceptanceReportHeader model={model} />
      <AcceptanceOutcomeHero model={model} />
      <AcceptancePropertyCard model={model} />
      <AcceptanceInstallerCard model={model} />
      <AcceptanceSystemCard model={model} />
      <AcceptanceResultsTable model={model} />
      <AcceptanceSummaryStrip model={model} />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <AcceptanceWitnessCard model={model} />
        <AcceptanceCommentsCard model={model} />
      </div>
      <AcceptanceSignaturesCard model={model} />
    </section>
  );
}
