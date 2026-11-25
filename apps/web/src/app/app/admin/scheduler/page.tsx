import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getScheduler } from "@testworx/lib/scheduler";
import { SchedulerBoard } from "./scheduler-board";
import { shiftSchedulerDate } from "@testworx/lib/scheduler-shared";
export default async function SchedulerPage({ searchParams }: { searchParams?: Promise<{ date?: string; view?: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");
  if (!["office_admin", "tenant_admin"].includes(session.user.role)) redirect("/app");
  const params = await searchParams ?? {};
  try { if (params.date) shiftSchedulerDate(params.date, 0); } catch { redirect("/app/admin/scheduler"); }
  if (params.view && !["day", "week"].includes(params.view)) redirect("/app/admin/scheduler");
  const actor = { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId };
  const initial = await getScheduler(actor, params);
  return <SchedulerBoard initial={initial} initialView={params.view === "week" ? "week" : "day"} />;
}
