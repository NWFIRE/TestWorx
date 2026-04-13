import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  canManageBilling,
  getPaginatedTenantComplianceReportingFeeSettings,
  getPaginatedTenantCustomerCompanySettings,
  getQuickBooksItemMappingSettings,
  getPaginatedTenantServiceFeeSettings,
  getTenantBillingSettings,
  getTenantBrandingSettings,
  getTenantQuickBooksConnectionSettings
} from "@testworx/lib";

import { AppPageShell, KPIStatCard, PageHeader, SectionCard, WorkspaceSplit } from "../operations-ui";
import { BrandLoader } from "@/app/brand-loader";

import {
  createCustomerCompanyAction,
  createComplianceReportingFeeRuleAction,
  createServiceFeeRuleAction,
  deleteComplianceReportingFeeRuleAction,
  deleteServiceFeeRuleAction,
  disconnectQuickBooksAction,
  importQuickBooksCustomersAction,
  importQuickBooksCatalogItemsAction,
  saveQuickBooksItemMappingAction,
  clearQuickBooksItemMappingAction,
  syncQuickBooksCustomersActionState,
  openBillingPortalAction,
  startQuickBooksConnectAction,
  startBillingCheckoutAction,
  updateCustomerCompanyAction,
  updateComplianceReportingFeeRuleAction,
  updateDefaultServiceFeeAction,
  updateServiceFeeRuleAction,
  updateTenantBrandingAction
} from "./actions";
import { CustomerManagementCard } from "./customer-management-card";
import { BillingPlansSection } from "./billing-plans-section";
import { ComplianceReportingFeeSettingsCard } from "./compliance-reporting-fee-settings-card";
import { QuickBooksItemMappingCard } from "./quickbooks-item-mapping-card";
import { ServiceFeeSettingsCard } from "./service-fee-settings-card";
import { QuickBooksSettingsCard } from "./quickbooks-settings-card";
import { SettingsDisclosureCard } from "./settings-disclosure-card";
import { TenantBrandingForm } from "./tenant-branding-form";

type SettingsSearchParams = Record<string, string | string[] | undefined>;

function readSearchParam(params: SettingsSearchParams, key: string, fallback = "") {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? fallback : fallback;
}

function readPositiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isSectionOpen(params: SettingsSearchParams, key: string, notice?: string | null) {
  if (notice) {
    return true;
  }

  return readSearchParam(params, key) === "1";
}

