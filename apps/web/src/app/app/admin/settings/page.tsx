import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  buildTenantBrandingCss,
  canManageBilling,
  getPaginatedTenantCustomerCompanySettings,
  getPaginatedTenantQuickBooksCatalogSettings,
  getQuickBooksItemMappingSettings,
  getPaginatedTenantServiceFeeSettings,
  getTenantBillingSettings,
  getTenantBrandingSettings,
  getTenantQuickBooksConnectionSettings
} from "@testworx/lib";

import {
  createCustomerCompanyAction,
  createQuickBooksCatalogItemAction,
  createServiceFeeRuleAction,
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
  updateQuickBooksCatalogItemAction,
  updateDefaultServiceFeeAction,
  updateServiceFeeRuleAction,
  updateTenantBrandingAction
} from "./actions";
import { CustomerManagementCard } from "./customer-management-card";
import { QuickBooksCatalogManagementCard } from "./quickbooks-catalog-management-card";
import { QuickBooksItemMappingCard } from "./quickbooks-item-mapping-card";
import { ServiceFeeSettingsCard } from "./service-fee-settings-card";
import { QuickBooksSettingsCard } from "./quickbooks-settings-card";
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
          <p className="mt-2 text-sm text-slate-500">{description}</p>
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
  notice
}: {
  actor: { userId: string; role: string; tenantId: string };
  page: number;
  notice?: string | null;
}) {
  let data: Awaited<ReturnType<typeof getPaginatedTenantCustomerCompanySettings>>;

  try {
    data = await getPaginatedTenantCustomerCompanySettings(actor, { page, limit: 10 });
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
      notice={notice}
      pagination={data.pagination}
      updateCustomerAction={updateCustomerCompanyAction}
    />
  );
}

