import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getManualLibraryData, getTechnicianDashboardData } from "@testworx/lib/server/index";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId || session.user.role !== "technician") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = {
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    };
    const [dashboard, manuals] = await Promise.all([
      getTechnicianDashboardData(actor),
      getManualLibraryData(actor)
    ]);

    return NextResponse.json({
      dashboard,
      manuals,
      user: {
        name: session.user.name ?? null,
        email: session.user.email ?? null
      },
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync technician updates." },
      { status: 500 }
    );
  }
}
