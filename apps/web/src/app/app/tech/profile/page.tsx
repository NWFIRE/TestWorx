import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { getManualLibraryData, getTechnicianDashboardData } from "@testworx/lib/server/index";
import { TechnicianProfileScreen } from "../technician-profile-screen";

export default async function TechnicianProfilePage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "technician") {
    redirect("/app");
  }

  const [dashboard, manuals] = await Promise.all([
    getTechnicianDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    getManualLibraryData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId })
  ]);

  const signOutAction = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <div className="space-y-5 pb-4">
      <TechnicianProfileScreen
        initialData={{
          dashboard,
          manuals,
          user: {
            name: session.user.name ?? null,
            email: session.user.email ?? null
          }
        }}
      />
      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <form action={signOutAction}>
          <button className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700" type="submit">
            Log out
          </button>
        </form>
      </section>
    </div>
  );
}
