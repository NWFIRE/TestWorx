import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminInspectionCreateOptions } from "@testworx/lib/server/index";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId || !["office_admin", "tenant_admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const options = await getAdminInspectionCreateOptions({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
  return NextResponse.json(options, { headers: { "Cache-Control": "no-store" } });
}
