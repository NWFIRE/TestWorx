import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getScheduler, getSchedulerJob, saveSchedulerJob, searchSchedulerJobs } from "@testworx/lib/scheduler";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId || !["office_admin", "tenant_admin"].includes(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const actor = { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId };
  try {
    const params = new URL(request.url).searchParams;
    const result = params.has("id") ? { job: await getSchedulerJob(actor, params.get("id") || "") } : params.has("q") ? { jobs: await searchSchedulerJobs(actor, params.get("q") || "") }
      : await getScheduler(actor, { date: params.get("date") || undefined, view: params.get("view") || undefined });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Scheduler." }, { status: 400 }); }
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId || !["office_admin", "tenant_admin"].includes(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const result = await saveSchedulerJob({ userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role }, await request.json());
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save schedule." }, { status: 409 }); }
}
