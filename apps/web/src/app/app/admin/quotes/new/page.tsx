import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays } from "date-fns";

import { auth } from "@/auth";
import { DEFAULT_QUOTE_EXPIRATION_DAYS, getQuoteFormOptions } from "@testworx/lib";

import { AppPageShell, PageHeader } from "../../operations-ui";
import { createQuoteAction } from "../actions";
import { QuoteEditorForm } from "../quote-editor-form";

export default async function NewQuotePage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const options = await getQuoteFormOptions({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });

  return (
    <AppPageShell>
      <PageHeader
        eyebrow="Quotes"
        title="Create quote"
        description="Build a draft quote with structured line items, branded totals, and the QuickBooks mapping context needed for clean sync."
        actions={
          <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" href="/app/admin/quotes">
            Back to quotes
          </Link>
        }
      />

      {params.error ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{params.error}</div>
      ) : null}

      <QuoteEditorForm
        action={createQuoteAction}
        catalog={options.catalog}
        customers={options.customers}
        initialValue={{
          customerCompanyId: "",
          siteId: "",
          contactName: "",
          recipientEmail: "",
          issuedAt: new Date().toISOString().slice(0, 10),
          expiresAt: addDays(new Date(), DEFAULT_QUOTE_EXPIRATION_DAYS).toISOString().slice(0, 10),
          internalNotes: "",
          customerNotes: "",
          taxAmount: 0,
          lineItems: [
            {
              internalCode: "",
              title: "",
              description: "",
              quantity: 1,
              unitPrice: 0,
              discountAmount: 0,
              taxable: false,
              inspectionType: null,
              category: null
            }
          ]
        }}
        sites={options.sites}
        submitLabel="Save draft quote"
      />
    </AppPageShell>
  );
}
