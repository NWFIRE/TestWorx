import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getPaginatedTenantCustomerCompanyDirectory } from "@testworx/lib/server/index";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const query = searchParams.get("query") ?? "";

  try {
    const result = await getPaginatedTenantCustomerCompanyDirectory(
      {
        userId: session.user.id,
        role: session.user.role,
        tenantId: session.user.tenantId
      },
      {
        page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
        limit: 10,
        query
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load customers." },
      { status: 500 }
    );
  }
}

