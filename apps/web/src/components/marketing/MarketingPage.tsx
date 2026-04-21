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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(226,232,240,0.72),transparent_30%),radial-gradient(circle_at_top_right,rgba(241,245,249,0.88),transparent_28%),linear-gradient(180deg,#f5f7fa_0%,#ffffff_15%,#f8fafc_100%)] text-slate-900">
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
