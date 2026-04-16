import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getClientProfileData, getTenantBillingContractProfiles, getTenantBillingPayerAccounts } from "@testworx/lib";

import { AppPageShell, PageHeader, SectionCard } from "../../operations-ui";
import { ClientProfileWorkspace } from "../client-profile-workspace";
import { deleteCustomerCompanyAction, updateCustomerCompanyProfileAction } from "../actions";
import { CustomerProfileFields } from "../../settings/customer-management-card";
import { DeleteCustomerCard } from "../delete-customer-card";

export default async function ClientProfilePage({
  params,
  searchParams
}: {
  params: Promise<{ customerId: string }>;
  searchParams?: Promise<{ edit?: string; customer?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  const { customerId } = await params;
  const query = searchParams ? await searchParams : {};
  const actor = {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  };
  const [data, payerAccounts, contractProfiles] = await Promise.all([
    getClientProfileData(actor, customerId),
    getTenantBillingPayerAccounts(actor),
    getTenantBillingContractProfiles(actor)
  ]);

  if (!data) {
    notFound();
  }

  const isEditing = query?.edit === "1";
  const customerNotice = typeof query?.customer === "string" ? query.customer : null;
  const customerSeed = {
    name: data.customer.name,
    contactName: data.customer.contactName,
    billingEmail: data.customer.billingEmail,
    phone: data.customer.phone,
    isTaxExempt: data.customer.isTaxExempt,
    serviceAddressLine1: data.customer.serviceAddressLine1,
    serviceAddressLine2: data.customer.serviceAddressLine2,
    serviceCity: data.customer.serviceCity,
    serviceState: data.customer.serviceState,
    servicePostalCode: data.customer.servicePostalCode,
    serviceCountry: data.customer.serviceCountry,
    billingAddressSameAsService: data.customer.billingAddressSameAsService,
    billingAddressLine1: data.customer.billingAddressLine1,
    billingAddressLine2: data.customer.billingAddressLine2,
    billingCity: data.customer.billingCity,
    billingState: data.customer.billingState,
    billingPostalCode: data.customer.billingPostalCode,
    billingCountry: data.customer.billingCountry,
    notes: data.customer.notes,
    isActive: data.customer.isActive,
    paymentTermsCode: data.customer.paymentTermsCode,
    customPaymentTermsLabel: data.customer.customPaymentTermsLabel,
    customPaymentTermsDays: data.customer.customPaymentTermsDays,
    billingType: data.customer.billingType,
    billToAccountId: data.customer.billToAccountId,
    contractProfileId: data.customer.contractProfileId,
    invoiceDeliveryMethod: data.customer.invoiceDeliverySettings.method,
    invoiceDeliveryRecipientEmail: data.customer.invoiceDeliverySettings.recipientEmail ?? null,
    invoiceDeliveryLabel: data.customer.invoiceDeliverySettings.label ?? null,
    autoBillingEnabled: data.customer.autoBillingEnabled,
    requirePo: data.customer.requiredBillingReferences.requirePo,
    requireCustomerReference: data.customer.requiredBillingReferences.requireCustomerReference,
    requiredReferenceLabels: data.customer.requiredBillingReferences.labels
  };

  return (
    <AppPageShell density="wide">
      <PageHeader
        backNavigation={{ label: "Back to clients", fallbackHref: "/app/admin/clients" }}
        eyebrow="Clients"
        title={data.customer.name}
        description="A complete account workspace with operational history, site context, billing visibility, and customer documents."
        contentWidth="full"
      />

      {isEditing ? (
        <SectionCard>
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Customer editing
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
              Edit customer
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Update contact details, addresses, billing settings, and internal account notes without leaving this customer workspace.
            </p>
          </div>
          <form action={updateCustomerCompanyProfileAction} className="space-y-4">
            <input name="customerCompanyId" type="hidden" value={data.customer.id} />
            <CustomerProfileFields contractProfiles={contractProfiles} customer={customerSeed} formIdPrefix={`customer-profile-${data.customer.id}`} payerAccounts={payerAccounts} />
            {customerNotice ? <p className="text-sm text-slateblue">{customerNotice}</p> : null}
            <div className="flex flex-wrap gap-3">
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white" type="submit">
                Save customer
              </button>
              <a
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                href={`/app/admin/clients/${encodeURIComponent(data.customer.id)}`}
              >
                Cancel
              </a>
            </div>
          </form>
        </SectionCard>
      ) : customerNotice ? (
        <SectionCard>
          <p className="text-sm text-slateblue">{customerNotice}</p>
        </SectionCard>
      ) : null}

      <ClientProfileWorkspace data={data} />

      {!isEditing ? (
        <DeleteCustomerCard
          action={deleteCustomerCompanyAction}
          customerCompanyId={data.customer.id}
          customerName={data.customer.name}
          redirectTo="/app/admin/clients"
        />
      ) : null}
    </AppPageShell>
  );
}
