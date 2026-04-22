import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getManualLibraryData, getTechnicianDashboardData } from "@testworx/lib/server/index";

import { TechnicianHomeScreen } from "./technician-home-screen";

export default async function TechnicianHomePage() {
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

  return (
    <TechnicianHomeScreen
      initialData={{ dashboard, manuals }}
      userFirstName={session.user.name?.split(" ")[0] ?? null}
    />
  );
}
