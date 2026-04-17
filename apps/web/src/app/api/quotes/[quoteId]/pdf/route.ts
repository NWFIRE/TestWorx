import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAuthorizedQuotePdf } from "@testworx/lib/server/index";

export async function GET(_: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { quoteId } = await params;
    const pdf = await getAuthorizedQuotePdf(
      {
        userId: session.user.id,
        role: session.user.role,
        tenantId: session.user.tenantId,
        allowances: session.user.allowances ?? null
      },
      quoteId
    );

    return new NextResponse(Buffer.from(pdf.pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": pdf.mimeType,
        "Content-Disposition": `inline; filename="${pdf.fileName}"`
      }
    });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "Unable to generate quote PDF.", {
      status: 400
    });
  }
}
