import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getTeamWorkspaceData } from "@testworx/lib";

import { TeamManagementWorkspace } from "./team-management-workspace";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

export default async function AdminTeamPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  const resolvedSearchParams = await searchParams;
  const workspace = await getTeamWorkspaceData(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    {
      query: readParam(resolvedSearchParams, "q"),
      status: readParam(resolvedSearchParams, "status"),
      role: readParam(resolvedSearchParams, "role")
    }
  );

  return (
    <main className="space-y-6">
      <TeamManagementWorkspace
        customerCompanies={workspace.customerCompanies}
        customerInvites={workspace.customerInvites}
        customerPortalUsers={workspace.customerPortalUsers}
        filters={workspace.filters}
        summary={workspace.summary}
        teamInvites={workspace.teamInvites}
        teamMembers={workspace.teamMembers}
      />
    </main>
  );
}
