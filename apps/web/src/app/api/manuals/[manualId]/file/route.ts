import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAuthorizedManualFileDownload } from "@testworx/lib/server/index";

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

  if (/access|active/i.test(error.message)) {
    return 403;
  }

  return 400;
}

export async function GET(request: Request, { params }: { params: Promise<{ manualId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const disposition = searchParams.get("disposition") === "attachment" ? "attachment" : "inline";
    const { manualId } = await params;

    const file = await getAuthorizedManualFileDownload(
      {
        userId: session.user.id,
        role: session.user.role,
        tenantId: session.user.tenantId
      },
      manualId
    );

    return new NextResponse(new Uint8Array(Array.from(file.bytes)), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${disposition}; filename="${file.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load manual file." },
      { status: getStatusCode(error) }
    );
  }
}
