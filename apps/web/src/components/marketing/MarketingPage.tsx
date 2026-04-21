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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(203,213,225,0.88),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(226,232,240,0.92),transparent_30%),linear-gradient(180deg,#eef3f8_0%,#f8fafc_18%,#ffffff_44%,#f4f7fb_100%)] text-slate-900">
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
