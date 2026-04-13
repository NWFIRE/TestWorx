import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getClientProfileData } from "@testworx/lib";

import { AppPageShell, PageHeader } from "../../operations-ui";
import { ClientProfileWorkspace } from "../client-profile-workspace";

export default async function ClientProfilePage({
  params
}: {
  params: Promise<{ customerId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  const { customerId } = await params;
  const data = await getClientProfileData(
    {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    },
    customerId
  );

  if (!data) {
    notFound();
  }

  return (
    <AppPageShell density="wide">
      <PageHeader
        backNavigation={{ label: "Back to clients", fallbackHref: "/app/admin/clients" }}
        eyebrow="Clients"
        title={data.customer.name}
        description="A complete account workspace with operational history, site context, billing visibility, and customer documents."
        contentWidth="full"
      />

      <ClientProfileWorkspace data={data} />
    </AppPageShell>
  );
}
