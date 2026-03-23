import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { finalizeInspectionReport } from "@testworx/lib";

function getStatusCode(error: unknown) {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (/unauthorized/i.test(error.message)) {
    return 401;
  }

  if (/does not have access|locked|cannot be finalized/i.test(error.message)) {
    return 403;
  }

  if (/not found|required|must be|supported|smaller|all report sections/i.test(error.message)) {
    return 422;
  }

  return 400;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const finalized = await finalizeInspectionReport(
      {
        userId: session.user.id,
        role: session.user.role,
        tenantId: session.user.tenantId
      },
      body
    );

    return NextResponse.json({ ok: true, status: finalized.status, finalizedAt: finalized.finalizedAt?.toISOString() ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to finalize report." }, { status: getStatusCode(error) });
  }
}
