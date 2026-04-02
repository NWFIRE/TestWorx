import Link from "next/link";
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
  let workspace:
    | Awaited<ReturnType<typeof getTeamWorkspaceData>>
    | null = null;
  let workspaceError: string | null = null;

  try {
    workspace = await getTeamWorkspaceData(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        query: readParam(resolvedSearchParams, "q"),
        status: readParam(resolvedSearchParams, "status"),
        role: readParam(resolvedSearchParams, "role")
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Team access is temporarily unavailable.";
    workspaceError =
      message === "User not found."
        ? "Your session is out of date. Sign in again to open Team and Portal Access."
        : message;
  }

  if (!workspace) {
    return (
      <main className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-panel">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Team and portal access</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Workspace access needs attention</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{workspaceError ?? "Team access is temporarily unavailable."}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-5 py-3 text-sm font-semibold text-white"
              href={workspaceError === "Your session is out of date. Sign in again to open Team and Portal Access." ? "/login" : "/app/admin"}
            >
              {workspaceError === "Your session is out of date. Sign in again to open Team and Portal Access." ? "Return to sign in" : "Back to admin"}
            </Link>
          </div>
        </section>
      </main>
    );
  }

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
