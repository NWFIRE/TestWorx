import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildTenantBrandingCss, canManageBilling, getTenantBillingSettings, getTenantBrandingSettings, getTenantCustomerCompanySettings, getTenantQuickBooksSettings, getTenantServiceFeeSettings } from "@testworx/lib";

import {
  createCustomerCompanyAction,
  createQuickBooksCatalogItemAction,
  createServiceFeeRuleAction,
  deleteServiceFeeRuleAction,
  disconnectQuickBooksAction,
  importQuickBooksCustomersAction,
  importQuickBooksCatalogItemsAction,
  syncQuickBooksCustomersAction,
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
import { ServiceFeeSettingsCard } from "./service-fee-settings-card";
import { QuickBooksSettingsCard } from "./quickbooks-settings-card";
import { TenantBrandingForm } from "./tenant-branding-form";

export default async function TenantSettingsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  const params = searchParams ? await searchParams : {};
  const catalogSearch = typeof params.qboSearch === "string" ? params.qboSearch : Array.isArray(params.qboSearch) ? params.qboSearch[0] ?? "" : "";
  const catalogItemType = typeof params.qboType === "string" ? params.qboType : Array.isArray(params.qboType) ? params.qboType[0] ?? "" : "";
  const catalogStatus = typeof params.qboStatus === "string" ? params.qboStatus : Array.isArray(params.qboStatus) ? params.qboStatus[0] ?? "all" : "all";
  const catalogPageRaw = typeof params.qboPage === "string" ? params.qboPage : Array.isArray(params.qboPage) ? params.qboPage[0] ?? "1" : "1";
  const catalogPage = Number.isFinite(Number(catalogPageRaw)) ? Number(catalogPageRaw) : 1;
  const [billingSettings, brandingSettings, customerCompanies, serviceFeeSettings, quickBooksSettings] = await Promise.all([
    getTenantBillingSettings({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    getTenantBrandingSettings({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    getTenantCustomerCompanySettings({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    getTenantServiceFeeSettings({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    getTenantQuickBooksSettings(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        search: catalogSearch,
        itemType: catalogItemType,
        status: catalogStatus === "active" || catalogStatus === "inactive" ? catalogStatus : "all",
        page: catalogPage
      }
    )
  ]);
  const theme = buildTenantBrandingCss(brandingSettings.branding);
  const canManageSubscription = canManageBilling(session.user.role);
  const quickBooksNotice = Array.isArray(params.quickbooks)
    ? params.quickbooks[0]
    : params.quickbooks === "connected"
      ? "QuickBooks connected."
      : params.quickbooks === "disconnected"
        ? "QuickBooks disconnected."
        : params.quickbooks === "error"
          ? "QuickBooks connection failed. Try again."
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
          <CustomerManagementCard
            createCustomerAction={createCustomerCompanyAction}
            customers={customerCompanies}
            notice={customerNotice}
            updateCustomerAction={updateCustomerCompanyAction}
          />
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
            syncCustomersAction={syncQuickBooksCustomersAction}
            importCustomersAction={importQuickBooksCustomersAction}
            importCatalogAction={importQuickBooksCatalogItemsAction}
            hasStoredConnection={quickBooksSettings.tenant.hasStoredConnection}
            importedItemCount={quickBooksSettings.catalog.itemCount}
            filteredItemCount={quickBooksSettings.catalog.filteredItemCount}
            importedItems={quickBooksSettings.catalog.items}
            lastImportedAt={quickBooksSettings.catalog.lastImportedAt}
            activeItemCount={quickBooksSettings.catalog.activeCount}
            inactiveItemCount={quickBooksSettings.catalog.inactiveCount}
            itemTypes={quickBooksSettings.catalog.itemTypes}
            filters={quickBooksSettings.catalog.filters}
            notice={quickBooksNotice}
            realmId={quickBooksSettings.tenant.quickbooksRealmId}
            supportReference={quickBooksSettings.supportReference}
          />
          <QuickBooksCatalogManagementCard
            configured={quickBooksSettings.config.enabled}
            connected={quickBooksSettings.tenant.connected}
            createCatalogItemAction={createQuickBooksCatalogItemAction}
            items={quickBooksSettings.catalog.items}
            modeMismatch={quickBooksSettings.tenant.modeMismatch}
            notice={catalogNotice}
            reconnectRequired={quickBooksSettings.tenant.reconnectRequired}
            updateCatalogItemAction={updateQuickBooksCatalogItemAction}
          />
          <ServiceFeeSettingsCard
            createRuleAction={createServiceFeeRuleAction}
            customers={serviceFeeSettings.customers}
            defaultValues={{
              defaultServiceFeeCode: serviceFeeSettings.tenant.defaultServiceFeeCode ?? "SERVICE_FEE",
              defaultServiceFeeUnitPrice: serviceFeeSettings.tenant.defaultServiceFeeUnitPrice
            }}
            deleteRuleAction={deleteServiceFeeRuleAction}
            rules={serviceFeeSettings.rules}
            sites={serviceFeeSettings.sites}
            updateDefaultAction={updateDefaultServiceFeeAction}
            updateRuleAction={updateServiceFeeRuleAction}
          />
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
