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
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${tones[tone]}`}>
      {label}
    </span>
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
  const stateTone = result.accessState === "approved"
    ? "emerald"
    : result.accessState === "declined" || result.accessState === "cancelled"
      ? "rose"
      : result.accessState === "expired"
        ? "amber"
        : "blue";

  return (
    <main
      className="min-h-screen bg-[linear-gradient(180deg,rgba(var(--tenant-primary-rgb),0.08),rgba(255,255,255,0.92)_28%,#f8fafc_100%)] px-4 py-8 sm:px-6 lg:px-8"
      style={buildTenantBrandingCss(branding)}
    >
      <div className="mx-auto max-w-6xl">
        <section className="overflow-hidden rounded-[36px] border border-slate-200/90 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,rgba(var(--tenant-primary-rgb),0.08),rgba(255,255,255,0.96))] px-6 py-8 lg:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Customer quote</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950 lg:text-4xl">{quote.quoteNumber}</h1>
                <p className="mt-4 text-sm leading-7 text-slate-600">Review the quote details below. When you’re ready, approve the quote and we’ll move forward with the work.</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <HostedQuoteBadge label={quoteStatusLabels[quote.effectiveStatus]} tone={getQuoteStatusTone(quote.effectiveStatus)} />
                  <HostedQuoteBadge label={hostedQuoteStateLabels[result.accessState]} tone={stateTone} />
                </div>
              </div>

              <div className="grid gap-3 rounded-[28px] border border-slate-200 bg-white/90 p-5 sm:grid-cols-3 lg:min-w-[420px]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Issued</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{format(quote.issuedAt, "MMM d, yyyy")}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Expires</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">{quote.expiresAt ? format(quote.expiresAt, "MMM d, yyyy") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">${quote.total.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.3fr_0.7fr] lg:px-10">
            <div className="space-y-6">
              {query.error ? (
                <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{query.error}</div>
              ) : null}
              {query.response === "approved" ? (
                <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">Quote approved successfully. Our office will follow up with next steps.</div>
              ) : null}
              {query.response === "declined" ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">This quote was declined. If something needs to be adjusted, please contact us and we can update it.</div>
              ) : null}

              <section className="rounded-[28px] border border-slate-200 bg-slate-50/50 p-5">
                <h2 className="text-xl font-semibold text-slate-950">Quote overview</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer</p>
                    <p className="mt-2 text-base font-semibold text-slate-950">{quote.customerCompany.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{quote.contactName ?? quote.customerCompany.contactName ?? quote.recipientEmail ?? "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Site</p>
                    <p className="mt-2 text-base font-semibold text-slate-950">{quote.site?.name ?? "No site listed"}</p>
                    <p className="mt-1 text-sm text-slate-500">{quote.site ? [quote.site.addressLine1, quote.site.city, quote.site.state].filter(Boolean).join(", ") : "—"}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-slate-950">Quoted work</h2>
                  <a
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    href={`/api/quotes/access/${token}/pdf`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Download PDF
                  </a>
                </div>
                <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500">Service</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500">Description</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500">Qty</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-500">Unit</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-500">Line total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {quote.lineItems.map((line) => (
                        <tr key={line.id}>
                          <td className="px-4 py-4 align-top font-semibold text-slate-950">{line.title}</td>
                          <td className="px-4 py-4 align-top text-slate-600">{line.description ?? "—"}</td>
                          <td className="px-4 py-4 align-top text-slate-600">{line.quantity}</td>
                          <td className="px-4 py-4 align-top text-slate-600">${line.unitPrice.toFixed(2)}</td>
                          <td className="px-4 py-4 text-right align-top font-semibold text-slate-950">${line.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {quote.customerNotes ? (
                <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                  <h2 className="text-xl font-semibold text-slate-950">Notes</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{quote.customerNotes}</p>
                </section>
              ) : null}
            </div>

            <aside className="space-y-6">
              <section className="rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Quote total</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.05em]">${quote.total.toFixed(2)}</p>
                <div className="mt-5 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between"><span>Subtotal</span><span className="font-semibold text-white">${quote.subtotal.toFixed(2)}</span></div>
                  <div className="flex items-center justify-between"><span>Tax</span><span className="font-semibold text-white">${quote.taxAmount.toFixed(2)}</span></div>
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                <h2 className="text-xl font-semibold text-slate-950">Respond to this quote</h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">Approve the quote to let our office move forward, or decline it if you’d like us to revise the scope or timing.</p>

                {quote.canRespond ? (
                  <div className="mt-4 space-y-4">
                    <form action={approveQuoteFromHostedPage} className="space-y-3">
                      <input name="token" type="hidden" value={token} />
                      <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" name="note" placeholder="Optional approval note or scheduling preference" />
                      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#1f4678] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110" type="submit">
                        Approve quote
                      </button>
                    </form>
                    <form action={declineQuoteFromHostedPage} className="space-y-3">
                      <input name="token" type="hidden" value={token} />
                      <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" name="note" placeholder="Optional reason for declining or requested changes" />
                      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" type="submit">
                        Decline quote
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    {result.accessState === "approved" ? "This quote has already been approved. Our office will follow up with next steps." : null}
                    {result.accessState === "declined" ? "This quote has already been declined. Contact us if you'd like an updated version." : null}
                    {result.accessState === "expired" ? "This quote has expired. Contact us if you'd like us to refresh and resend it." : null}
                    {result.accessState === "cancelled" ? "This quote is no longer active. Reach out to your TradeWorx contact if you need assistance." : null}
                  </div>
                )}
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-5">
                <h2 className="text-xl font-semibold text-slate-950">Questions?</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">If anything needs to be adjusted before approval, reply to the quote email or contact {branding.legalBusinessName} directly.</p>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p>{branding.email || "—"}</p>
                  <p>{branding.phone || "—"}</p>
                  {branding.website ? (
                    <Link className="font-semibold text-[#1f4678]" href={branding.website} target="_blank">
                      Visit website
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
