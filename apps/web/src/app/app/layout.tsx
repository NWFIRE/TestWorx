import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { buildTenantBrandingCss, getTenantBrandingSettings } from "@testworx/lib";
import { AppShell } from "./app-shell";
import { MobilePullToRefresh } from "./mobile-pull-to-refresh";

function isStaleSessionError(error: unknown) {
  return error instanceof Error && /tenant not found|user not found/i.test(error.message);
}

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  let theme: React.CSSProperties | undefined;

  if (session.user.tenantId) {
    try {
      theme = buildTenantBrandingCss(
        (
          await getTenantBrandingSettings({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId })
        ).branding
      );
    } catch (error) {
      if (isStaleSessionError(error)) {
        redirect("/login?session=stale");
      }
      throw error;
    }
  }

  const signOutAction = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <div className="min-h-screen bg-slate-100" style={theme}>
      <MobilePullToRefresh />
      <AppShell
        role={session.user.role}
        signOutAction={signOutAction}
        user={{ email: session.user.email ?? null, name: session.user.name ?? null }}
      >
        {children}
      </AppShell>
    </div>
  );
}

