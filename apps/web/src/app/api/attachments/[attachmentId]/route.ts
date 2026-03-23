import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAuthorizedAttachmentDownload } from "@testworx/lib";

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

export async function GET(_: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { attachmentId } = await params;
    const file = await getAuthorizedAttachmentDownload(
      {
        userId: session.user.id,
        role: session.user.role,
        tenantId: session.user.tenantId
      },
      attachmentId
    );

    const responseBytes = new Uint8Array(Array.from(file.bytes));

    return new NextResponse(responseBytes, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to download attachment." }, { status: getStatusCode(error) });
  }
}
