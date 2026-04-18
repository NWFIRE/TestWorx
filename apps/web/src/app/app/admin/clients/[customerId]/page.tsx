import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getClientProfileData,
  getContractProviderAssignmentOptions,
  getTenantBillingContractProfiles,
  getTenantBillingPayerAccounts
} from "@testworx/lib/server/index";

import { AppPageShell, PageHeader, SectionCard } from "../../operations-ui";
import { ClientProfileWorkspace } from "../client-profile-workspace";
import { deleteCustomerCompanyAction, updateCustomerCompanyProfileAction } from "../actions";
import { CustomerProfileFields } from "../../settings/customer-management-card";
import { DeleteCustomerCard } from "../delete-customer-card";
import { setServiceSiteProviderAssignmentAction } from "../../contract-providers/actions";

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
  const [data, payerAccounts, contractProfiles, providerOptions] = await Promise.all([
    getClientProfileData(actor, customerId),
    getTenantBillingPayerAccounts(actor),
    getTenantBillingContractProfiles(actor),
    getContractProviderAssignmentOptions(actor)
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

      <SectionCard>
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Contract Provider Assignment
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            Site-level provider billing defaults
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            This is the visible default billing source for new work orders created from each service site. Changing it creates a new assignment snapshot instead of rewriting history.
          </p>
        </div>
        <div className="space-y-4">
          {data.sites.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
              No service sites are available for provider assignment yet.
            </p>
          ) : data.sites.map((site) => (
            <form action={setServiceSiteProviderAssignmentAction} className="rounded-[1.5rem] border border-slate-200 p-4" key={site.id}>
              <input name="customerCompanyId" type="hidden" value={data.customer.id} />
              <input name="serviceSiteId" type="hidden" value={site.id} />
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-lg font-semibold text-slate-950">{site.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{site.address || "No address saved"}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Current billing default: {site.currentAssignment?.providerAccountName ?? "Direct customer"}
                    {site.currentAssignment?.providerContractProfileName ? ` · ${site.currentAssignment.providerContractProfileName}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 px-3 py-1">{site.currentAssignment?.statusLabel ?? "No provider assignment"}</span>
                  <span className="rounded-full border border-slate-200 px-3 py-1">{site.assignmentHistoryCount} assignment record{site.assignmentHistoryCount === 1 ? "" : "s"}</span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="text-sm text-slate-600">
                  Provider account
                  <select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={site.currentAssignment?.providerAccountId ?? ""} name="providerAccountId">
                    <option value="">Direct customer billing</option>
                    {providerOptions.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} {provider.status === "inactive" ? "(Inactive)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  Contract profile
                  <select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={site.currentAssignment?.providerContractProfileId ?? ""} name="providerContractProfileId">
                    <option value="">No contract selected</option>
                    {providerOptions.providers.flatMap((provider) =>
                      provider.contracts.map((contract) => (
                        <option key={contract.id} value={contract.id}>
                          {provider.name} · {contract.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  External account name
                  <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={site.currentAssignment?.externalAccountName ?? ""} name="externalAccountName" />
                </label>
                <label className="text-sm text-slate-600">
                  External account number
                  <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={site.currentAssignment?.externalAccountNumber ?? ""} name="externalAccountNumber" />
                </label>
                <label className="text-sm text-slate-600">
                  External location code
                  <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={site.currentAssignment?.externalLocationCode ?? ""} name="externalLocationCode" />
                </label>
                <label className="text-sm text-slate-600">
                  Effective start date
                  <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={site.currentAssignment?.effectiveStartDate ?? ""} name="effectiveStartDate" type="date" />
                </label>
                <label className="text-sm text-slate-600">
                  Effective end date
                  <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={site.currentAssignment?.effectiveEndDate ?? ""} name="effectiveEndDate" type="date" />
                </label>
                <label className="text-sm text-slate-600 xl:col-span-3">
                  Billing notes
                  <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={site.currentAssignment?.billingNotes ?? ""} name="billingNotes" />
                </label>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">New work orders snapshot this site assignment at creation time so future site changes do not rewrite historical billing.</p>
                <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                  Save assignment
                </button>
              </div>
            </form>
          ))}
        </div>
      </SectionCard>

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
