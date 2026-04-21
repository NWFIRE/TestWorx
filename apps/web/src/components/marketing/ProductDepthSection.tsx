import { Layers3, ShieldCheck, WifiOff } from "lucide-react";

import { ScreenshotCard } from "./shared/ScreenshotCard";
import { SectionContainer } from "./shared/SectionContainer";
import { SectionHeading } from "./shared/SectionHeading";

export function ProductDepthSection() {
  return (
    <section className="py-20 xl:py-24">
      <SectionContainer>
        <SectionHeading title="A system your team will actually want to use" />
        <div className="mt-10 grid grid-cols-12 items-start gap-6 md:mt-12 xl:gap-8">
          <div className="col-span-12 lg:col-span-7">
            <ScreenshotCard className="min-h-[420px]" title="Operations workspace">
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    ["Open inspections", "42"],
                    ["Reports finalized", "18"],
                    ["Billing ready", "9"]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-sm font-semibold text-slate-950">Today&apos;s inspection queue</p>
                    <div className="mt-4 space-y-3">
                      {[
                        ["Main campus", "Fire alarm annual", "Assigned"],
                        ["South warehouse", "Deficiency follow-up", "Due now"],
                        ["Downtown kitchen", "Suppression inspection", "Unassigned"]
                      ].map(([site, task, status]) => (
                        <div key={site} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{site}</p>
                            <p className="truncate text-sm text-slate-500">{task}</p>
                          </div>
                          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">{status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-950 p-5 text-white">
                    <p className="text-sm font-semibold">Office + field in sync</p>
                    <div className="mt-5 space-y-4">
                      <div className="flex items-start gap-3 rounded-2xl bg-white/10 px-4 py-3">
                        <Layers3 className="mt-0.5 h-5 w-5 text-blue-300" />
                        <div>
                          <p className="text-sm font-semibold">Zero-clutter workspace</p>
                          <p className="mt-1 text-sm text-white/75">Dense enough for office teams, calm enough for daily use.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-2xl bg-white/10 px-4 py-3">
                        <WifiOff className="mt-0.5 h-5 w-5 text-blue-300" />
                        <div>
                          <p className="text-sm font-semibold">Field-friendly on weak signal</p>
                          <p className="mt-1 text-sm text-white/75">Technicians keep moving even when connectivity is unreliable.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-2xl bg-white/10 px-4 py-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-300" />
                        <div>
                          <p className="text-sm font-semibold">Customer-facing trust</p>
                          <p className="mt-1 text-sm text-white/75">Reports, packets, and portal surfaces feel polished and professional.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScreenshotCard>
          </div>

          <div className="col-span-12 flex flex-col gap-6 lg:col-span-5">
            <ScreenshotCard className="min-h-[204px]" title="Hosted reports">
              <div className="space-y-3">
                {["Outcome hero and summary strip", "Findings and deficiency detail", "Inspection packet links in context"].map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">{item}</div>
                ))}
              </div>
            </ScreenshotCard>
            <ScreenshotCard className="min-h-[204px]" title="Manuals and field reference">
              <div className="grid gap-3 sm:grid-cols-2">
                {["Wet Chemical", "Industrial Dry Chemical", "Favorites", "Recent manuals"].map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm font-medium text-slate-700">{item}</div>
                ))}
              </div>
            </ScreenshotCard>
          </div>
        </div>
        <div className="mt-8 max-w-3xl">
          <p className="text-base leading-7 text-slate-600 md:text-lg md:leading-8">
            Fast, modern, zero-clutter UI designed for office teams and field technicians alike. TradeWorx keeps the workflow structured without making the day feel heavier.
          </p>
        </div>
      </SectionContainer>
    </section>
  );
}
