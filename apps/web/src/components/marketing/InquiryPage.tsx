import Link from "next/link";
import { Check } from "lucide-react";
import type { MarketingInquiryKind } from "@testworx/lib/marketing-inquiries-shared";
import { LogoLockup } from "./shared/LogoLockup";
import { InquiryForm } from "./InquiryForm";
import styles from "./marketing.module.css";

export function InquiryPage({ kind, plan }: { kind: MarketingInquiryKind; plan: unknown }) {
  const initialPlan = typeof plan === "string" && ["starter", "pro", "enterprise"].includes(plan) ? plan : "not_sure";
  const trial = kind === "trial";
  return <main className={`${styles.page} min-h-screen`}>
    <header className="border-b border-slate-200"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8"><LogoLockup /><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-800" href="/">Back to homepage</Link></div></header>
    <div className={`${styles.hero} min-h-[calc(100vh-90px)]`}>
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-20">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">{trial ? "Get started with TradeWorx" : "See TradeWorx in action"}</p>
          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">{trial ? "Let's get your free trial started." : "A walkthrough built around your team."}</h1>
          <p className="mt-6 text-lg leading-8 text-slate-600">{trial ? "Tell us a little about your company. Our team will contact you to arrange trial access and help you get started." : "Tell us what matters to your business. We'll contact you to arrange a personal demo of the workflows you want to see."}</p>
          <ul className="mt-8 space-y-4 text-slate-700">{["Scheduling and field inspections", "Branded reports and customer records", "Billing review and QuickBooks workflows"].map((item) => <li key={item} className="flex gap-3"><Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-blue-700" />{item}</li>)}</ul>
          <p className="mt-8 border-t border-slate-300 pt-6 text-sm leading-6 text-slate-600">{trial ? "This is a trial-access request, not an instant signup. No payment details are collected and no subscription is created by submitting this form." : "Submitting a request does not reserve a time. We'll confirm your demo appointment with you directly."}</p>
          <p className="mt-6 text-sm text-slate-600">Already have an account? <Link href="/login" className="font-semibold text-blue-800 underline">Sign in</Link></p>
        </section>
        <InquiryForm kind={kind} initialPlan={initialPlan} />
      </div>
    </div>
  </main>;
}
