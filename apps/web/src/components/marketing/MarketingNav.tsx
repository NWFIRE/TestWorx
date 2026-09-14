"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { marketingDestinations } from "@testworx/lib/marketing-inquiries-shared";
import { LogoLockup } from "./shared/LogoLockup";
import { NavLinkGroup } from "./shared/NavLinkGroup";
import { PrimaryButton } from "./shared/PrimaryButton";
import { SecondaryButton } from "./shared/SecondaryButton";
import { SectionContainer } from "./shared/SectionContainer";

export function MarketingNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const links = [
    { href: "#product", label: "Product" },
    { href: "#features", label: "Features" },
    { href: "#pricing", label: "Pricing" },
    { href: marketingDestinations.demo, label: "Demo" },
    { href: "#footer-contact", label: "Contact" }
  ];
  return (
    <header className="relative z-50 border-b border-slate-200 bg-white" onKeyDown={(event) => {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        menuButton.current?.focus({ preventScroll: true });
      }
    }}>
      <div className="bg-[#09283c] py-2 text-center text-xs tracking-wide text-white">Built for the field. Connected to the office.</div>
      <SectionContainer className="flex min-h-[80px] items-center justify-between gap-4 py-3">
        <LogoLockup />
        <NavLinkGroup links={links} />
        <div className="flex items-center gap-3">
          <SecondaryButton className="hidden min-h-11 px-4 py-2.5 sm:inline-flex" href="/login">
            Sign in
          </SecondaryButton>
          <PrimaryButton className="hidden lg:inline-flex" href={marketingDestinations.trial}>
            Start Free Trial
          </PrimaryButton>
          <button ref={menuButton} type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="marketing-mobile-nav" onClick={() => setMenuOpen(!menuOpen)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-900 lg:hidden">
            {menuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>
        </div>
      </SectionContainer>
      <nav id="marketing-mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen} className="absolute inset-x-0 top-full max-h-[70dvh] overflow-y-auto border-b border-slate-200 bg-white px-5 py-4 shadow-lg lg:hidden">
        {[...links, { href: marketingDestinations.trial, label: "Start free trial" }, { href: "/login", label: "Sign in" }].map((link) => <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="block rounded-md px-3 py-3 font-semibold text-slate-800 hover:bg-blue-50">{link.label}</Link>)}
      </nav>
    </header>
  );
}
