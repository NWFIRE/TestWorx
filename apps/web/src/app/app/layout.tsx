import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { buildTenantBrandingCss, getTenantBrandingSettings } from "@testworx/lib";
import { AppQuickNav } from "./app-quick-nav";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const theme = session.user.tenantId
    ? buildTenantBrandingCss(
        (
          await getTenantBrandingSettings({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId })
        ).branding
      )
    : undefined;

  return (
    <div className="min-h-screen bg-slate-100" style={theme}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">TradeWorx</p>
            <h1 className="text-lg font-semibold text-ink">{session.user.name}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm text-slate-500">
              <p>{session.user.email}</p>
              <p className="capitalize">{session.user.role.replaceAll("_", " ")}</p>
            </div>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
              <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <AppQuickNav role={session.user.role} />
        {children}
      </main>
    </div>
  );
}

