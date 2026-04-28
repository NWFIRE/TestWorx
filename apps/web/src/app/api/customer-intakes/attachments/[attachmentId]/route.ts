import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getCustomerIntakeAttachmentDownload } from "@testworx/lib/server/index";

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attachmentId } = await context.params;
  try {
    const file = await getCustomerIntakeAttachmentDownload({
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    }, attachmentId);
    return new NextResponse(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.fileName.replaceAll("\"", "")}"`
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to download attachment."
    }, { status: 404 });
  }
}
