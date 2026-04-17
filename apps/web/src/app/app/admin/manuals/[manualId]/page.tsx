import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getManualById } from "@testworx/lib/server/index";
import { AppPageShell, PageHeader } from "../../operations-ui";
import { archiveManualAction, updateManualAction } from "../../../manuals/actions";
import { ManualForm } from "../../../manuals/components/ManualForm";

export default async function ManualEditPage({
  params
}: {
  params: Promise<{ manualId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  if (!["platform_admin", "tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app/manuals");
  }

  const { manualId } = await params;
  const manual = await getManualById(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    manualId
  );

  return (
    <AppPageShell>
      <PageHeader
        actions={
          manual.isActive ? (
            <form action={archiveManualAction}>
              <input name="manualId" type="hidden" value={manual.id} />
              <button className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" type="submit">
                Archive manual
              </button>
            </form>
          ) : null
        }
        backNavigation={{ fallbackHref: "/app/admin/manuals", label: "Back to manuals admin" }}
        description="Update metadata, replace the PDF when needed, and keep favorites and field search clean for technicians."
        eyebrow="Manuals admin"
        title={`Edit ${manual.title}`}
      />
      <ManualForm
        action={updateManualAction}
        heading="Edit manual"
        submitLabel="Save changes"
        values={{
          manualId: manual.id,
          title: manual.title,
          manufacturer: manual.manufacturer,
          systemCategory: manual.systemCategory,
          productFamily: manual.productFamily,
          model: manual.model,
          documentType: manual.documentType,
          revisionLabel: manual.revisionLabel,
          revisionDate: manual.revisionDate ? manual.revisionDate.toISOString().slice(0, 10) : null,
          description: manual.description,
          notes: manual.notes,
          tags: manual.tags,
          source: manual.source,
          isActive: manual.isActive,
          isOfflineEligible: manual.isOfflineEligible,
          searchableTextStatus: manual.searchableTextStatus,
          searchableText: manual.searchableText
        }}
      />
    </AppPageShell>
  );
}
