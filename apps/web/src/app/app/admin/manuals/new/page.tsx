import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppPageShell, PageHeader } from "../../operations-ui";
import { createManualAction } from "../../../manuals/actions";
import { ManualForm } from "../../../manuals/components/ManualForm";

export default async function ManualCreatePage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  if (!["platform_admin", "tenant_admin", "office_admin"].includes(session.user.role)) {
    redirect("/app/manuals");
  }

  return (
    <AppPageShell>
      <PageHeader
        backNavigation={{ fallbackHref: "/app/admin/manuals", label: "Back to manuals admin" }}
        description="Create a clean, searchable manual entry that the field team can find quickly by title, manufacturer, model, or tag."
        eyebrow="Manuals admin"
        title="Add manual"
      />
      <ManualForm action={createManualAction} heading="New manual" submitLabel="Create manual" />
    </AppPageShell>
  );
}
