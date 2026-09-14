import { FeatureGridSection } from "./FeatureGridSection";
import { FinalCtaSection } from "./FinalCtaSection";
import { HeroSection } from "./HeroSection";
import { HeroProofStrip } from "./HeroProofStrip";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingNav } from "./MarketingNav";
import { PricingSection } from "./PricingSection";
import { ProblemSolutionSection } from "./ProblemSolutionSection";
import styles from "./marketing.module.css";
import { CustomerProofSection } from "./CustomerProofSection";
import { WorkflowSection } from "./WorkflowSection";

export function MarketingPage() {
  return (
    <main className={`${styles.page} min-h-screen`}>
      <MarketingNav />
      <HeroSection />
      <HeroProofStrip />
      <ProblemSolutionSection />
      <FeatureGridSection />
      <WorkflowSection />
      <CustomerProofSection />
      <PricingSection />
      <FinalCtaSection />
      <MarketingFooter />
    </main>
  );
}