async function CatalogSection({
  actor,
  page,
  search,
  itemType,
  status,
  connection,
  notice
}: {
  actor: { userId: string; role: string; tenantId: string };
  page: number;
  search: string;
  itemType: string;
  status: "all" | "active" | "inactive";
  connection: Awaited<ReturnType<typeof getTenantQuickBooksConnectionSettings>>;
  notice?: string | null;
}) {
  let data: Awaited<ReturnType<typeof getPaginatedTenantQuickBooksCatalogSettings>>;

  try {
    data = await getPaginatedTenantQuickBooksCatalogSettings(actor, {
      page,
      search,
      itemType,
      status
    });
  } catch (error) {
    return (
      <LazySectionCard
        actionHref={buildSettingsHref({ catalogOpen: "1" }, { catalogOpen: 1 })}
        actionLabel="Try again"
        description={error instanceof Error ? error.message : "Unable to load products and services right now."}
        eyebrow="QuickBooks products and services"
        title="Products and services could not be loaded"
        tone="error"
      />
    );
  }

  return (
    <QuickBooksCatalogManagementCard
      activeItemCount={data.activeCount}
      configured={connection.config.enabled}
      connected={connection.tenant.connected}
      createCatalogItemAction={createQuickBooksCatalogItemAction}
      filteredItemCount={data.filteredItemCount}
      filters={data.filters}
      importedItemCount={data.itemCount}
      itemTypes={data.itemTypes}
      items={data.items}
      modeMismatch={connection.tenant.modeMismatch}
      notice={notice}
      reconnectRequired={connection.tenant.reconnectRequired}
      updateCatalogItemAction={updateQuickBooksCatalogItemAction}
      inactiveItemCount={data.inactiveCount}
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

  const catalogSearch = readSearchParam(params, "qboSearch");
  const catalogItemType = readSearchParam(params, "qboType");
  const catalogStatusRaw = readSearchParam(params, "qboStatus", "all");
  const catalogStatus = catalogStatusRaw === "active" || catalogStatusRaw === "inactive" ? catalogStatusRaw : "all";
  const catalogPage = readPositiveInt(readSearchParam(params, "qboPage", "1"), 1);
  const customersPage = readPositiveInt(readSearchParam(params, "customersPage", "1"), 1);
  const feesPage = readPositiveInt(readSearchParam(params, "feesPage", "1"), 1);
  const feeEditor = readSearchParam(params, "feeEditor") || null;

  const [billingSettings, brandingSettings, quickBooksSettings] = await Promise.all([
    getTenantBillingSettings(actor),
    getTenantBrandingSettings(actor),
    getTenantQuickBooksConnectionSettings(actor)
  ]);
  const theme = buildTenantBrandingCss(brandingSettings.branding);
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
  const catalogNotice = Array.isArray(params.catalog)
    ? params.catalog[0]
    : typeof params.catalog === "string"
      ? decodeURIComponent(params.catalog)
      : null;

  const customersOpen = isSectionOpen(params, "customersOpen", customerNotice);
  const catalogOpen = isSectionOpen(params, "catalogOpen", catalogNotice);
  const feesOpen = isSectionOpen(params, "feesOpen");
  const mappingsOpen = isSectionOpen(params, "mappingsOpen", quickBooksNotice);

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] p-6 text-white shadow-panel" style={{ background: `linear-gradient(135deg, ${theme["--tenant-primary"]} 0%, ${theme["--tenant-accent"]} 100%)` }}>
        <p className="text-sm uppercase tracking-[0.25em] text-white/70">Tenant settings</p>
        <h2 className="mt-2 text-3xl font-semibold">Billing and branding</h2>
        <p className="mt-3 max-w-2xl text-white/80">Manage subscription readiness, billing contacts, and the brand details that appear in the customer portal and report packets.</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <TenantBrandingForm action={updateTenantBrandingAction} values={{ ...brandingSettings.branding, billingEmail: brandingSettings.billingEmail }} />
          {customersOpen ? (
            <Suspense
              key={`customers-${customersPage}`}
              fallback={
                <LazySectionCard
                  actionHref={buildSettingsHref(params, { customersOpen: null, customersPage: null })}
                  actionLabel="Hide section"
                  description="Loading the current customer page..."
                  eyebrow="Customer companies"
                  title="Create and edit current customers"
                  tone="loading"
                />
              }
            >
              <CustomersSection actor={actor} notice={customerNotice} page={customersPage} />
            </Suspense>
          ) : (
            <LazySectionCard
              actionHref={buildSettingsHref(params, { customersOpen: 1, customersPage: 1 })}
              actionLabel="Open customers"
              description="Load customer companies only when you need them, with a paginated current-customer list and its own empty and error states."
              eyebrow="Customer companies"
              title="Create and edit current customers"
            />
          )}
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
          {catalogOpen ? (
            <Suspense
              key={`catalog-${catalogPage}-${catalogSearch}-${catalogItemType}-${catalogStatus}`}
              fallback={
                <LazySectionCard
                  actionHref={buildSettingsHref(params, { catalogOpen: null, qboPage: null, qboSearch: null, qboType: null, qboStatus: null })}
                  actionLabel="Hide section"
                  description="Loading the current products and services page..."
                  eyebrow="QuickBooks products and services"
                  title="Create and edit billing catalog items"
                  tone="loading"
                />
              }
            >
              <CatalogSection
                actor={actor}
                connection={quickBooksSettings}
                itemType={catalogItemType}
                notice={catalogNotice}
                page={catalogPage}
                search={catalogSearch}
                status={catalogStatus}
              />
            </Suspense>
          ) : (
            <LazySectionCard
              actionHref={buildSettingsHref(params, { catalogOpen: 1, qboPage: 1 })}
              actionLabel="Open products and services"
              description="Load the QuickBooks catalog only when needed, with paginated results, filters, and independent loading and error states."
              eyebrow="QuickBooks products and services"
              title="Create and edit billing catalog items"
            />
          )}
          {mappingsOpen ? (
            <Suspense
              key="quickbooks-mappings"
              fallback={
                <LazySectionCard
                  actionHref={buildSettingsHref(params, { mappingsOpen: null })}
                  actionLabel="Hide section"
                  description="Loading stored QuickBooks mappings and suggested matches..."
                  eyebrow="QuickBooks item mappings"
                  title="Map billable codes to QuickBooks items"
                  tone="loading"
                />
              }
            >
              <QuickBooksMappingsSection actor={actor} notice={quickBooksNotice} />
            </Suspense>
          ) : (
            <LazySectionCard
              actionHref={buildSettingsHref(params, { mappingsOpen: 1 })}
              actionLabel="Open item mappings"
              description="Review stored QuickBooks item ids for each internal billing code, fix inactive references, and confirm suggested matches without loading the full section until you need it."
              eyebrow="QuickBooks item mappings"
              title="Map billable codes to QuickBooks items"
            />
          )}
          {feesOpen ? (
            <Suspense
              key={`fees-${feesPage}`}
              fallback={
                <LazySectionCard
                  actionHref={buildSettingsHref(params, { feesOpen: null, feesPage: null })}
                  actionLabel="Hide section"
                  description="Loading the current service fee rules page..."
                  eyebrow="Inspection service fees"
                  title="Default fee and location rules"
                  tone="loading"
                />
              }
            >
              <ServiceFeesSection activeEditor={feeEditor} actor={actor} page={feesPage} />
            </Suspense>
          ) : (
            <LazySectionCard
              actionHref={buildSettingsHref(params, { feesOpen: 1, feesPage: 1 })}
              actionLabel="Open service fee rules"
              description="Load service fee rules only when you open the section. Rules stay paginated and keep their own loading, empty, and error states."
              eyebrow="Inspection service fees"
              title="Default fee and location rules"
            />
          )}
        </div>
        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
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
          </div>
          <div className="space-y-4 rounded-[2rem] bg-white p-6 shadow-panel">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Plans</p>
              <h3 className="mt-2 text-2xl font-semibold text-ink">Available subscriptions</h3>
            </div>
            {billingSettings.config.plans.map((plan) => (
              <div key={plan.code} className="rounded-[1.5rem] border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-ink">{plan.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{plan.highlight}</p>
                  </div>
                  <p className="text-xl font-semibold text-ink">${(plan.monthlyPriceCents / 100).toFixed(0)}</p>
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {plan.features.map((feature) => <p key={feature}>{feature}</p>)}
                </div>
                {canManageSubscription ? (
                  <form action={startBillingCheckoutAction} className="mt-4">
                    <input name="planCode" type="hidden" value={plan.code} />
                    <button className="w-full rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!billingSettings.config.enabled || !plan.stripePriceId} type="submit">
                      {plan.code === "enterprise" ? "Request enterprise billing" : `Choose ${plan.label}`}
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
