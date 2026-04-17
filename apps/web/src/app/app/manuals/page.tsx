import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getManualLibraryData } from "@testworx/lib/server/index";
import { FavoriteManualsSection } from "./components/FavoriteManualsSection";
import { ManualCard } from "./components/ManualCard";
import { ManualCategoryTabs } from "./components/ManualCategoryTabs";
import { ManualFilters } from "./components/ManualFilters";
import { ManualsPageHeader } from "./components/ManualsPageHeader";
import { ManualSearchBar } from "./components/ManualSearchBar";
import { RecentManualsSection } from "./components/RecentManualsSection";

function readBooleanParam(value: string | string[] | undefined) {
  return value === "true";
}

export default async function ManualsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  if (!["platform_admin", "tenant_admin", "office_admin", "technician"].includes(session.user.role)) {
    redirect("/app");
  }

  const params = await searchParams;
  const data = await getManualLibraryData(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    {
      query: typeof params.query === "string" ? params.query : undefined,
      systemCategory: typeof params.systemCategory === "string" ? params.systemCategory as "wet_chemical" | "industrial_dry_chemical" : undefined,
      manufacturer: typeof params.manufacturer === "string" ? params.manufacturer : undefined,
      model: typeof params.model === "string" ? params.model : undefined,
      documentType: typeof params.documentType === "string" ? params.documentType as never : undefined,
      favoritesOnly: readBooleanParam(params.favoritesOnly),
      recentOnly: readBooleanParam(params.recentOnly),
      isActive: readBooleanParam(params.activeOnly) ? true : undefined
    }
  );

  return (
    <div className="space-y-6">
      <ManualsPageHeader canManage={data.canManage} />

      <form className="space-y-4">
        <div className="rounded-[24px] border border-[color:rgb(203_215_230_/_0.92)] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <ManualSearchBar query={typeof params.query === "string" ? params.query : undefined} />
            <button className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white" type="submit">
              Search manuals
            </button>
          </div>
        </div>
        <ManualCategoryTabs activeCategory={typeof params.systemCategory === "string" ? params.systemCategory : undefined} />
        <ManualFilters
          activeOnly={readBooleanParam(params.activeOnly)}
          documentType={typeof params.documentType === "string" ? params.documentType : undefined}
          favoritesOnly={readBooleanParam(params.favoritesOnly)}
          manufacturer={typeof params.manufacturer === "string" ? params.manufacturer : undefined}
          manufacturers={data.filterOptions.manufacturers}
          model={typeof params.model === "string" ? params.model : undefined}
          models={data.filterOptions.models}
        />
      </form>

      <FavoriteManualsSection manuals={data.favorites as never} />
      <RecentManualsSection manuals={data.recent as never} />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Library</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Manuals library</h2>
          </div>
          {data.canManage ? (
            <Link className="text-sm font-semibold text-[var(--tenant-primary)]" href="/app/admin/manuals">
              Open admin management
            </Link>
          ) : null}
        </div>
        <div className="grid gap-4">
          {data.manuals.length > 0 ? data.manuals.map((manual) => (
            <ManualCard key={manual.id} manual={manual as never} />
          )) : (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-white p-8 text-sm text-slate-500">
              No manuals match the current search and filter combination.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
