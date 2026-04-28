import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";

import {
  buildQuotePresentationLineItems,
  buildQuoteProjectSummary,
  buildTenantBrandingCss,
  getCustomerFacingSiteLabel,
  getHostedQuoteDetailByToken,
  getQuoteStatusTone,
  groupQuotePresentationLineItems,
  hostedQuoteStateLabels,
  quoteStatusLabels,
  resolveTenantBranding
} from "@testworx/lib/server/index";

import { approveQuoteFromHostedPage, declineQuoteFromHostedPage } from "./actions";
import { ProposalActionBanner, ProposalHero, QuoteStatusBadge, TotalSummaryCard } from "../../quote-proposal-sections";
import { QuoteProjectTermsCard } from "../../quote-project-terms-card";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatQuoteDate(value: Date | null | undefined) {
  return value ? format(value, "MMM d, yyyy") : "—";
}

function BrandedMark({
  companyName,
  logoDataUrl
}: {
  companyName: string;
  logoDataUrl: string;
}) {
  if (logoDataUrl) {
    return (
      <Image
        alt={`${companyName} logo`}
        className="h-16 w-auto max-w-[250px] object-contain"
        src={logoDataUrl}
        unoptimized
        width={250}
        height={64}
      />
    );
  }

  return (
    <div className="flex h-16 min-w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-xl font-semibold tracking-[-0.03em] text-slate-950 shadow-sm">
      {companyName}
    </div>
  );
}

function ApprovalForm({
  canRespond,
  token,
  primaryColor,
  accentColor,
  accessState
}: {
  canRespond: boolean;
  token: string;
  primaryColor: string;
  accentColor: string;
  accessState: keyof typeof hostedQuoteStateLabels;
}) {
  if (!canRespond) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5 text-sm leading-7 text-slate-600">
        {accessState === "approved" ? "This proposal has already been approved. Our office will follow up with next steps." : null}
        {accessState === "declined" ? "This proposal has already been declined. Contact us if you'd like an updated version." : null}
        {accessState === "expired" ? "This proposal has expired. Contact us if you'd like us to refresh and resend it." : null}
        {accessState === "cancelled" ? "This proposal is no longer active. Reach out to your TradeWorx contact if you need assistance." : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <form action={approveQuoteFromHostedPage} className="rounded-[24px] border border-slate-200 bg-slate-50/55 p-5">
        <input name="token" type="hidden" value={token} />
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700">Approve Proposal</p>
        <p className="mt-3 text-sm leading-7 text-slate-600">Approval confirms acceptance of the project scope, pricing, and terms outlined in this proposal.</p>
        <textarea
          className="mt-4 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          name="note"
          placeholder="Optional approval note or scheduling preference"
        />
        <button
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-5 py-3.5 text-base font-semibold text-white shadow-[0_16px_40px_rgba(15,23,42,0.14)] transition hover:brightness-105"
          style={{ backgroundColor: primaryColor }}
          type="submit"
        >
          Approve Proposal
        </button>
      </form>

      <form action={declineQuoteFromHostedPage} className="rounded-[24px] border border-slate-200 bg-slate-50/55 p-5">
        <input name="token" type="hidden" value={token} />
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700">Request Changes / Decline</p>
        <p className="mt-3 text-sm leading-7 text-slate-600">If something should be revised before approval, let us know and we can update the proposal.</p>
        <textarea
          className="mt-4 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          name="note"
          placeholder="Optional reason for declining or requested changes"
        />
        <button
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border bg-white px-5 py-3 text-sm font-semibold transition hover:bg-slate-50"
          style={{ borderColor: `${accentColor}33`, color: accentColor }}
          type="submit"
        >
          Decline Proposal
        </button>
      </form>
    </div>
  );
}

