import { redirect } from "next/navigation";
import { addDays } from "date-fns";

import { auth } from "@/auth";
import { DEFAULT_QUOTE_EXPIRATION_DAYS, getQuoteFormOptions, hasQuoteManagementAccess } from "@testworx/lib";

import { AppPageShell, PageHeader } from "../../operations-ui";
import { createQuoteAction } from "../actions";
import { QuoteEditorForm } from "../quote-editor-form";

export default async function NewQuotePage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; customerCompanyId?: string; siteId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!hasQuoteManagementAccess({ role: session.user.role, allowances: session.user.allowances ?? null })) {
    redirect("/app");
  }

  const params = searchParams ? await searchParams : {};
  const options = await getQuoteFormOptions({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId,
    allowances: session.user.allowances ?? null
  });
  const requestedCustomerId = typeof params.customerCompanyId === "string" ? params.customerCompanyId : "";
  const requestedSiteId = typeof params.siteId === "string" ? params.siteId : "";
  const resolvedCustomerId = options.customers.some((customer) => customer.id === requestedCustomerId) ? requestedCustomerId : "";
  const resolvedSiteId = options.sites.some((site) => site.id === requestedSiteId && site.customerCompanyId === resolvedCustomerId)
    ? requestedSiteId
    : "";
  const selectedCustomer = options.customers.find((customer) => customer.id === resolvedCustomerId);

  return (
    <AppPageShell>
      <PageHeader
        backNavigation={{ label: "Back to quotes", fallbackHref: "/app/admin/quotes" }}
        eyebrow="Quotes"
        title="Create quote"
        description="Build a draft quote with structured line items, branded totals, and the QuickBooks mapping context needed for clean sync."
      />

      {params.error ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{params.error}</div>
      ) : null}

      <QuoteEditorForm
        action={createQuoteAction}
        catalog={options.catalog}
        customers={options.customers}
        initialValue={{
          customerCompanyId: resolvedCustomerId,
          siteId: resolvedSiteId,
          contactName: selectedCustomer?.contactName ?? "",
          recipientEmail: selectedCustomer?.billingEmail ?? "",
          proposalType: "",
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
        proposalTypes={options.proposalTypes}
        sites={options.sites}
        submitLabel="Save draft quote"
      />
    </AppPageShell>
  );
}
