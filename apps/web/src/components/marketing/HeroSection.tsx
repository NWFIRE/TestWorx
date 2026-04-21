import Link from "next/link";
import { BarChart3, CalendarRange, ClipboardCheck, FileText, Smartphone } from "lucide-react";

import { Eyebrow } from "./shared/Eyebrow";
import { PrimaryButton } from "./shared/PrimaryButton";
import { ScreenshotCard } from "./shared/ScreenshotCard";
import { SecondaryButton } from "./shared/SecondaryButton";
import { SectionContainer } from "./shared/SectionContainer";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-slate-950">{value}</p>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="py-16 md:py-20 xl:py-24">
      <SectionContainer>
        <div className="grid grid-cols-12 items-center gap-8 xl:gap-10">
          <div className="col-span-12 lg:col-span-5">
            <Eyebrow className="text-blue-700">Built for fire inspection and service teams</Eyebrow>
            <h1 className="mt-5 max-w-[11ch] text-4xl font-extrabold leading-[0.98] tracking-tight text-slate-950 md:text-5xl xl:text-[64px]">
              Fire inspection operations, streamlined.
            </h1>
            <p className="mt-6 max-w-[540px] text-base leading-7 text-slate-600 md:text-lg md:leading-8 xl:text-[20px]">
              Run inspections, reporting, manuals, billing, and field workflows from one unified platform built for fire and life safety companies.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <PrimaryButton href="/login">Start Free Trial</PrimaryButton>
              <SecondaryButton href="#pricing">View Plans</SecondaryButton>
            </div>
            <p className="mt-5 text-sm text-slate-500">
              No credit card required • Built for field teams • Existing customer?{" "}
              <Link className="font-semibold text-slate-950 underline underline-offset-4" href="/login">
                Sign in
              </Link>
            </p>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <div className="relative min-h-[460px]">
              <ScreenshotCard className="relative z-10 min-h-[460px]" title="Operations Command Center">
                <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <StatChip label="Today" value="18 inspections" />
                      <StatChip label="Reports out" value="12 finalized" />
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">Upcoming work</p>
                          <p className="mt-1 text-sm text-slate-500">Assigned, unassigned, and due-now visits</p>
                        </div>
                        <CalendarRange className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="mt-4 space-y-3">
                        {[
                          ["Enid Medical Plaza", "Wet chemical acceptance test", "10:30 AM"],
                          ["Northwest Kitchen", "Extinguisher annual", "1:00 PM"],
                          ["Cold storage site", "Industrial suppression follow-up", "3:15 PM"]
                        ].map(([site, task, time]) => (
                          <div key={site} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{site}</p>
                              <p className="truncate text-sm text-slate-500">{task}</p>
                            </div>
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-950 p-5 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">Revenue pipeline</p>
                          <p className="mt-1 text-sm text-white/70">Quoted, ready, and provider-billed work</p>
                        </div>
                        <BarChart3 className="h-5 w-5 text-blue-300" />
                      </div>
                      <div className="mt-5 h-36 rounded-[18px] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4">
                        <div className="flex h-full items-end gap-3">
                          {[42, 58, 64, 51, 76, 92].map((height, index) => (
                            <div key={height} className="flex-1 rounded-t-2xl bg-blue-400/80" style={{ height: `${height}%`, opacity: 0.55 + index * 0.07 }} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-sm font-semibold text-slate-950">Customer-ready reporting</p>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Wet Chemical System Acceptance Test</p>
                              <p className="text-sm text-slate-500">NFPA 17A • Ready for PDF</p>
                            </div>
                            <FileText className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-3">
                            <StatChip label="Pass" value="8" />
                            <StatChip label="Fail" value="1" />
                            <StatChip label="Signed" value="2/2" />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                          <ClipboardCheck className="h-5 w-5 text-emerald-600" />
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Finalized and posted to portal</p>
                            <p className="text-sm text-slate-500">Hosted report + inspection packet available</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScreenshotCard>

              <ScreenshotCard className="mt-5 min-h-[220px] lg:absolute lg:-left-8 lg:top-10 lg:mt-0 lg:w-[290px]" title="Technician Mobile">
                <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-4 text-white">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Field workflow</p>
                    <Smartphone className="h-5 w-5 text-blue-300" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      "Capture extinguisher photos",
                      "Collect technician signature",
                      "Save offline when signal drops"
                    ].map((item) => (
                      <div key={item} className="rounded-2xl bg-white/10 px-3 py-3 text-sm text-white/85">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </ScreenshotCard>

              <ScreenshotCard className="mt-5 min-h-[220px] lg:absolute lg:-bottom-8 lg:right-0 lg:mt-0 lg:w-[320px]" title="Billing Resolution">
                <div className="space-y-3">
                  {[
                    ["Bill to", "Commercial Fire"],
                    ["Pricing source", "Provider contract rate"],
                    ["Grouping", "Monthly rollup ready"]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p>
                    </div>
                  ))}
                </div>
              </ScreenshotCard>
            </div>
          </div>
        </div>
      </SectionContainer>
    </section>
  );
}
