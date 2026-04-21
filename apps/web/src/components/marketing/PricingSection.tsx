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
            secondaryText="For smaller teams getting organized"
            subtitle="For smaller teams getting organized"
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
            secondaryText="Built for teams running daily operations"
            subtitle="For teams running daily operations"
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
            secondaryText="For larger or more complex operations"
            subtitle="For larger or more complex operations"
          />
        </div>
      </SectionContainer>
    </section>
  );
}
