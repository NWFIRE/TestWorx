import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAuthorizedReportMediaDownload } from "@testworx/lib/server/index";

function getStatusCode(error: unknown) {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (/unauthorized/i.test(error.message)) {
    return 401;
  }

  if (/not found/i.test(error.message)) {
    return 404;
  }

  if (/do not have access/i.test(error.message)) {
    return 403;
  }

  return 400;
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const reportId = url.searchParams.get("reportId");
    const storageKey = url.searchParams.get("storageKey");

    if (!reportId || !storageKey) {
      return NextResponse.json({ error: "reportId and storageKey are required." }, { status: 422 });
    }

    const file = await getAuthorizedReportMediaDownload(
      {
        userId: session.user.id,
        role: session.user.role,
        tenantId: session.user.tenantId
      },
      {
        inspectionReportId: reportId,
        storageKey
      }
    );

    const responseBytes = new Uint8Array(Array.from(file.bytes));

    return new NextResponse(responseBytes, {
      headers: {
        "Content-Type": file.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to retrieve report media." }, { status: getStatusCode(error) });
  }
}

