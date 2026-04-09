import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";

import {
  buildTenantBrandingCss,
  getHostedQuoteDetailByToken,
  getQuoteStatusTone,
  hostedQuoteStateLabels,
  quoteStatusLabels,
  resolveTenantBranding
} from "@testworx/lib";

import { approveQuoteFromHostedPage, declineQuoteFromHostedPage } from "./actions";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatQuoteDate(value: Date | null | undefined) {
  return value ? format(value, "MMM d, yyyy") : "—";
}

function HostedQuoteBadge({
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

function SummaryField({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function ResponseCtas({
  canRespond,
  token,
  primaryColor,
  accentColor
}: {
  canRespond: boolean;
  token: string;
  primaryColor: string;
  accentColor: string;
}) {
  if (!canRespond) {
    return null;
  }

  return (
    <div className="space-y-4">
      <form action={approveQuoteFromHostedPage} className="space-y-3">
        <input name="token" type="hidden" value={token} />
        <textarea
          className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          name="note"
          placeholder="Optional approval note or scheduling preference"
        />
        <button
          className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-5 py-3.5 text-base font-semibold text-white shadow-[0_16px_40px_rgba(15,23,42,0.14)] transition hover:brightness-105"
          style={{ backgroundColor: primaryColor }}
          type="submit"
        >
          Approve Quote
        </button>
        <p className="text-center text-sm text-slate-500">Approve this quote to proceed with scheduling and service.</p>
      </form>

      <form action={declineQuoteFromHostedPage} className="space-y-3">
        <input name="token" type="hidden" value={token} />
        <textarea
          className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          name="note"
          placeholder="Optional reason for declining or requested changes"
        />
        <button
          className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border bg-white px-5 py-3 text-sm font-semibold transition hover:bg-slate-50"
          style={{ borderColor: `${accentColor}33`, color: accentColor }}
          type="submit"
        >
          Decline Quote
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
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Quote unavailable</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">This quote link is no longer available.</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">The secure quote link may have expired, been replaced, or is no longer active. Reach out to your TradeWorx contact if you need a fresh copy.</p>
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
  const stateTone = result.accessState === "approved"
    ? "emerald"
    : result.accessState === "declined" || result.accessState === "cancelled"
      ? "rose"
      : result.accessState === "expired"
        ? "amber"
        : "blue";

  const summaryFields = [
    { label: "Customer", value: quote.customerCompany.name },
    quote.contactName || quote.customerCompany.contactName || quote.recipientEmail
      ? { label: "Contact", value: quote.contactName ?? quote.customerCompany.contactName ?? quote.recipientEmail ?? "" }
      : null,
    quote.customerCompany.phone ? { label: "Phone", value: quote.customerCompany.phone } : null,
    quote.site?.name ? { label: "Site", value: quote.site.name } : null,
    { label: "Issued", value: formatQuoteDate(quote.issuedAt) },
    quote.expiresAt ? { label: "Expiration", value: formatQuoteDate(quote.expiresAt) } : null
  ].filter((field): field is { label: string; value: string } => Boolean(field));

  return (
    <main
      className="min-h-screen bg-[linear-gradient(180deg,rgba(var(--tenant-primary-rgb),0.09),rgba(255,255,255,0.95)_26%,#f8fafc_100%)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      style={buildTenantBrandingCss(branding)}
    >
      <div className="mx-auto max-w-[1220px]">
        <section className="overflow-hidden rounded-[36px] border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="px-6 py-8 lg:px-10 lg:py-9">
            <div className="flex flex-col gap-7 border-b border-slate-200 pb-7 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 lg:max-w-[46%]">
                <BrandedMark companyName={branding.legalBusinessName} logoDataUrl={branding.logoDataUrl} />
                <div className="mt-4 space-y-1.5">
                  <p className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">{branding.legalBusinessName}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    {branding.phone ? <span>{branding.phone}</span> : null}
                    {branding.email ? <span>{branding.email}</span> : null}
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quote</p>
                  <p className="mt-2 text-[2rem] font-semibold tracking-[-0.04em] text-slate-950">Customer Quote</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quote number</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{quote.quoteNumber}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Issue date</p>
                  <p className="mt-2 text-base font-medium text-slate-900">{formatQuoteDate(quote.issuedAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Expiration</p>
                  <p className="mt-2 text-base font-medium text-slate-900">{formatQuoteDate(quote.expiresAt)}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-5 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Status</p>
                <div className="mt-3 flex justify-center">
                  <HostedQuoteBadge label={quoteStatusLabels[quote.effectiveStatus]} tone={getQuoteStatusTone(quote.effectiveStatus)} />
                </div>
                <div className="mt-2 flex justify-center">
                  <HostedQuoteBadge label={hostedQuoteStateLabels[result.accessState]} tone={stateTone} />
                </div>
              </div>
              <div
                className="rounded-[24px] border px-5 py-5 text-center shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
                style={{ borderColor: `${primaryColor}33`, backgroundColor: "rgba(255,255,255,0.98)" }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Total</p>
                <p className="mt-3 text-5xl font-semibold tracking-[-0.06em] text-slate-950">{formatMoney(quote.total)}</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-5 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Expiration date</p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-slate-950">{formatQuoteDate(quote.expiresAt)}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-6 pb-9 lg:grid-cols-[1.42fr_0.78fr] lg:px-10">
            <div className="space-y-5">
              {query.error ? (
                <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{query.error}</div>
              ) : null}
              {query.response === "approved" ? (
                <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">Quote approved successfully. Our office will follow up with next steps.</div>
              ) : null}
              {query.response === "declined" ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">This quote was declined. If something needs to be adjusted, please contact us and we can update it.</div>
              ) : null}

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 lg:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Quote summary</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Review scope and customer details</h2>
                  </div>
                  <p className="text-sm leading-7 text-slate-600">Clear pricing, streamlined approval, and a downloadable PDF if you need to share it internally.</p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {summaryFields.map((field) => (
                    <SummaryField key={field.label} label={field.label} value={field.value} />
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5 lg:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Line items</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Quoted work</h2>
                    <p className="mt-2 text-sm leading-7 text-slate-600">This quote outlines the services and materials required for your site.</p>
                  </div>
                  <a
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    href={`/api/quotes/access/${token}/pdf`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Download PDF
                  </a>
                </div>

                <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200/90">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-slate-50/90">
                      <tr className="border-b border-slate-200">
                        <th className="px-5 py-4 text-left font-semibold text-slate-500">Service</th>
                        <th className="px-5 py-4 text-left font-semibold text-slate-500">Description</th>
                        <th className="px-5 py-4 text-right font-semibold text-slate-500">Qty</th>
                        <th className="px-5 py-4 text-right font-semibold text-slate-500">Unit Price</th>
                        <th className="px-5 py-4 text-right font-semibold text-slate-500">Total</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {quote.lineItems.map((line, index) => (
                        <tr className={index < quote.lineItems.length - 1 ? "border-b border-slate-200/80" : ""} key={line.id}>
                          <td className="px-5 py-4 align-top">
                            <p className="font-semibold text-slate-950">{line.title}</p>
                          </td>
                          <td className="px-5 py-4 align-top text-slate-600">{line.description?.trim() || "—"}</td>
                          <td className="px-5 py-4 text-right align-top text-slate-600">{line.quantity}</td>
                          <td className="px-5 py-4 text-right align-top text-slate-600">{formatMoney(line.unitPrice)}</td>
                          <td className="px-5 py-4 text-right align-top font-semibold text-slate-950">{formatMoney(line.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {quote.customerNotes ? (
                  <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/60 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Notes</p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{quote.customerNotes}</p>
                  </div>
                ) : null}

                {quote.canRespond ? (
                  <div className="mt-5 rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(var(--tenant-primary-rgb),0.05),rgba(255,255,255,0.98))] p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Ready to move forward?</p>
                        <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Approve the quote and we will take care of next steps.</h3>
                        <p className="mt-2 text-sm text-slate-600">Review the details below and approve when ready.</p>
                      </div>
                      <button
                        className="inline-flex min-h-12 items-center justify-center rounded-2xl px-6 py-3 text-base font-semibold text-white shadow-[0_16px_40px_rgba(15,23,42,0.14)] transition hover:brightness-105"
                        formAction={approveQuoteFromHostedPage}
                        formMethod="post"
                        formNoValidate
                        style={{ backgroundColor: primaryColor }}
                        type="submit"
                      >
                        Approve Quote
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>

            <aside className="space-y-5">
              <section
                className="rounded-[28px] border p-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
                style={{ backgroundColor: primaryColor, borderColor: `${primaryColor}22` }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">Totals</p>
                <p className="mt-3 text-5xl font-semibold tracking-[-0.06em]">{formatMoney(quote.total)}</p>
                <div className="mt-7 space-y-4 text-sm">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Subtotal</span>
                    <span className="font-semibold text-white">{formatMoney(quote.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Tax</span>
                    <span className="font-semibold text-white">{formatMoney(quote.taxAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/15 pt-5 text-lg">
                    <span className="text-white/85">Total</span>
                    <span className="text-2xl font-semibold text-white">{formatMoney(quote.total)}</span>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Approval</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Respond to this quote</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">Approve the quote to let our office move forward, or decline it if you&apos;d like us to revise the scope or timing.</p>
                <p className="mt-2 text-sm text-slate-500">Review the details below and approve when ready.</p>

                {quote.canRespond ? (
                  <div className="mt-5">
                    <ResponseCtas accentColor={accentColor} canRespond={quote.canRespond} primaryColor={primaryColor} token={token} />
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    {result.accessState === "approved" ? "This quote has already been approved. Our office will follow up with next steps." : null}
                    {result.accessState === "declined" ? "This quote has already been declined. Contact us if you&apos;d like an updated version." : null}
                    {result.accessState === "expired" ? "This quote has expired. Contact us if you&apos;d like us to refresh and resend it." : null}
                    {result.accessState === "cancelled" ? "This quote is no longer active. Reach out to your TradeWorx contact if you need assistance." : null}
                  </div>
                )}
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Need help?</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Questions before approval</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">If anything needs to be adjusted before approval, reply to the quote email or contact {branding.legalBusinessName} directly.</p>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  {branding.email ? <p>{branding.email}</p> : null}
                  {branding.phone ? <p>{branding.phone}</p> : null}
                  {branding.website ? (
                    <Link className="font-semibold" href={branding.website} style={{ color: primaryColor }} target="_blank">
                      {branding.website.replace(/^https?:\/\//, "")}
                    </Link>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
