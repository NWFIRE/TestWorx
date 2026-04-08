import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getCustomerQuoteDetail, getQuoteStatusTone, quoteStatusLabels } from "@testworx/lib";

import { AppPageShell, EmptyState, PageHeader, SectionCard, StatusBadge } from "../../../admin/operations-ui";

export default async function CustomerQuoteDetailPage({
  params
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "customer_user") {
    redirect("/app");
  }

  const { quoteId } = await params;
  const quote = await getCustomerQuoteDetail({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, quoteId);
  if (!quote) {
    redirect("/app/customer");
  }

  return (
    <AppPageShell>
      <PageHeader
        eyebrow="Customer quote"
        title={quote.quoteNumber}
        description="Review quoted work, totals, and the current approval state from one place."
        actions={
          <>
            <a className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" href={`/api/quotes/${quote.id}/pdf`} target="_blank">
              Download PDF
            </a>
            {quote.hostedQuoteUrl ? (
              <a className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110" href={quote.hostedQuoteUrl} rel="noreferrer" target="_blank">
                Open hosted quote
              </a>
            ) : null}
            <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" href="/app/customer">
              Back to portal
            </Link>
          </>
        }
      />

      <SectionCard>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={quoteStatusLabels[quote.effectiveStatus]} tone={getQuoteStatusTone(quote.effectiveStatus)} />
          <p className="text-sm text-slate-500">Issued {format(quote.issuedAt, "MMM d, yyyy")}</p>
          <p className="text-sm text-slate-500">Expires {quote.expiresAt ? format(quote.expiresAt, "MMM d, yyyy") : "—"}</p>
          <p className="text-sm text-slate-500">Total ${quote.total.toFixed(2)}</p>
        </div>
      </SectionCard>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <SectionCard>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Quoted work</h2>
          <div className="mt-4 space-y-3">
            {quote.lineItems.map((line) => (
              <div key={line.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-950">{line.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{line.description ?? "—"}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-950">${line.total.toFixed(2)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                  <span>Qty {line.quantity}</span>
                  <span>Unit ${line.unitPrice.toFixed(2)}</span>
                  <span>Code {line.internalCode}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard>
            <h2 className="text-xl font-semibold text-slate-950">Totals</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-950">${quote.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Tax</span>
                <span className="font-semibold text-slate-950">${quote.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-950">
                <span>Total</span>
                <span>${quote.total.toFixed(2)}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="text-xl font-semibold text-slate-950">Notes</h2>
            {quote.customerNotes ? (
              <p className="mt-3 text-sm leading-7 text-slate-600">{quote.customerNotes}</p>
            ) : (
              <EmptyState className="mt-3" description="No customer-facing notes were added to this quote." title="No quote notes" />
            )}
          </SectionCard>

          <SectionCard>
            <h2 className="text-xl font-semibold text-slate-950">Response activity</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>First viewed</span>
                <span className="font-semibold text-slate-950">{quote.firstViewedAt ? format(quote.firstViewedAt, "MMM d, yyyy h:mm a") : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Last viewed</span>
                <span className="font-semibold text-slate-950">{quote.lastViewedAt ? format(quote.lastViewedAt, "MMM d, yyyy h:mm a") : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Approval state</span>
                <span className="font-semibold text-slate-950">{quote.approvedAt ? "Approved" : quote.declinedAt ? "Declined" : "Awaiting response"}</span>
              </div>
              {quote.customerResponseNote ? (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 leading-7 text-slate-600">{quote.customerResponseNote}</p>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </section>
    </AppPageShell>
  );
}
