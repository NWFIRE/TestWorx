import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@testworx/db";
import { getTechnicianDashboardData } from "@testworx/lib/server/index";
import { TechnicianWorkScreen } from "../technician-work-screen";

export default async function TechnicianWorkPage({
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (session.user.role !== "technician") {
    redirect("/app");
  }

  const [dashboard, tenant] = await Promise.all([
    getTechnicianDashboardData({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }),
    prisma.tenant.findUnique({ where: { id: session.user.tenantId }, select: { timezone: true } })
  ]);
  return <TechnicianWorkScreen initialData={{ dashboard, timezone: tenant?.timezone ?? "America/Chicago" }} />;
}
