"use client";

import { hostedQuoteStateLabels, quoteStatusLabels } from "@testworx/lib";

type QuoteStatusValue = keyof typeof quoteStatusLabels;

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function QuoteStatusBadge({
  label,
  tone
}: {
  label: string;
  tone: "slate" | "blue" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700"
  } as const;

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tones[tone]}`}>
      {label}
    </span>
  );
}

export function ProposalHero({
  customerName,
  projectName,
  contactName,
  phone,
  summaryLine,
  total,
  expiresAtLabel,
  quoteStatus,
  quoteStatusTone,
  hostedState,
  hostedStateTone
}: {
  customerName: string;
  projectName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  summaryLine: string;
  total: number;
  expiresAtLabel: string;
  quoteStatus: QuoteStatusValue;
  quoteStatusTone: "slate" | "blue" | "emerald" | "amber" | "rose";
  hostedState: keyof typeof hostedQuoteStateLabels;
  hostedStateTone: "slate" | "blue" | "emerald" | "amber" | "rose";
}) {
  return (
    <section className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)] lg:p-8">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Project Proposal</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-[2.6rem]">{customerName}</h1>
          {projectName ? <p className="mt-2 text-lg font-medium text-slate-600">{projectName}</p> : null}
          <p className="mt-5 text-base font-medium text-slate-900">{summaryLine}</p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            {contactName ? <span>{contactName}</span> : null}
            {phone ? <span>{phone}</span> : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-slate-50/75 p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Proposal Total</p>
          <p className="mt-3 text-5xl font-semibold tracking-[-0.06em] text-slate-950">{formatMoney(total)}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <QuoteStatusBadge label={quoteStatusLabels[quoteStatus]} tone={quoteStatusTone} />
            <QuoteStatusBadge label={hostedQuoteStateLabels[hostedState]} tone={hostedStateTone} />
          </div>
          <p className="mt-5 text-sm font-medium text-slate-900">Expires {expiresAtLabel}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">Please review the proposal details below. You can approve online once ready.</p>
        </div>
      </div>
    </section>
  );
}

export function ProposalActionBanner({
  canRespond,
  href,
  primaryColor,
  statusMessage
}: {
  canRespond: boolean;
  href: string;
  primaryColor: string;
  statusMessage: string;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Next Step</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            {canRespond ? "Review & Approve Proposal" : "Proposal Status"}
          </h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">{statusMessage}</p>
        </div>
        {canRespond ? (
          <a
            className="inline-flex min-h-12 items-center justify-center rounded-2xl px-6 py-3 text-base font-semibold text-white shadow-[0_16px_40px_rgba(15,23,42,0.14)] transition hover:brightness-105"
            href={href}
            style={{ backgroundColor: primaryColor }}
          >
            Review & Approve Proposal
          </a>
        ) : null}
      </div>
    </section>
  );
}

export function TotalSummaryCard({
  subtotal,
  tax,
  total,
  primaryColor
}: {
  subtotal: number;
  tax: number;
  total: number;
  primaryColor: string;
}) {
  return (
    <section
      className="rounded-[28px] border p-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
      style={{ backgroundColor: primaryColor, borderColor: `${primaryColor}22` }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">Totals</p>
      <p className="mt-3 text-5xl font-semibold tracking-[-0.06em]">{formatMoney(total)}</p>
      <div className="mt-7 space-y-4 text-sm">
        <div className="flex items-center justify-between text-white/72">
          <span>Subtotal</span>
          <span className="font-semibold text-white">{formatMoney(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-white/72">
          <span>Tax</span>
          <span className="font-semibold text-white">{formatMoney(tax)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-white/15 pt-5 text-lg">
          <span className="text-white/88">Total</span>
          <span className="text-2xl font-semibold text-white">{formatMoney(total)}</span>
        </div>
      </div>
    </section>
  );
}
