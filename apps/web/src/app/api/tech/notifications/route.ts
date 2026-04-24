import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getTechnicianNotificationSummary } from "@testworx/lib/server/index";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId || session.user.role !== "technician") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await getTechnicianNotificationSummary({
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    });

    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load technician notifications." },
      { status: 500 }
    );
  }
}
