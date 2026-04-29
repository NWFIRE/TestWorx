import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getManualById, trackManualView } from "@testworx/lib/server/index";
import { ManualActionBar } from "../components/ManualActionBar";
import { ManualDetailHeader } from "../components/ManualDetailHeader";
import { ManualMetadataCard } from "../components/ManualMetadataCard";
import { ManualQuickLookup } from "../components/ManualQuickLookup";
import { ManualViewerPanel } from "../components/ManualViewerPanel";

export default async function ManualDetailPage({
  params
}: {
  params: Promise<{ manualId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  if (!["platform_admin", "tenant_admin", "office_admin", "technician"].includes(session.user.role)) {
    redirect("/app");
  }

  const { manualId } = await params;
  const actor = { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId };
  await trackManualView(actor, manualId);
  const manual = await getManualById(actor, manualId);

  return (
    <div className="space-y-6">
      <ManualDetailHeader manual={manual as never} />
      <ManualActionBar manual={manual as never} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <ManualMetadataCard manual={manual as never} />
          <ManualQuickLookup manual={manual as never} />
        </div>
        <ManualViewerPanel manual={manual as never} />
      </div>
    </div>
  );
}
