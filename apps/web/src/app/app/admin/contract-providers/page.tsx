import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  formatContractProviderAccountStatusLabel,
  formatProviderContractStatusLabel,
  getContractProviderAdminData
} from "@testworx/lib/server/index";

import {
  AppPageShell,
  EmptyState,
  KPIStatCard,
  PageHeader,
  SectionCard,
  StatusBadge
} from "../operations-ui";
import {
  createContractProviderAccountAction,
  updateContractProviderAccountAction
} from "./actions";

type ProviderRecord = Awaited<ReturnType<typeof getContractProviderAdminData>>["providers"][number];

function ProviderAccountFields({
  provider,
  redirectTo
}: {
  provider?: ProviderRecord;
  redirectTo: string;
}) {
  return (
    <>
      {provider ? <input name="providerAccountId" type="hidden" value={provider.id} /> : null}
      <input name="redirectTo" type="hidden" value={redirectTo} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-600">
          Provider name
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.name ?? ""} name="name" required />
        </label>
        <label className="text-sm text-slate-600">
          Legal name
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.legalName ?? ""} name="legalName" />
        </label>
        <label className="text-sm text-slate-600">
          Status
          <select className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.status ?? "active"} name="status">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Billing contact
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.billingContactName ?? ""} name="billingContactName" required />
        </label>
        <label className="text-sm text-slate-600">
          Billing email
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.billingEmail ?? ""} name="billingEmail" required type="email" />
        </label>
        <label className="text-sm text-slate-600">
          Billing phone
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.billingPhone ?? ""} name="billingPhone" required />
        </label>
        <label className="text-sm text-slate-600 md:col-span-2">
          Remittance address line 1
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.remittanceAddressLine1 ?? ""} name="remittanceAddressLine1" required />
        </label>
        <label className="text-sm text-slate-600 md:col-span-2">
          Remittance address line 2
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.remittanceAddressLine2 ?? ""} name="remittanceAddressLine2" />
        </label>
        <label className="text-sm text-slate-600">
          City
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.remittanceCity ?? ""} name="remittanceCity" required />
        </label>
        <label className="text-sm text-slate-600">
          State
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.remittanceState ?? ""} name="remittanceState" required />
        </label>
        <label className="text-sm text-slate-600">
          Postal code
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.remittancePostalCode ?? ""} name="remittancePostalCode" required />
        </label>
        <label className="text-sm text-slate-600">
          Payment terms
          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.paymentTerms ?? ""} name="paymentTerms" required />
        </label>
        <label className="text-sm text-slate-600 md:col-span-2">
          Notes
          <textarea className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={provider?.notes ?? ""} name="notes" />
        </label>
      </div>
    </>
  );
}

export default async function ContractProvidersAdminPage({
  searchParams
}: {
  searchParams?: Promise<{ notice?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const actor = {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  };
  const [data, rawParams] = await Promise.all([
    getContractProviderAdminData(actor),
    searchParams ? searchParams : Promise.resolve<{ notice?: string }>({})
  ]);
  const params: { notice?: string } = rawParams;

  return (
    <AppPageShell density="wide">
      <PageHeader
        backNavigation={{ fallbackHref: "/app/admin/dashboard", label: "Back to admin" }}
        eyebrow="Contract provider billing"
        title="Contract providers"
        description="Keep third-party billing visible and explainable with provider accounts, billing contacts, and direct links into contract pricing."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard label="Providers" note="Configured external contract-provider accounts." tone="emerald" value={data.counts.providers} />
        <KPIStatCard label="Active providers" note="Providers currently available for site assignment." tone="blue" value={data.counts.activeProviders} />
        <KPIStatCard label="Active contracts" note="Contracts currently eligible for billing resolution." tone="violet" value={data.counts.activeContracts} />
        <KPIStatCard label="Active site assignments" note="Sites currently routed to provider billing." tone="slate" value={data.counts.activeAssignments} />
      </section>

      {params.notice ? (
        <SectionCard>
          <p className="text-sm text-slateblue">{params.notice}</p>
        </SectionCard>
      ) : null}

      <SectionCard>
        <div className="mb-5">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Add provider</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">New contract provider account</h2>
          <p className="mt-2 text-sm text-slate-500">This becomes the bill-to entity when a site or work order resolves to contract-provider billing.</p>
        </div>
        <form action={createContractProviderAccountAction} className="space-y-4">
          <ProviderAccountFields redirectTo="/app/admin/contract-providers" />
          <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-white" type="submit">
            Add provider
          </button>
        </form>
      </SectionCard>

      <SectionCard>
        <div className="mb-5">
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Existing providers</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Billing accounts and contract entry points</h2>
          <p className="mt-2 text-sm text-slate-500">Nothing here is hidden. Each provider shows status, billing contact, current contract count, and where to manage pricing rules.</p>
        </div>
        <div className="space-y-5">
          {data.providers.length === 0 ? (
            <EmptyState description="Create the first contract provider to start assigning sites and resolving billing to external payer accounts." title="No contract providers yet" />
          ) : data.providers.map((provider) => (
            <form action={updateContractProviderAccountAction} className="rounded-[1.5rem] border border-slate-200 p-5" key={provider.id}>
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-ink">{provider.name}</h3>
                    <StatusBadge label={formatContractProviderAccountStatusLabel(provider.status)} tone={provider.status === "active" ? "emerald" : "slate"} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {provider.contractCount} contract{provider.contractCount === 1 ? "" : "s"} | {provider.assignedSiteCount} assigned site{provider.assignedSiteCount === 1 ? "" : "s"} | {provider.workOrderContextCount} work order snapshot{provider.workOrderContextCount === 1 ? "" : "s"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {provider.contracts.slice(0, 3).map((contract) => (
                      <span className="rounded-full border border-slate-200 px-3 py-1" key={contract.id}>
                        {contract.name} · {formatProviderContractStatusLabel(contract.status)}
                      </span>
                    ))}
                  </div>
                </div>
                <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/app/admin/contract-providers/${provider.id}`}>
                  View contracts
                </Link>
              </div>
              <ProviderAccountFields provider={provider} redirectTo="/app/admin/contract-providers" />
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500">Billing info here is the exact bill-to identity used when a provider resolves as payer.</p>
                <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                  Save provider
                </button>
              </div>
            </form>
          ))}
        </div>
      </SectionCard>
    </AppPageShell>
  );
}