export default async function HostedQuotePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ response?: string; error?: string }>;
}) {
  const { token } = await params;
  const query = searchParams ? await searchParams : {};
  const result = await getHostedQuoteDetailByToken(token);

  if (!result.quote) {
    return (
      <main className="min-h-screen bg-slate-100 px-6 py-12">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Proposal unavailable</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">This proposal link is no longer available.</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">The secure proposal link may have expired, been replaced, or is no longer active. Reach out to your contact if you need a fresh copy.</p>
        </div>
      </main>
    );
  }

  const quote = result.quote;
  const branding = resolveTenantBranding({
    tenantName: quote.tenant.name,
    branding: quote.tenant.branding,
    billingEmail: quote.tenant.billingEmail
  });
  const primaryColor = branding.primaryColor || "#1E3A5F";
  const accentColor = branding.accentColor || "#C2410C";
  const quoteStatusTone = getQuoteStatusTone(quote.effectiveStatus);
  const hostedStateTone = result.accessState === "approved"
    ? "emerald"
    : result.accessState === "declined" || result.accessState === "cancelled"
      ? "rose"
      : result.accessState === "expired"
        ? "amber"
        : "blue";
  const companyContact = [branding.phone, branding.email].filter(Boolean).join("  |  ");
  const customerFacingSiteName = getCustomerFacingSiteLabel(quote.site?.name);
  const locationLine = customerFacingSiteName
    ? [
        quote.site?.addressLine1,
        quote.site?.addressLine2,
        [quote.site?.city, quote.site?.state, quote.site?.postalCode].filter(Boolean).join(" ")
      ].filter(Boolean).join(", ")
    : "";
  const customerFacingLineItems = buildQuotePresentationLineItems(quote.lineItems);
  const groupedLineItems = groupQuotePresentationLineItems(customerFacingLineItems);
  const summaryLine = buildQuoteProjectSummary(quote.lineItems, quote.proposalType);
  const actionMessage = quote.canRespond
    ? quote.includeDepositRequirement
      ? "Please review the proposal details below before approving. A 30% deposit is required before planning, engineering, or design submittals begin."
      : "Please review the proposal details below before approving."
    : result.accessState === "approved"
      ? "This proposal has already been approved."
      : result.accessState === "expired"
        ? "This proposal has expired. Contact us if you'd like an updated version."
        : "This proposal is no longer awaiting action.";

  return (
    <main
      className="min-h-screen bg-[linear-gradient(180deg,rgba(var(--tenant-primary-rgb),0.08),rgba(255,255,255,0.96)_22%,#f8fafc_100%)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      style={buildTenantBrandingCss(branding)}
    >
      <div className="mx-auto max-w-[1240px] space-y-6">
        <section className="overflow-hidden rounded-[36px] border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="px-6 py-8 lg:px-10 lg:py-9">
            <div className="flex flex-col gap-7 border-b border-slate-200 pb-7 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 lg:max-w-[48%]">
                <BrandedMark companyName={branding.legalBusinessName} logoDataUrl={branding.logoDataUrl} />
                <div className="mt-4 space-y-2">
                  <p className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">{branding.legalBusinessName}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    {companyContact ? <span>{companyContact}</span> : null}
                    {branding.website ? (
                      <Link className="font-medium" href={branding.website} target="_blank">
                        {branding.website.replace(/^https?:\/\//, "")}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 rounded-[28px] border border-slate-200 bg-slate-50/70 p-5 sm:grid-cols-2 lg:min-w-[460px]">
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Proposal</p>
                  <p className="mt-2 text-[2rem] font-semibold tracking-[-0.04em] text-slate-950">Project Proposal</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Proposal number</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{quote.quoteNumber}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Issue date</p>
                  <p className="mt-2 text-base font-medium text-slate-900">{formatQuoteDate(quote.issuedAt)}</p>
                </div>
                {quote.expiresAt ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Expiration date</p>
                    <p className="mt-2 text-base font-medium text-slate-900">{formatQuoteDate(quote.expiresAt)}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <QuoteStatusBadge label={quoteStatusLabels[quote.effectiveStatus]} tone={quoteStatusTone} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              <ProposalHero
                contactName={quote.contactName ?? quote.customerCompany.contactName ?? null}
                customerName={quote.customerCompany.name}
                expiresAtLabel={formatQuoteDate(quote.expiresAt)}
                hostedState={result.accessState}
                hostedStateTone={hostedStateTone}
                phone={quote.customerCompany.phone}
                projectName={customerFacingSiteName}
                quoteStatus={quote.effectiveStatus}
                quoteStatusTone={quoteStatusTone}
                summaryLine={summaryLine}
                total={quote.total}
              />

              <ProposalActionBanner
                canRespond={quote.canRespond}
                href="#approval-section"
                primaryColor={primaryColor}
                statusMessage={actionMessage}
              />

              {query.error ? (
                <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{query.error}</div>
              ) : null}
              {query.response === "approved" ? (
                <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">Proposal approved successfully. Our office will follow up with next steps.</div>
              ) : null}
              {query.response === "declined" ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">This proposal was declined. If something needs to be adjusted, please contact us and we can update it.</div>
              ) : null}

              <section className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] lg:p-8">
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Proposal Summary</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Project overview</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">This proposal is prepared for the customer and project details below.</p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5 text-sm leading-7 text-slate-600">
                    <p className="font-semibold text-slate-950">{summaryLine}</p>
                    <p className="mt-2">Please review the proposal details below. Once reviewed, you can approve the proposal online.</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Customer</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{quote.customerCompany.name}</p>
                  </div>
                  {(quote.contactName ?? quote.customerCompany.contactName ?? quote.recipientEmail) ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Contact</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{quote.contactName ?? quote.customerCompany.contactName ?? quote.recipientEmail}</p>
                    </div>
                  ) : null}
                  {quote.customerCompany.phone ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Phone</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{quote.customerCompany.phone}</p>
                    </div>
                  ) : null}
                  {customerFacingSiteName ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Project / Site</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{customerFacingSiteName}</p>
                      {locationLine ? <p className="mt-1 text-sm text-slate-600">{locationLine}</p> : null}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] lg:p-8">
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Scope & Pricing</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Included work</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">This proposal includes the labor, materials, and services listed below.</p>
                  </div>
                  <div className="flex items-start justify-end">
                    <a
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      href={`/api/quotes/access/${token}/pdf`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Download PDF
                    </a>
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  {groupedLineItems.map((group) => (
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50/45 p-5" key={group.title}>
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700">{group.title}</p>
                      <div className="mt-4 space-y-3">
                        {group.items.map((line) => (
                          <div className="rounded-[20px] border border-slate-200 bg-white p-4" key={line.id ?? `${group.title}-${line.title}`}>
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="text-base font-semibold text-slate-950">{line.title}</p>
                                {line.description ? <p className="mt-2 text-sm leading-7 text-slate-600">{line.description}</p> : null}
                              </div>
                              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm sm:grid-cols-3 lg:min-w-[360px]">
                                <div className="space-y-1">
                                  <p className="text-slate-500">Qty</p>
                                  <p className="font-medium text-slate-900">{line.quantity ?? 1}</p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-slate-500">Unit Price</p>
                                  <p className="font-medium text-slate-900">{formatMoney(line.unitPrice ?? 0)}</p>
                                </div>
                                <div className="space-y-1 border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                                  <p className="text-slate-700">Line Total</p>
                                  <p className="font-semibold text-slate-950">{formatMoney(line.total ?? 0)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className={`grid gap-5 ${quote.includeDepositRequirement ? "xl:grid-cols-[1fr_320px]" : "xl:justify-end"}`}>
                    {quote.includeDepositRequirement ? (
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Deposit Requirement</p>
                        <p className="mt-3 text-sm leading-7 text-slate-700">A 30% deposit is required before planning, engineering, or design submittals begin.</p>
                      </div>
                    ) : null}
                    <TotalSummaryCard primaryColor={primaryColor} subtotal={quote.subtotal} tax={quote.taxAmount} total={quote.total} />
                  </div>
                </div>
              </section>

              <QuoteProjectTermsCard customerNotes={quote.customerNotes} includeDepositRequirement={quote.includeDepositRequirement} primaryColor={primaryColor} />

              <section className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] lg:p-8" id="approval-section">
                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Approval</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Accept this proposal</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">This proposal outlines the project scope, pricing, and terms. Approval confirms acceptance of this work.</p>
                    <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/60 p-5">
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700">Customer support</p>
                      <p className="mt-3 text-sm leading-7 text-slate-600">If anything needs to be adjusted before approval, reply to the proposal email or contact {branding.legalBusinessName} directly.</p>
                      <div className="mt-4 space-y-2 text-sm text-slate-600">
                        {branding.email ? <p>{branding.email}</p> : null}
                        {branding.phone ? <p>{branding.phone}</p> : null}
                        {branding.website ? (
                          <Link className="font-semibold" href={branding.website} style={{ color: primaryColor }} target="_blank">
                            {branding.website.replace(/^https?:\/\//, "")}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <ApprovalForm
                    accessState={result.accessState}
                    accentColor={accentColor}
                    canRespond={quote.canRespond}
                    primaryColor={primaryColor}
                    token={token}
                  />
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
