import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getPaginatedTenantQuickBooksCatalogSettings,
  getTenantQuickBooksConnectionSettings
} from "@testworx/lib";

import { AppPageShell, KPIStatCard, PageHeader } from "../operations-ui";
import { QuickBooksCatalogManagementCard } from "../settings/quickbooks-catalog-management-card";
import {
  createQuickBooksCatalogItemInlineAction,
  importQuickBooksCatalogItemsInlineAction,
  updateQuickBooksCatalogItemInlineAction
} from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

function readSearchParam(params: SearchParams, key: string, fallback = "") {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? fallback : fallback;
}

function readPositiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function PartsAndServicesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  const params = searchParams ? await searchParams : {};
  const actor = {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  };
  const catalogSearch = readSearchParam(params, "qboSearch");
  const catalogItemType = readSearchParam(params, "qboType");
  const catalogStatusRaw = readSearchParam(params, "qboStatus", "all");
  const catalogStatus = catalogStatusRaw === "active" || catalogStatusRaw === "inactive" ? catalogStatusRaw : "all";
  const catalogPage = readPositiveInt(readSearchParam(params, "qboPage", "1"), 1);

  const [connection, catalog] = await Promise.all([
    getTenantQuickBooksConnectionSettings(actor),
    getPaginatedTenantQuickBooksCatalogSettings(actor, {
      page: catalogPage,
      search: catalogSearch,
      itemType: catalogItemType,
      status: catalogStatus
    })
  ]);

  return (
    <AppPageShell density="wide">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              href="/app/admin/billing/create"
            >
              Create invoice
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              href="/app/admin/settings"
            >
              Back to settings
            </Link>
          </div>
        }
        description="Manage the synced QuickBooks catalog used across quotes, billing, and direct invoice creation."
        eyebrow="Parts and services"
        title="QuickBooks products and services"
        contentWidth="full"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          label="QuickBooks"
          note={connection.tenant.quickbooksCompanyName ?? "No company connected"}
          tone={connection.tenant.connected ? "emerald" : "amber"}
          value={connection.tenant.connected ? "Connected" : "Needs attention"}
        />
        <KPIStatCard
          label="Imported items"
          note="Active QuickBooks products and services cached in TradeWorx."
          tone="blue"
          value={catalog.itemCount}
        />
        <KPIStatCard
          label="Active items"
          note="Available for quotes and direct invoice creation."
          tone="emerald"
          value={catalog.activeCount}
        />
        <KPIStatCard
          label="Inactive items"
          note="Retained for visibility but hidden from new invoice creation."
          tone="slate"
          value={catalog.inactiveCount}
        />
      </section>

      <QuickBooksCatalogManagementCard
        activeItemCount={catalog.activeCount}
        configured={connection.config.enabled}
        connected={connection.tenant.connected}
        createCatalogItemAction={createQuickBooksCatalogItemInlineAction}
        filteredItemCount={catalog.filteredItemCount}
        filters={catalog.filters}
        importedItemCount={catalog.itemCount}
        importCatalogAction={importQuickBooksCatalogItemsInlineAction}
        itemTypes={catalog.itemTypes}
        items={catalog.items}
        modeMismatch={connection.tenant.modeMismatch}
        reconnectRequired={connection.tenant.reconnectRequired}
        updateCatalogItemAction={updateQuickBooksCatalogItemInlineAction}
        inactiveItemCount={catalog.inactiveCount}
      />
    </AppPageShell>
  );
}