function buildSettingsHref(params: SettingsSearchParams, nextValues: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params)) {
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        if (typeof item === "string") {
          search.append(key, item);
        }
      }
    } else if (typeof rawValue === "string") {
      search.set(key, rawValue);
    }
  }

  for (const [key, value] of Object.entries(nextValues)) {
    if (value === null || value === undefined || value === "") {
      search.delete(key);
    } else {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `/app/admin/settings?${query}` : "/app/admin/settings";
}

function LazySectionCard({
  eyebrow,
  title,
  description,
  actionLabel,
  actionHref,
  tone = "default"
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  tone?: "default" | "loading" | "error";
}) {
  const toneClasses = tone === "error"
    ? "border-rose-200 bg-rose-50"
    : tone === "loading"
      ? "border-slate-200 bg-slate-50"
      : "border-slate-200 bg-white";

  return (
      <div className={`rounded-[2rem] border p-6 shadow-panel ${toneClasses}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{eyebrow}</p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">{title}</h3>
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
              {tone === "loading" ? <BrandLoader label={description} size="sm" tone="muted" /> : null}
              <p>{description}</p>
            </div>
          </div>
        <Link className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={actionHref}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}

async function CustomersSection({
  actor,
  page,
  notice,
  query
}: {
  actor: { userId: string; role: string; tenantId: string };
  page: number;
  notice?: string | null;
  query?: string;
}) {
  let data: Awaited<ReturnType<typeof getPaginatedTenantCustomerCompanySettings>>;

  try {
    data = await getPaginatedTenantCustomerCompanySettings(actor, { page, limit: 10, query });
  } catch (error) {
    return (
      <LazySectionCard
        actionHref={buildSettingsHref({ customersOpen: "1" }, { customersOpen: 1 })}
        actionLabel="Try again"
        description={error instanceof Error ? error.message : "Unable to load customers right now."}
        eyebrow="Customer companies"
        title="Customers could not be loaded"
        tone="error"
      />
    );
  }

  return (
    <CustomerManagementCard
      createCustomerAction={createCustomerCompanyAction}
      customers={data.customers}
      filters={data.filters}
      notice={notice}
      pagination={data.pagination}
      updateCustomerAction={updateCustomerCompanyAction}
    />
  );
}

async function ServiceFeesSection({
  actor,
  page,
  activeEditor
}: {
  actor: { userId: string; role: string; tenantId: string };
  page: number;
  activeEditor: string | null;
}) {
  let data: Awaited<ReturnType<typeof getPaginatedTenantServiceFeeSettings>>;

  try {
    data = await getPaginatedTenantServiceFeeSettings(actor, {
      page,
      limit: 10,
      includeLookups: Boolean(activeEditor)
    });
  } catch (error) {
    return (
      <LazySectionCard
        actionHref={buildSettingsHref({ feesOpen: "1" }, { feesOpen: 1 })}
        actionLabel="Try again"
        description={error instanceof Error ? error.message : "Unable to load service fee rules right now."}
        eyebrow="Inspection service fees"
        title="Service fee rules could not be loaded"
        tone="error"
      />
    );
  }

  return (
    <ServiceFeeSettingsCard
      createRuleAction={createServiceFeeRuleAction}
      customers={data.customers}
      defaultValues={{
        defaultServiceFeeCode: data.tenant.defaultServiceFeeCode ?? "SERVICE_FEE",
        defaultServiceFeeUnitPrice: data.tenant.defaultServiceFeeUnitPrice
      }}
      deleteRuleAction={deleteServiceFeeRuleAction}
      activeEditor={activeEditor}
      pagination={data.pagination}
      rules={data.rules}
      sites={data.sites}
      updateDefaultAction={updateDefaultServiceFeeAction}
      updateRuleAction={updateServiceFeeRuleAction}
    />
  );
}

async function ComplianceReportingFeesSection({
  actor,
  page,
  activeEditor
}: {
  actor: { userId: string; role: string; tenantId: string };
  page: number;
  activeEditor: string | null;
}) {
  let data: Awaited<ReturnType<typeof getPaginatedTenantComplianceReportingFeeSettings>>;
  void activeEditor;

  try {
    data = await getPaginatedTenantComplianceReportingFeeSettings(actor, {
      page,
      limit: 10
    });
  } catch (error) {
    return (
      <LazySectionCard
        actionHref={buildSettingsHref({ complianceFeesOpen: "1" }, { complianceFeesOpen: 1 })}
        actionLabel="Try again"
        description={error instanceof Error ? error.message : "Unable to load compliance reporting fee rules right now."}
        eyebrow="Compliance reporting fees"
        title="Jurisdiction-based reporting fees"
        tone="error"
      />
    );
  }

  return (
    <ComplianceReportingFeeSettingsCard
      activeEditor={activeEditor}
      createRuleAction={createComplianceReportingFeeRuleAction}
      deleteRuleAction={deleteComplianceReportingFeeRuleAction}
      pagination={data.pagination}
      rules={data.rules}
      updateRuleAction={updateComplianceReportingFeeRuleAction}
    />
  );
}

async function QuickBooksMappingsSection({
  actor,
  notice
}: {
  actor: { userId: string; role: string; tenantId: string };
  notice?: string | null;
}) {
  let data: Awaited<ReturnType<typeof getQuickBooksItemMappingSettings>>;

  try {
    data = await getQuickBooksItemMappingSettings(actor);
  } catch (error) {
    return (
      <LazySectionCard
        actionHref={buildSettingsHref({ mappingsOpen: "1" }, { mappingsOpen: 1 })}
        actionLabel="Try again"
        description={error instanceof Error ? error.message : "Unable to load QuickBooks item mappings right now."}
        eyebrow="QuickBooks item mappings"
        title="Map billable codes to QuickBooks items"
        tone="error"
      />
    );
  }

  return (
    <QuickBooksItemMappingCard
      availableItems={data.availableItems}
      clearMappingAction={clearQuickBooksItemMappingAction}
      configured={data.configured}
      connected={data.connected}
      modeMismatch={data.modeMismatch}
      notice={notice}
      reconnectRequired={data.reconnectRequired}
      resyncAction={importQuickBooksCatalogItemsAction}
      rows={data.rows}
      saveMappingAction={saveQuickBooksItemMappingAction}
    />
  );
}

export default async function TenantSettingsPage({ searchParams }: { searchParams?: Promise<SettingsSearchParams> }) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  const params = searchParams ? await searchParams : {};
  const actor = { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId };

  const customersPage = readPositiveInt(readSearchParam(params, "customersPage", "1"), 1);
  const customersQuery = readSearchParam(params, "customersQuery");
  const feesPage = readPositiveInt(readSearchParam(params, "feesPage", "1"), 1);
  const feeEditor = readSearchParam(params, "feeEditor") || null;
  const complianceFeePage = readPositiveInt(readSearchParam(params, "complianceFeePage", "1"), 1);
  const complianceFeeEditor = readSearchParam(params, "complianceFeeEditor") || null;

  const [billingSettings, brandingSettings, quickBooksSettings] = await Promise.all([
    getTenantBillingSettings(actor),
    getTenantBrandingSettings(actor),
    getTenantQuickBooksConnectionSettings(actor)
  ]);
  const canManageSubscription = canManageBilling(session.user.role);
  const quickBooksNotice = Array.isArray(params.quickbooks)
    ? params.quickbooks[0]
    : typeof params.quickbooks === "string"
      ? decodeURIComponent(params.quickbooks)
      : null;
  const customerNotice = Array.isArray(params.customers)
    ? params.customers[0]
    : typeof params.customers === "string"
      ? decodeURIComponent(params.customers)
      : null;
  const customersOpen = isSectionOpen(params, "customersOpen", customerNotice);
  const feesOpen = isSectionOpen(params, "feesOpen");
  const complianceFeesOpen = isSectionOpen(params, "complianceFeesOpen");
  const mappingsOpen = isSectionOpen(params, "mappingsOpen", quickBooksNotice);

  return (
    <AppPageShell density="wide">
      <PageHeader
        description="Manage subscription readiness, billing contacts, branding, customer records, and service fee rules from one quieter settings workspace."
        eyebrow="Tenant settings"
        title="Billing and branding"
        contentWidth="full"
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          label="Subscription"
          note={billingSettings.tenant.subscriptionPlan?.name ?? "Not assigned"}
          tone="blue"
          value={billingSettings.tenant.stripeSubscriptionStatus ?? "Not connected"}
        />
        <KPIStatCard
          label="QuickBooks"
          note={quickBooksSettings.tenant.quickbooksCompanyName ?? "No company connected"}
          tone={quickBooksSettings.tenant.connected ? "emerald" : "amber"}
          value={quickBooksSettings.tenant.connected ? "Connected" : "Pending"}
        />
        <KPIStatCard
          label="Branding"
          note={brandingSettings.billingEmail ?? "Billing email not set"}
          tone="slate"
          value={brandingSettings.branding.legalBusinessName || "TradeWorx"}
        />
        <KPIStatCard
          label="Service fees"
          note="Rule and default fee controls stay available below."
          tone="violet"
          value={feesOpen ? "Open" : "Ready"}
        />
      </section>
      <WorkspaceSplit variant="balanced">
        <div className="space-y-6">
          <TenantBrandingForm action={updateTenantBrandingAction} values={{ ...brandingSettings.branding, billingEmail: brandingSettings.billingEmail }} />
          <SettingsDisclosureCard
            description="Load customer companies only when you need them, with a paginated current-customer list and its own empty and error states."
            desktopSpan="fullWhenOpen"
            eyebrow="Customer companies"
            initialOpen={customersOpen}
            openLabel="Open customers"
            queryKey="customersOpen"
            title="Create and edit current customers"
          >
            <Suspense
              key={`customers-${customersPage}-${customersQuery}`}
              fallback={
                <LazySectionCard
                  actionHref={buildSettingsHref(params, { customersOpen: 1, customersPage: 1, customersQuery: customersQuery || null })}
                  actionLabel="Reload section"
                  description="Loading the current customer page..."
                  eyebrow="Customer companies"
                  title="Create and edit current customers"
                  tone="loading"
                />
              }
            >
              <CustomersSection actor={actor} notice={customerNotice} page={customersPage} query={customersQuery} />
            </Suspense>
          </SettingsDisclosureCard>
          <QuickBooksSettingsCard
            companyName={quickBooksSettings.tenant.quickbooksCompanyName}
            configured={quickBooksSettings.config.enabled}
            connectAction={startQuickBooksConnectAction}
            connected={quickBooksSettings.tenant.connected}
            connectedAt={quickBooksSettings.tenant.quickbooksConnectedAt}
            disconnectAction={disconnectQuickBooksAction}
            appConnectionMode={quickBooksSettings.tenant.appConnectionMode}
            appConnectionModeLabel={quickBooksSettings.tenant.appConnectionModeLabel}
            storedConnectionMode={quickBooksSettings.tenant.storedConnectionMode}
            storedConnectionModeLabel={quickBooksSettings.tenant.storedConnectionModeLabel}
            modeMismatch={quickBooksSettings.tenant.modeMismatch}
            reconnectRequired={quickBooksSettings.tenant.reconnectRequired}
            statusLabel={quickBooksSettings.tenant.statusLabel}
            guidance={quickBooksSettings.tenant.guidance}
            syncCustomersAction={syncQuickBooksCustomersActionState}
            importCustomersAction={importQuickBooksCustomersAction}
            importCatalogAction={importQuickBooksCatalogItemsAction}
            hasStoredConnection={quickBooksSettings.tenant.hasStoredConnection}
            notice={quickBooksNotice}
            realmId={quickBooksSettings.tenant.quickbooksRealmId}
            supportReference={quickBooksSettings.supportReference}
          />
          <div className="grid gap-6 xl:grid-cols-2">
            <SettingsDisclosureCard
              description="Review stored QuickBooks item ids for each internal billing code, fix inactive references, and confirm suggested matches without loading the full section until you need it."
              desktopSpan="fullWhenOpen"
              eyebrow="QuickBooks item mappings"
              initialOpen={mappingsOpen}
              openLabel="Open item mappings"
              queryKey="mappingsOpen"
              title="Map billable codes to QuickBooks items"
            >
              <Suspense
                key="quickbooks-mappings"
                fallback={
                  <LazySectionCard
                    actionHref={buildSettingsHref(params, { mappingsOpen: 1 })}
                    actionLabel="Reload section"
                    description="Loading stored QuickBooks mappings and suggested matches..."
                    eyebrow="QuickBooks item mappings"
                    title="Map billable codes to QuickBooks items"
                    tone="loading"
                  />
                }
              >
                <QuickBooksMappingsSection actor={actor} notice={quickBooksNotice} />
              </Suspense>
            </SettingsDisclosureCard>
            <SettingsDisclosureCard
              description="Load service fee rules only when you open the section. Rules stay paginated and keep their own loading, empty, and error states."
              desktopSpan="fullWhenOpen"
              eyebrow="Inspection service fees"
              initialOpen={feesOpen}
              openLabel="Open service fee rules"
              queryKey="feesOpen"
              title="Default fee and location rules"
            >
              <Suspense
                key={`fees-${feesPage}`}
                fallback={
                  <LazySectionCard
                    actionHref={buildSettingsHref(params, { feesOpen: 1, feesPage })}
                    actionLabel="Reload section"
                    description="Loading the current service fee rules page..."
                    eyebrow="Inspection service fees"
                    title="Default fee and location rules"
                    tone="loading"
                  />
                }
              >
                <ServiceFeesSection activeEditor={feeEditor} actor={actor} page={feesPage} />
              </Suspense>
            </SettingsDisclosureCard>
            <SettingsDisclosureCard
              description="Load jurisdiction-based compliance reporting fees only when needed. Rules stay paginated and automatically drive matching compliance fee lines in billing."
              desktopSpan="fullWhenOpen"
              eyebrow="Compliance reporting fees"
              initialOpen={complianceFeesOpen}
              openLabel="Open compliance reporting fees"
              queryKey="complianceFeesOpen"
              title="Jurisdiction-based reporting fees"
            >
              <Suspense
                key={`compliance-fees-${complianceFeePage}`}
                fallback={
                  <LazySectionCard
                    actionHref={buildSettingsHref(params, { complianceFeesOpen: 1, complianceFeePage })}
                    actionLabel="Reload section"
                    description="Loading the current compliance reporting fee rules page..."
                    eyebrow="Compliance reporting fees"
                    title="Jurisdiction-based reporting fees"
                    tone="loading"
                  />
                }
              >
                <ComplianceReportingFeesSection activeEditor={complianceFeeEditor} actor={actor} page={complianceFeePage} />
              </Suspense>
            </SettingsDisclosureCard>
            <SectionCard>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Billing settings</p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">Current subscription</h3>
            <p className="mt-3 text-sm text-slate-500">Plan: {billingSettings.tenant.subscriptionPlan?.name ?? "Not assigned"}</p>
            <p className="mt-2 text-sm text-slate-500">Billing email: {billingSettings.tenant.billingEmail ?? "Not set"}</p>
            <p className="mt-2 text-sm text-slate-500">Stripe status: {billingSettings.tenant.stripeSubscriptionStatus ?? "Not connected"}</p>
            <p className="mt-2 text-sm text-slate-500">Current period end: {billingSettings.tenant.stripeCurrentPeriodEndsAt ? new Date(billingSettings.tenant.stripeCurrentPeriodEndsAt).toLocaleDateString() : "Not synced yet"}</p>
            <p className="mt-2 text-sm text-slate-500">Cancel at period end: {billingSettings.tenant.stripeCancelAtPeriodEnd ? "Yes" : "No"}</p>
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p>{billingSettings.config.enabled ? "Stripe is configured and ready for checkout sessions." : "Stripe env vars are not fully configured yet. Plan selection is shown, but checkout buttons are disabled until env configuration is completed."}</p>
              <p className="mt-2">Webhook sync: {billingSettings.config.webhookConfigured ? "Configured" : "Missing STRIPE_WEBHOOK_SECRET"}</p>
              <p className="mt-2">Advanced recurrence: {billingSettings.entitlements.advancedRecurrence ? "Enabled" : "Upgrade required"}</p>
              <p className="mt-2">Uploaded inspection PDFs: {billingSettings.entitlements.uploadedInspectionPdfs ? "Enabled" : "Upgrade required"}</p>
              {!canManageSubscription ? <p className="mt-2">Subscription checkout and Stripe portal access remain limited to tenant admins.</p> : null}
            </div>
            {canManageSubscription ? (
              <form action={openBillingPortalAction} className="mt-4">
                <button className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={!billingSettings.config.enabled || !billingSettings.tenant.stripeCustomerId} type="submit">
                  Open Stripe billing portal
                </button>
              </form>
            ) : null}
            </SectionCard>
          </div>
        </div>
      </WorkspaceSplit>
      <BillingPlansSection
        addons={billingSettings.config.addons}
        canManageSubscription={canManageSubscription}
        currentPlanCode={billingSettings.tenant.subscriptionPlan?.code ?? null}
        plans={billingSettings.config.plans.map((plan) => ({
          ...plan,
          stripePriceId: billingSettings.config.enabled ? plan.stripePriceId : null
        }))}
        startBillingCheckoutAction={startBillingCheckoutAction}
      />
    </AppPageShell>
  );
}
