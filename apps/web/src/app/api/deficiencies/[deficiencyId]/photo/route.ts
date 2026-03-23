import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAuthorizedDeficiencyPhotoDownload } from "@testworx/lib";

export async function GET(_: Request, { params }: { params: Promise<{ deficiencyId: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { deficiencyId } = await params;
    const file = await getAuthorizedDeficiencyPhotoDownload(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      deficiencyId
    );

    const responseBytes = new Uint8Array(Array.from(file.bytes));
    return new NextResponse(responseBytes, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to download deficiency photo." }, { status: 403 });
  }
}
