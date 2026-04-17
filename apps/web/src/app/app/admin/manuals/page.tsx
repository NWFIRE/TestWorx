import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getManualLibraryData } from "@testworx/lib/server/index";
import { AppPageShell, PageHeader } from "../operations-ui";
import { ManualCard } from "../../manuals/components/ManualCard";

export default async function ManualsAdminListPage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  if (!["platform_admin", "tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app/manuals");
  }

  const data = await getManualLibraryData({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  });

  return (
    <AppPageShell>
      <PageHeader
        actions={
          <Link className="rounded-2xl bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-white" href="/app/admin/manuals/new">
            Add manual
          </Link>
        }
        description="Manage metadata, revisions, active state, and PDF files for the field manuals library."
        eyebrow="Manuals admin"
        title="Manual management"
      />
      <div className="grid gap-4">
        {data.manuals.map((manual) => (
          <div key={manual.id} className="space-y-2">
            <ManualCard adminContext manual={manual as never} />
            <div className="flex justify-end">
              <Link className="text-sm font-semibold text-[var(--tenant-primary)]" href={`/app/admin/manuals/${manual.id}`}>
                Edit manual →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </AppPageShell>
  );
}
