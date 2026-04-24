import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { dismissTechnicianNotification } from "@testworx/lib/server/index";

const bodySchema = z.object({
  notificationId: z.string().min(1)
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId || session.user.role !== "technician") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = bodySchema.parse(await request.json());
    const badgeCount = await dismissTechnicianNotification(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed.notificationId
    );

    return NextResponse.json({ ok: true, badgeCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to dismiss technician notification." },
      { status: 400 }
    );
  }
}
