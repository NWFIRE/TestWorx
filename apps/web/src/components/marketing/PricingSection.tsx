import { PricingCard } from "./shared/PricingCard";
import { SectionContainer } from "./shared/SectionContainer";
import { SectionHeading } from "./shared/SectionHeading";

export function PricingSection() {
  return (
    <section className="py-24" id="pricing">
      <SectionContainer>
        <SectionHeading
          eyebrow="Pricing"
          title="Simple plans for growing service teams"
          body="Choose the setup that fits your team today, with room to scale."
        />
        <div className="mt-12 grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3 xl:gap-6">
          <PricingCard
            cadence="/ month"
            ctaLabel="Start Trial"
            features={[
              "Core scheduling and inspection workflows",
              "Technician mobile app access",
              "Customer-ready report delivery",
              "Manuals library and hosted documents"
            ]}
            href="/login"
            name="Starter"
            price="$149"
            secondaryText="For smaller teams replacing spreadsheets and disconnected tools"
            subtitle="For smaller teams replacing spreadsheets and disconnected tools"
          />
          <PricingCard
            cadence="/ month"
            ctaLabel="Start Trial"
            featured
            features={[
              "Everything in Starter",
              "Advanced reporting and hosted packets",
              "QuickBooks and billing workflows",
              "Parts, services, and contract support",
              "Priority onboarding guidance"
            ]}
            href="/login"
            name="Pro"
            price="$349"
            secondaryText="Most teams running inspections every day start here."
            subtitle="For daily operations across field work, reporting, and billing"
          />
          <PricingCard
            cadence="custom"
            ctaLabel="Book Demo"
            features={[
              "Everything in Pro",
              "Provider billing and pricing complexity",
              "Multi-team operational controls",
              "Implementation planning and tailored rollout",
              "Enterprise support options"
            ]}
            href="#final-cta"
            name="Enterprise"
            price="Custom"
            secondaryText="For multi-team operations, advanced billing workflows, and rollout support"
            subtitle="For multi-team operations, advanced billing workflows, and rollout support"
          />
        </div>
      </SectionContainer>
    </section>
  );
}
