import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getPaginatedTenantCustomerCompanyDirectory } from "@testworx/lib";

import { AppPageShell, KPIStatCard, PageHeader } from "../operations-ui";
import { CustomerManagementCard } from "../settings/customer-management-card";
import { createCustomerCompanyAction } from "./actions";

type SearchParams = Record<string, string | string[] | undefined>;

function readSearchParam(params: SearchParams, key: string, fallback = "") {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? fallback : fallback;
}

function readPositiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function ClientsPage({
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
  const customersPage = readPositiveInt(readSearchParam(params, "customersPage", "1"), 1);
  const customersQuery = readSearchParam(params, "customersQuery");
  const customerNotice = Array.isArray(params.customers)
    ? params.customers[0]
    : typeof params.customers === "string"
      ? decodeURIComponent(params.customers)
      : null;

  const data = await getPaginatedTenantCustomerCompanyDirectory(actor, {
    page: customersPage,
    limit: 10,
    query: customersQuery
  });

  return (
    <AppPageShell density="wide">
      <PageHeader
        eyebrow="Clients"
        title="Customer companies"
        description="Manage client records, billing profiles, service addresses, and QuickBooks-linked customer accounts from one dedicated workspace."
        contentWidth="full"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          label="Total clients"
          note="All customer companies available across scheduling, billing, and quotes."
          tone="blue"
          value={data.pagination.overallCount}
        />
        <KPIStatCard
          label="Current results"
          note={customersQuery ? "Matches for the active client search." : "Clients on the current page."}
          tone="slate"
          value={data.pagination.totalCount}
        />
        <KPIStatCard
          label="Active on page"
          note="Customer profiles available to open from this page of results."
          tone="emerald"
          value={data.pagination.totalCount}
        />
        <KPIStatCard
          label="Profiles"
          note="Open a customer profile for full contact, site, billing, and history details."
          tone="violet"
          value={data.pagination.overallCount}
        />
      </section>

      <CustomerManagementCard
        createCustomerAction={createCustomerCompanyAction}
        customers={data.customers}
        filters={data.filters}
        notice={customerNotice}
        pagination={data.pagination}
      />
    </AppPageShell>
  );
}
