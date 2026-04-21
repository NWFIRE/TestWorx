import Link from "next/link";
import { ArrowRight, CircleCheckBig, ClipboardCheck, ReceiptText, ShieldCheck } from "lucide-react";

import { Eyebrow } from "./shared/Eyebrow";
import { PrimaryButton } from "./shared/PrimaryButton";
import { ScreenshotCard } from "./shared/ScreenshotCard";
import { SecondaryButton } from "./shared/SecondaryButton";
import { SectionContainer } from "./shared/SectionContainer";
import { ValuePill } from "./shared/ValuePill";

function SurfaceMetric({
  label,
  value,
  tone = "slate"
}: {
  label: string;
  value: string;
  tone?: "slate" | "blue" | "emerald";
}) {
  const toneClasses =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">{value}</p>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="pb-12 pt-14 md:pb-16 md:pt-[72px] xl:pb-[72px] xl:pt-[88px]">
      <SectionContainer>
        <div className="grid grid-cols-12 items-center gap-8 xl:gap-10">
          <div className="col-span-12 lg:col-span-5">
            <Eyebrow className="text-slate-600">Built for modern fire protection teams</Eyebrow>
            <h1 className="mt-5 max-w-[11ch] text-[40px] font-extrabold leading-[0.98] tracking-[-0.05em] text-slate-950 md:text-[52px] xl:text-[64px]">
              The operating system for fire inspection companies.
            </h1>
            <p className="mt-6 max-w-[560px] text-[18px] leading-8 text-slate-600 md:text-[19px] xl:text-[20px]">
              Manage field work, reporting, manuals, customer records, and billing in one unified platform designed for fire and life safety operations.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <PrimaryButton className="w-full sm:w-auto" href="/login">
                Start Free Trial
              </PrimaryButton>
              <SecondaryButton className="w-full sm:w-auto" href="#pricing">
                View Plans
              </SecondaryButton>
            </div>
            <p className="mt-5 text-sm text-slate-500">
              Existing customer?{" "}
              <Link className="font-semibold text-slate-950 underline underline-offset-4" href="/login">
                Sign in
              </Link>
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ValuePill>Built for field teams</ValuePill>
              <ValuePill>Customer-ready reports</ValuePill>
              <ValuePill>Offline-capable workflows</ValuePill>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <div className="relative">
              <ScreenshotCard className="mx-auto min-h-[520px] max-w-[720px]">
                <div className="border-b border-slate-200 px-1 pb-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Operations overview</p>
                      <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Live inspection, reporting, and billing workflow</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:w-[320px]">
                      <SurfaceMetric label="Assigned today" tone="slate" value="24 visits" />
                      <SurfaceMetric label="Finalized" tone="blue" value="9 reports" />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 pt-5 lg:grid-cols-[1.05fr_1.15fr_0.9fr]">
                  <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Today / Upcoming Work</p>
                        <p className="mt-1 text-sm text-slate-500">Assigned routes, due work, and claimable visits.</p>
                      </div>
                      <ShieldCheck className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {[
                        ["Enid Medical Plaza", "Wet chemical acceptance", "10:30 AM"],
                        ["Northwest Kitchen", "Extinguisher annuals", "1:00 PM"],
                        ["Cold Storage 4", "Industrial suppression follow-up", "3:15 PM"]
                      ].map(([site, task, time]) => (
                        <div key={site} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">{site}</p>
                              <p className="mt-1 text-sm leading-6 text-slate-500">{task}</p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                              {time}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="relative rounded-[24px] border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Inspection / Report Progress</p>
                        <p className="mt-1 text-sm text-slate-500">Drafts, signatures, and customer-ready output.</p>
                      </div>
                      <ClipboardCheck className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-950 p-4 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Wet Chemical System Acceptance Test</p>
                          <p className="mt-1 text-sm text-white/65">NFPA 17A • Hosted report ready</p>
                        </div>
                        <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                          Finalized
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <SurfaceMetric label="Total tests" value="9" />
                        <SurfaceMetric label="Passed" tone="emerald" value="8" />
                        <SurfaceMetric label="Failed" tone="slate" value="1" />
                      </div>
                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="flex items-center gap-3 text-sm text-white/80">
                          <CircleCheckBig className="h-4 w-4 text-emerald-300" />
                          Customer portal, PDF output, and inspection packet stay in sync.
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {[
                        ["Draft in field", "6 active report sessions"],
                        ["Waiting on signatures", "2 customer approvals"],
                        ["Posted today", "9 hosted reports available"]
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-sm text-slate-600">{label}</p>
                          <p className="text-sm font-semibold text-slate-950">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="hidden md:block">
                      <div className="absolute bottom-5 right-5 w-[220px] rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.14)]">
                        <div className="border-b border-slate-200 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Report preview</p>
                        </div>
                        <div className="space-y-3 p-4">
                          <div className="h-2 rounded-full bg-slate-900" />
                          <div className="h-2 w-3/4 rounded-full bg-slate-200" />
                          <div className="grid grid-cols-3 gap-2">
                            <div className="h-14 rounded-2xl bg-slate-100" />
                            <div className="h-14 rounded-2xl bg-slate-100" />
                            <div className="h-14 rounded-2xl bg-slate-100" />
                          </div>
                          <div className="h-20 rounded-2xl bg-slate-50 ring-1 ring-slate-200" />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Billing / Provider Work</p>
                        <p className="mt-1 text-sm text-slate-500">Direct billing and provider-billed jobs in one queue.</p>
                      </div>
                      <ReceiptText className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Commercial Fire</p>
                          <p className="mt-1 text-sm text-slate-500">Provider-billed work order CF-1001</p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                          Contract
                        </span>
                      </div>
                      <div className="mt-4 space-y-3">
                        {[
                          ["Bill to", "Commercial Fire"],
                          ["Pricing source", "Provider contract rate"],
                          ["Status", "Ready for invoice review"]
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-950">Queue health</p>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="mt-4 space-y-3">
                        {[
                          ["Ready to invoice", "14"],
                          ["Contract-provider jobs", "5"],
                          ["Awaiting pricing review", "2"]
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">{label}</span>
                            <span className="font-semibold text-slate-950">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              </ScreenshotCard>
            </div>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
