import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { registerTechnicianDevice } from "@testworx/lib/server/index";

const bodySchema = z.object({
  platform: z.enum(["ios", "android"]),
  token: z.string().min(1),
  deviceName: z.string().trim().optional().nullable(),
  appBuild: z.string().trim().optional().nullable(),
  nativeAppVersion: z.string().trim().optional().nullable()
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId || session.user.role !== "technician") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = bodySchema.parse(await request.json());
    const badgeCount = await registerTechnicianDevice(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed
    );

    return NextResponse.json({ ok: true, badgeCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to register technician device." },
      { status: 400 }
    );
  }
}
