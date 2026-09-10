import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getJobTime, recordJobTimeEvent, correctJobTime } from "@testworx/lib/server/index";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const inspectionId = new URL(request.url).searchParams.get("inspectionId") ?? "";
    return NextResponse.json(await getJobTime({ userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role }, inspectionId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load job time." }, { status: 403 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const actor = { userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role };
    if (body.action === "correct") await correctJobTime(actor, body);
    else await recordJobTimeEvent(actor, body);
    revalidatePath("/app/admin/inspections");
    revalidatePath("/app/tech/inspections");
    revalidatePath("/app/tech/work");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update job time." }, { status: 409 });
  }
}
