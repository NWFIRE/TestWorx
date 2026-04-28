import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getCustomerQuoteDetail, getQuoteStatusTone, quoteStatusLabels } from "@testworx/lib/server/index";

import { AppPageShell, PageHeader, SectionCard, StatusBadge } from "../../../admin/operations-ui";
import { QuoteProjectTermsCard } from "../../../../quote-project-terms-card";

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
    <AppPageShell density="wide">
      <PageHeader
        backNavigation={{ label: "Back to portal", fallbackHref: "/app/customer" }}
        eyebrow="Customer quote"
        title={quote.quoteNumber}
        description="Review quoted work, totals, and the current approval state from one place."
        contentWidth="full"
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
          </>
        }
      />

      <SectionCard>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={quoteStatusLabels[quote.effectiveStatus]} tone={getQuoteStatusTone(quote.effectiveStatus)} />
          <p className="text-sm text-slate-500">Issued {format(quote.issuedAt, "MMM d, yyyy")}</p>
          <p className="text-sm text-slate-500">Expires {quote.expiresAt ? format(quote.expiresAt, "MMM d, yyyy") : "-"}</p>
          <p className="text-sm text-slate-500">Total ${quote.total.toFixed(2)}</p>
        </div>
      </SectionCard>

      <SectionCard>
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Quoted work</h2>
        <div className="mt-4 space-y-3">
          {quote.lineItems.map((line) => (
            <div key={line.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-950">{line.title}</p>
                  <p className="mt-1 text-sm leading-7 text-slate-500">{line.description ?? "-"}</p>
                </div>
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm sm:grid-cols-3 lg:min-w-[360px]">
                  <div className="space-y-1">
                    <p className="text-slate-500">Qty</p>
                    <p className="font-medium text-slate-900">{line.quantity}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-500">Unit</p>
                    <p className="font-medium text-slate-900">${line.unitPrice.toFixed(2)}</p>
                  </div>
                  <div className="space-y-1 border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                    <p className="text-slate-500">Line Total</p>
                    <p className="font-semibold text-slate-950">${line.total.toFixed(2)}</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                <span>Code {line.internalCode}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:justify-end">
        <div className="space-y-6 xl:w-[24rem]">
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

          <QuoteProjectTermsCard customerNotes={quote.customerNotes} includeDepositRequirement={quote.includeDepositRequirement} />

          <SectionCard>
            <h2 className="text-xl font-semibold text-slate-950">Response activity</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>First viewed</span>
                <span className="font-semibold text-slate-950">{quote.firstViewedAt ? format(quote.firstViewedAt, "MMM d, yyyy h:mm a") : "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Last viewed</span>
                <span className="font-semibold text-slate-950">{quote.lastViewedAt ? format(quote.lastViewedAt, "MMM d, yyyy h:mm a") : "-"}</span>
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
      </div>
    </AppPageShell>
  );
}
