import { LogoLockup } from "./shared/LogoLockup";
import { NavLinkGroup } from "./shared/NavLinkGroup";
import { PrimaryButton } from "./shared/PrimaryButton";
import { SecondaryButton } from "./shared/SecondaryButton";
import { SectionContainer } from "./shared/SectionContainer";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <SectionContainer className="flex h-[84px] items-center justify-between">
        <LogoLockup />
        <NavLinkGroup
          links={[
            { href: "#product", label: "Product" },
            { href: "#features", label: "Features" },
            { href: "#pricing", label: "Pricing" },
            { href: "#final-cta", label: "Demo" },
            { href: "#footer-contact", label: "Contact" }
          ]}
        />
        <div className="flex items-center gap-3">
          <SecondaryButton className="min-h-11 px-4 py-2.5" href="/login">
            Sign in
          </SecondaryButton>
          <PrimaryButton className="hidden sm:inline-flex" href="/login">
            Start Free Trial
          </PrimaryButton>
        </div>
      </SectionContainer>
    </header>
  );
}
