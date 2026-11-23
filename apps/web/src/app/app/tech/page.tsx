import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@testworx/db";
import { getManualLibraryData, getTechnicianDashboardData } from "@testworx/lib/server/index";

import { TechnicianHomeScreen } from "./technician-home-screen";

export const metadata = { title: "Home | TradeWorx" };

export default async function TechnicianHomePage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "technician") {
    redirect("/app");
  }

  const [dashboard, manuals, tenant] = await Promise.all([
    getTechnicianDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    getManualLibraryData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { timezone: true } })
  ]);

  return (
    <TechnicianHomeScreen
      initialData={{ dashboard, manuals, timezone: tenant?.timezone ?? "America/Chicago" }}
      userFirstName={session.user.name?.split(" ")[0] ?? null}
    />
  );
}
