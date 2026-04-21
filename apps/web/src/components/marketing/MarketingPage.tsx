import { FeatureGridSection } from "./FeatureGridSection";
import { FinalCtaSection } from "./FinalCtaSection";
import { HeroSection } from "./HeroSection";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingNav } from "./MarketingNav";
import { PricingSection } from "./PricingSection";
import { ProblemSolutionSection } from "./ProblemSolutionSection";
import { ProductDepthSection } from "./ProductDepthSection";
import { TrustStrip } from "./TrustStrip";
import { WorkflowSection } from "./WorkflowSection";

export function MarketingPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_18%,#f8fafc_100%)] text-slate-900">
      <MarketingNav />
      <HeroSection />
      <TrustStrip />
      <ProblemSolutionSection />
      <FeatureGridSection />
      <WorkflowSection />
      <PricingSection />
      <ProductDepthSection />
      <FinalCtaSection />
      <MarketingFooter />
    </main>
  );
}
