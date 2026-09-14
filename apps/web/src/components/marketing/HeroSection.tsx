import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ClipboardCheck } from "lucide-react";
import { marketingDestinations } from "@testworx/lib/marketing-inquiries-shared";
import { PrimaryButton } from "./shared/PrimaryButton";
import { SectionContainer } from "./shared/SectionContainer";
import styles from "./marketing.module.css";

export function HeroSection() {
  return (
    <section className={styles.hero}>
      <SectionContainer className="grid items-center gap-10 py-12 md:py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
        <div className={styles.intro}>
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.16em] text-blue-800">Built for fire inspection companies</p>
          <h1 className="max-w-[12ch] text-[clamp(2.6rem,4.8vw,4.75rem)] font-bold leading-[1.04] tracking-[-0.045em]">
            Exceptional service.<br /><span className="text-blue-700">Connected teams.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">Give your field and office teams one place to schedule work, complete inspections, deliver reports, and prepare jobs for billing.</p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <PrimaryButton href={marketingDestinations.demo}>Book a demo <ArrowRight aria-hidden="true" className="ml-3 h-4 w-4" /></PrimaryButton>
            <Link className="inline-flex min-h-12 items-center gap-2 font-semibold text-blue-900 underline-offset-4 hover:underline" href="#product">Explore the platform <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-600">
            {["Field-ready", "Office-connected", "Customer-focused"].map((label) => <span className="inline-flex items-center gap-2" key={label}><Check aria-hidden="true" className="h-4 w-4 text-blue-700" />{label}</span>)}
          </div>
          <p className="mt-6 text-sm text-slate-600">Already using TradeWorx? <Link className="font-semibold text-blue-900 underline underline-offset-4" href="/login">Sign in</Link></p>
        </div>
        <div className={styles.heroVisual}>
          <Image alt="Field technician using a tablet beside a fire alarm control panel" className="h-full w-full object-cover" src="/marketing/field-technician.webp" width={1120} height={1400} priority sizes="(max-width: 1023px) 100vw, 50vw" />
          <div className={styles.jobCard}>
            <p className="text-xs font-medium text-slate-500">Illustrative workflow</p>
            <p className="mt-2 flex items-center gap-3 text-lg font-semibold"><ClipboardCheck aria-hidden="true" className="h-6 w-6 shrink-0 text-blue-700" />From the field to the office</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {["Inspection completed", "Signed report delivered", "Job ready for billing review"].map((step) => <li className="flex items-center gap-2" key={step}><Check aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-700" />{step}</li>)}
            </ul>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
