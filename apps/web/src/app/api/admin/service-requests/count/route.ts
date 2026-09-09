import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPendingFieldServiceRequestCount } from "@testworx/lib/server/index";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["office_admin", "tenant_admin", "platform_admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const count = await getPendingFieldServiceRequestCount({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
    return NextResponse.json({ count }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load request count." }, { status: 503 });
  }
}
