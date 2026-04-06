import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAuthorizedInspectionDocumentDownload } from "@testworx/lib";

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

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const variantParam = searchParams.get("variant");
    const disposition = searchParams.get("disposition") === "inline" ? "inline" : "attachment";
    const variant = variantParam === "original" || variantParam === "signed" || variantParam === "annotated" ? variantParam : "preferred";

    const { documentId } = await params;
    const file = await getAuthorizedInspectionDocumentDownload(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { documentId, variant }
    );

    const responseBytes = new Uint8Array(Array.from(file.bytes));
    return new NextResponse(responseBytes, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${disposition}; filename="${file.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to open inspection document." }, { status: getStatusCode(error) });
  }
}
