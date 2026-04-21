import { CreditCard, FileCheck2, Signal, Smartphone } from "lucide-react";

import { ScreenshotCard } from "./shared/ScreenshotCard";
import { SectionContainer } from "./shared/SectionContainer";
import { SectionHeading } from "./shared/SectionHeading";
import { ValuePill } from "./shared/ValuePill";

const rows = [
  {
    title: "Keep technicians moving in the field",
    body: "Complete inspections, capture photos, collect signatures, log deficiencies, and work offline when service is poor.",
    pills: ["Offline-ready workflows", "Fast autosave", "Touch-friendly inspection UI"],
    textFirst: true,
    visual: (
      <ScreenshotCard className="min-h-[340px]" title="Technician field app">
        <div className="grid gap-4 md:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-4 text-white">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Today&apos;s route</p>
              <Smartphone className="h-5 w-5 text-blue-300" />
            </div>
            <div className="mt-4 space-y-3">
              {["Willow View Church — Wet chemical acceptance", "Cedar Hall — Alarm panel follow-up", "Northwest Kitchen — Extinguisher annual"].map((item) => (
                <div key={item} className="rounded-2xl bg-white/10 px-3 py-3 text-sm text-white/85">{item}</div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center gap-3">
                <Signal className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-950">Weak connection detected</p>
                  <p className="text-sm text-slate-500">Continue working offline. Drafts sync automatically later.</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-950">Service checklist</p>
              <div className="mt-4 space-y-2">
                {["Photo evidence captured", "Customer signature collected", "Deficiency logged and routed"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScreenshotCard>
    )
  },
  {
    title: "Deliver reports customers actually want to read",
    body: "Generate premium, structured reports with strong compliance visibility, clean summaries, and customer-facing polish.",
    pills: ["Hosted reports", "Premium PDFs", "Inspection packets"],
    textFirst: false,
    visual: (
      <ScreenshotCard className="min-h-[340px]" title="Customer-ready report delivery">
        <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm font-semibold text-slate-950">Wet Chemical System Acceptance Test Report</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["Status", "Pass"],
                ["Passed", "8 tests"],
                ["Failed", "1 item"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {["Outcome hero with narrative", "Structured results table", "Signature block and comments"].map((item) => (
                <div key={item} className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">{item}</div>
              ))}
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-slate-950 p-4 text-white">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Portal delivery</p>
              <FileCheck2 className="h-5 w-5 text-blue-300" />
            </div>
            <div className="mt-4 space-y-3">
              {["Hosted report link", "Inspection packet PDFs", "Customer-visible signatures"].map((item) => (
                <div key={item} className="rounded-2xl bg-white/10 px-3 py-3 text-sm text-white/85">{item}</div>
              ))}
            </div>
          </div>
        </div>
      </ScreenshotCard>
    )
  },
  {
    title: "Handle direct and 3rd-party billing without workarounds",
    body: "Manage invoicing, contract pricing, and provider-billed work from one system.",
    pills: ["Provider billing", "Contract pricing", "Billing resolution snapshots"],
    textFirst: true,
    visual: (
      <ScreenshotCard className="min-h-[340px]" title="Billing and contract support">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
          <div className="space-y-3">
            {[
              ["Bill to", "3rd Part Provider"],
              ["Contract used", "3rd Part Provider Annual"],
              ["Pricing source", "Provider contract rate"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-slate-950 p-5 text-white">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Invoice preview</p>
              <CreditCard className="h-5 w-5 text-blue-300" />
            </div>
            <div className="mt-5 space-y-3">
              {["Monthly rollup ready", "Per-site or per-work-order", "Warnings for expired contracts"].map((item) => (
                <div key={item} className="rounded-2xl bg-white/10 px-3 py-3 text-sm text-white/85">{item}</div>
              ))}
            </div>
          </div>
        </div>
      </ScreenshotCard>
    )
  }
];

export function ProblemSolutionSection() {
  return (
    <section className="py-20 xl:py-24" id="product">
      <SectionContainer>
        <SectionHeading
          eyebrow="Purpose-built for the way fire service companies actually work"
          title="One system for field work, reporting, and billing."
        />

        <div className="mt-12 space-y-16 md:mt-14 xl:mt-16 xl:space-y-20">
          {rows.map((row) => (
            <div key={row.title} className="grid grid-cols-12 items-center gap-8 xl:gap-10">
              <div className={`col-span-12 lg:col-span-5 ${row.textFirst ? "lg:order-1" : "lg:order-2"}`}>
                <h3 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">{row.title}</h3>
                <p className="mt-4 text-base leading-7 text-slate-600 md:text-lg">{row.body}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {row.pills.map((pill) => (
                    <ValuePill key={pill}>{pill}</ValuePill>
                  ))}
                </div>
              </div>
              <div className={`col-span-12 lg:col-span-7 ${row.textFirst ? "lg:order-2" : "lg:order-1"}`}>
                {row.visual}
              </div>
            </div>
          ))}
        </div>
      </SectionContainer>
    </section>
  );
}
