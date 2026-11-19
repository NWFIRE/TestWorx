import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveServiceLocation } from "@testworx/lib/service-location";

export async function PATCH(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId || !["tenant_admin", "office_admin"].includes(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const { siteId } = await params;
    const site = await saveServiceLocation({ userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role }, siteId, await request.json());
    return NextResponse.json({ site });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save location." }, { status: 400 }); }
}
