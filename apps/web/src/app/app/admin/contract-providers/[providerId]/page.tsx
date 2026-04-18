import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  formatContractProviderAccountStatusLabel,
  formatProviderContractStatusLabel,
  formatProviderInvoiceGroupingModeLabel,
  formatProviderPricingStrategyLabel,
  formatProviderRatePricingMethodLabel,
  getContractProviderDetail
} from "@testworx/lib/server/index";

import {
  AppPageShell,
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge
} from "../../operations-ui";
import {
  createProviderContractProfileAction,
  createProviderContractRateAction,
  updateContractProviderAccountAction,
  updateProviderContractProfileAction,
  updateProviderContractRateAction
} from "../actions";

function formatDateLabel(value: Date | null) {
  return value ? format(value, "MMM d, yyyy") : "Open-ended";
}

export default async function ProviderContractsPage({
  params,
  searchParams
}: {
  params: Promise<{ providerId: string }>;
  searchParams?: Promise<{ notice?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const { providerId } = await params;
  const actor = {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  };
  const [provider, rawQuery] = await Promise.all([
    getContractProviderDetail(actor, providerId),
    searchParams ? searchParams : Promise.resolve<{ notice?: string }>({})
  ]);
  const query: { notice?: string } = rawQuery;

  if (!provider) {
    notFound();
  }

  const redirectTo = `/app/admin/contract-providers/${provider.id}`;

  return (
    <AppPageShell density="wide">
      <PageHeader
        backNavigation={{ fallbackHref: "/app/admin/contract-providers", label: "Back to contract providers" }}
        eyebrow="Provider contracts"
        title={provider.name}
        description="Manage the contract profiles and structured pricing rules that the billing resolution engine can explain and apply."
      />

      {query.notice ? (
        <SectionCard>
          <p className="text-sm text-slateblue">{query.notice}</p>
        </SectionCard>
      ) : null}

      <SectionCard>
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-ink">Provider account context</h2>
              <StatusBadge label={formatContractProviderAccountStatusLabel(provider.status)} tone={provider.status === "active" ? "emerald" : "slate"} />
            </div>
            <p className="mt-2 text-sm text-slate-500">Use this as the visible source of truth for who gets billed, who receives invoices, and which contracts are available to sites and work orders.</p>
          </div>
        </div>
        <form action={updateContractProviderAccountAction} className="grid gap-4 md:grid-cols-2">
          <input name="providerAccountId" type="hidden" value={provider.id} />
          <input name="redirectTo" type="hidden" value={redirectTo} />
          <label className="text-sm text-slate-600">Provider name<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.name} name="name" required /></label>
          <label className="text-sm text-slate-600">Legal name<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.legalName ?? ""} name="legalName" /></label>
          <label className="text-sm text-slate-600">Status<select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.status} name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label className="text-sm text-slate-600">Billing contact<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.billingContactName} name="billingContactName" required /></label>
          <label className="text-sm text-slate-600">Billing email<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.billingEmail} name="billingEmail" required type="email" /></label>
          <label className="text-sm text-slate-600">Billing phone<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.billingPhone} name="billingPhone" required /></label>
          <label className="text-sm text-slate-600 md:col-span-2">Remittance address line 1<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.remittanceAddressLine1} name="remittanceAddressLine1" required /></label>
          <label className="text-sm text-slate-600 md:col-span-2">Remittance address line 2<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.remittanceAddressLine2 ?? ""} name="remittanceAddressLine2" /></label>
          <label className="text-sm text-slate-600">City<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.remittanceCity} name="remittanceCity" required /></label>
          <label className="text-sm text-slate-600">State<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.remittanceState} name="remittanceState" required /></label>
          <label className="text-sm text-slate-600">Postal code<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.remittancePostalCode} name="remittancePostalCode" required /></label>
          <label className="text-sm text-slate-600">Payment terms<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.paymentTerms} name="paymentTerms" required /></label>
          <label className="text-sm text-slate-600 md:col-span-2">Notes<textarea className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider.notes ?? ""} name="notes" /></label>
          <div className="md:col-span-2 flex justify-end">
            <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
              Save provider billing info
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard>
        <div className="mb-5">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Add contract profile</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Provider contracts and effective dates</h2>
          <p className="mt-2 text-sm text-slate-500">Every contract stays explicit: pricing strategy, grouping mode, required reference numbers, and effective dates all live here.</p>
        </div>
        <form action={createProviderContractProfileAction} className="grid gap-4 md:grid-cols-2">
          <input name="providerAccountId" type="hidden" value={provider.id} />
          <input name="redirectTo" type="hidden" value={redirectTo} />
          <label className="text-sm text-slate-600">Contract name<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="name" required /></label>
          <label className="text-sm text-slate-600">Status<select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="draft" name="status"><option value="draft">Draft</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="expired">Expired</option></select></label>
          <label className="text-sm text-slate-600">Effective start date<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="effectiveStartDate" required type="date" /></label>
          <label className="text-sm text-slate-600">Effective end date<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="effectiveEndDate" type="date" /></label>
          <label className="text-sm text-slate-600">Pricing strategy<select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="provider_rate_card" name="pricingStrategy"><option value="provider_rate_card">Provider rate card</option><option value="fixed_price">Fixed price</option><option value="custom_rules">Custom rules</option></select></label>
          <label className="text-sm text-slate-600">Invoice grouping mode<select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="per_work_order" name="invoiceGroupingMode"><option value="per_work_order">Per work order</option><option value="per_site">Per site</option><option value="monthly_rollup">Monthly rollup</option></select></label>
          <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"><input className="h-4 w-4" name="requireProviderWorkOrderNumber" type="checkbox" /> Require provider work order number</label>
          <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"><input className="h-4 w-4" name="requireSiteReferenceNumber" type="checkbox" /> Require site reference number</label>
          <label className="text-sm text-slate-600 md:col-span-2">Notes<textarea className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3" name="notes" /></label>
          <div className="md:col-span-2 flex justify-end">
            <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-white" type="submit">
              Add contract profile
            </button>
          </div>
        </form>
      </SectionCard>

      <div className="space-y-6">
        {provider.contracts.length === 0 ? (
          <SectionCard>
            <EmptyState description="Create a contract profile first, then add structured rate rows so billing resolution can show exactly which pricing source was applied." title="No provider contracts yet" />
          </SectionCard>
        ) : provider.contracts.map((contract) => (
          <SectionCard key={contract.id}>
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold text-ink">{contract.name}</h2>
                  <StatusBadge label={formatProviderContractStatusLabel(contract.status)} tone={contract.status === "active" ? "emerald" : contract.status === "draft" ? "amber" : "slate"} />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Effective {formatDateLabel(contract.effectiveStartDate)} to {formatDateLabel(contract.effectiveEndDate)} · {formatProviderPricingStrategyLabel(contract.pricingStrategy)} · {formatProviderInvoiceGroupingModeLabel(contract.invoiceGroupingMode)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-slate-200 px-3 py-1">{contract.requireProviderWorkOrderNumber ? "WO number required" : "WO number optional"}</span>
                <span className="rounded-full border border-slate-200 px-3 py-1">{contract.requireSiteReferenceNumber ? "Site reference required" : "Site reference optional"}</span>
                <span className="rounded-full border border-slate-200 px-3 py-1">{contract.activeAssignments.length} active site assignment{contract.activeAssignments.length === 1 ? "" : "s"}</span>
              </div>
            </div>

            <form action={updateProviderContractProfileAction} className="grid gap-4 md:grid-cols-2">
              <input name="providerContractProfileId" type="hidden" value={contract.id} />
              <input name="providerAccountId" type="hidden" value={provider.id} />
              <input name="redirectTo" type="hidden" value={redirectTo} />
              <label className="text-sm text-slate-600">Contract name<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={contract.name} name="name" required /></label>
              <label className="text-sm text-slate-600">Status<select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={contract.status} name="status"><option value="draft">Draft</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="expired">Expired</option></select></label>
              <label className="text-sm text-slate-600">Effective start date<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={contract.effectiveStartDate.toISOString().slice(0, 10)} name="effectiveStartDate" required type="date" /></label>
              <label className="text-sm text-slate-600">Effective end date<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={contract.effectiveEndDate?.toISOString().slice(0, 10) ?? ""} name="effectiveEndDate" type="date" /></label>
              <label className="text-sm text-slate-600">Pricing strategy<select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={contract.pricingStrategy} name="pricingStrategy"><option value="provider_rate_card">Provider rate card</option><option value="fixed_price">Fixed price</option><option value="custom_rules">Custom rules</option></select></label>
              <label className="text-sm text-slate-600">Invoice grouping mode<select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={contract.invoiceGroupingMode} name="invoiceGroupingMode"><option value="per_work_order">Per work order</option><option value="per_site">Per site</option><option value="monthly_rollup">Monthly rollup</option></select></label>
              <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"><input className="h-4 w-4" defaultChecked={contract.requireProviderWorkOrderNumber} name="requireProviderWorkOrderNumber" type="checkbox" /> Require provider work order number</label>
              <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700"><input className="h-4 w-4" defaultChecked={contract.requireSiteReferenceNumber} name="requireSiteReferenceNumber" type="checkbox" /> Require site reference number</label>
              <label className="text-sm text-slate-600 md:col-span-2">Notes<textarea className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={contract.notes ?? ""} name="notes" /></label>
              <div className="md:col-span-2 flex justify-end">
                <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                  Save contract profile
                </button>
              </div>
            </form>

            <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-sm font-semibold text-ink">Add pricing rule</p>
              <p className="mt-1 text-sm text-slate-500">These rows are the explainable pricing source for provider billing. No JSON blobs, no hidden rule engine branches.</p>
              <form action={createProviderContractRateAction} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <input name="providerContractProfileId" type="hidden" value={contract.id} />
                <input name="redirectTo" type="hidden" value={redirectTo} />
                <label className="text-sm text-slate-600">Service type<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="serviceType" required /></label>
                <label className="text-sm text-slate-600">Inspection type<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="inspectionType" placeholder="Optional" /></label>
                <label className="text-sm text-slate-600">Asset category<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="assetCategory" placeholder="Optional" /></label>
                <label className="text-sm text-slate-600">Report type<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="reportType" placeholder="Optional" /></label>
                <label className="text-sm text-slate-600">Pricing method<select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="flat_rate" name="pricingMethod"><option value="flat_rate">Flat rate</option><option value="per_unit">Per unit</option><option value="hourly">Hourly</option></select></label>
                <label className="text-sm text-slate-600">Priority<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue="0" name="priority" type="number" /></label>
                <label className="text-sm text-slate-600">Unit rate<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="unitRate" step="0.01" type="number" /></label>
                <label className="text-sm text-slate-600">Flat rate<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="flatRate" step="0.01" type="number" /></label>
                <label className="text-sm text-slate-600">Minimum charge<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="minimumCharge" step="0.01" type="number" /></label>
                <label className="text-sm text-slate-600">Effective start date<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="effectiveStartDate" type="date" /></label>
                <label className="text-sm text-slate-600">Effective end date<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" name="effectiveEndDate" type="date" /></label>
                <div className="xl:col-span-3 flex justify-end">
                  <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-white" type="submit">
                    Add pricing rule
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-6 space-y-4">
              {contract.rates.length === 0 ? (
                <EmptyState description="This contract does not have any structured pricing rows yet, so billing resolution will fall through to lower pricing sources." title="No pricing rules yet" />
              ) : contract.rates.map((rate) => (
                <form action={updateProviderContractRateAction} className="rounded-[1.5rem] border border-slate-200 p-4" key={rate.id}>
                  <input name="providerContractRateId" type="hidden" value={rate.id} />
                  <input name="providerContractProfileId" type="hidden" value={contract.id} />
                  <input name="redirectTo" type="hidden" value={redirectTo} />
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-ink">{rate.serviceType}</p>
                      <p className="mt-1 text-sm text-slate-500">{formatProviderRatePricingMethodLabel(rate.pricingMethod)} · Priority {rate.priority}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full border border-slate-200 px-3 py-1">Inspection: {rate.inspectionType ?? "Any"}</span>
                      <span className="rounded-full border border-slate-200 px-3 py-1">Asset: {rate.assetCategory ?? "Any"}</span>
                      <span className="rounded-full border border-slate-200 px-3 py-1">Report: {rate.reportType ?? "Any"}</span>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="text-sm text-slate-600">Service type<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rate.serviceType} name="serviceType" required /></label>
                    <label className="text-sm text-slate-600">Inspection type<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rate.inspectionType ?? ""} name="inspectionType" /></label>
                    <label className="text-sm text-slate-600">Asset category<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rate.assetCategory ?? ""} name="assetCategory" /></label>
                    <label className="text-sm text-slate-600">Report type<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rate.reportType ?? ""} name="reportType" /></label>
                    <label className="text-sm text-slate-600">Pricing method<select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rate.pricingMethod} name="pricingMethod"><option value="flat_rate">Flat rate</option><option value="per_unit">Per unit</option><option value="hourly">Hourly</option></select></label>
                    <label className="text-sm text-slate-600">Priority<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={String(rate.priority)} name="priority" type="number" /></label>
                    <label className="text-sm text-slate-600">Unit rate<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rate.unitRate ?? ""} name="unitRate" step="0.01" type="number" /></label>
                    <label className="text-sm text-slate-600">Flat rate<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rate.flatRate ?? ""} name="flatRate" step="0.01" type="number" /></label>
                    <label className="text-sm text-slate-600">Minimum charge<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rate.minimumCharge ?? ""} name="minimumCharge" step="0.01" type="number" /></label>
                    <label className="text-sm text-slate-600">Effective start date<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rate.effectiveStartDate?.toISOString().slice(0, 10) ?? ""} name="effectiveStartDate" type="date" /></label>
                    <label className="text-sm text-slate-600">Effective end date<input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={rate.effectiveEndDate?.toISOString().slice(0, 10) ?? ""} name="effectiveEndDate" type="date" /></label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                      Save pricing rule
                    </button>
                  </div>
                </form>
              ))}
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard>
        <div className="mb-5">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Current site usage</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Active assignments using this provider</h2>
        </div>
        <div className="space-y-3">
          {provider.activeAssignments.length === 0 ? (
            <EmptyState description="No service sites are currently defaulting to this provider. Assign a provider from a customer site to make new work orders snapshot this context." title="No active site assignments" />
          ) : provider.activeAssignments.map((assignment) => (
            <div className="rounded-[1.5rem] border border-slate-200 p-4" key={assignment.id}>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">{assignment.customerName} · {assignment.siteName}</p>
                  <p className="mt-1 text-sm text-slate-500">Contract: {assignment.contractProfileName ?? "No contract profile selected"} · Effective {assignment.effectiveStartDate ? formatDateLabel(assignment.effectiveStartDate) : "Immediately"}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {assignment.externalAccountName ? <span className="rounded-full border border-slate-200 px-3 py-1">External account: {assignment.externalAccountName}</span> : null}
                  {assignment.externalAccountNumber ? <span className="rounded-full border border-slate-200 px-3 py-1">Account #: {assignment.externalAccountNumber}</span> : null}
                  {assignment.externalLocationCode ? <span className="rounded-full border border-slate-200 px-3 py-1">Location code: {assignment.externalLocationCode}</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </AppPageShell>
  );
}
