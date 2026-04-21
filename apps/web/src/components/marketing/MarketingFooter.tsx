import Link from "next/link";

import { LogoLockup } from "./shared/LogoLockup";
import { SectionContainer } from "./shared/SectionContainer";

const columns = [
  {
    title: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#pricing", label: "Pricing" },
      { href: "#final-cta", label: "Demo" }
    ]
  },
  {
    title: "Company",
    links: [
      { href: "#footer-contact", label: "Contact" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" }
    ]
  },
  {
    title: "Customers",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "#footer-contact", label: "Support" }
    ]
  }
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 pt-16 pb-10">
      <SectionContainer>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 xl:grid-cols-4 xl:gap-8">
          <div className="space-y-4">
            <LogoLockup />
            <p className="max-w-sm text-sm leading-7 text-slate-600">
              TradeWorx helps fire and life safety teams run field operations, reports, manuals, and billing from one system.
            </p>
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">{column.title}</h3>
              <div className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <Link
                    key={link.label}
                    className="block text-sm text-slate-600 transition hover:text-slate-950"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          id="footer-contact"
          className="mt-12 flex flex-col gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500 md:flex-row md:items-center md:justify-between"
        >
          <p>© 2026 TradeWorx. Built for modern fire inspection and service operations.</p>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-5">
            <Link className="font-semibold text-slate-700 transition hover:text-slate-950" href="/login">
              Sign in
            </Link>
            <Link className="transition hover:text-slate-950" href="/login">
              Start Free Trial
            </Link>
            <a className="transition hover:text-slate-950" href="mailto:hello@tradeworx.net">
              hello@tradeworx.net
            </a>
          </div>
        </div>
      </SectionContainer>
    </footer>
  );
}
