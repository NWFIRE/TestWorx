import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getTechnicianDashboardData } from "@testworx/lib/server/index";
import { TechnicianInspectionsScreen } from "../technician-inspections-screen";

export default async function TechnicianInspectionsPage() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "technician") {
    redirect("/app");
  }

  const dashboard = await getTechnicianDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
  return <TechnicianInspectionsScreen initialData={{ dashboard }} />;
}
