import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";

import { getPublicQuotePdfByAccessToken } from "@testworx/lib/server/index";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const file = await getPublicQuotePdfByAccessToken(token);
    return new NextResponse(Buffer.from(file.pdfBytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.fileName}"`
      }
    });
  } catch {
    return NextResponse.json({ error: "Quote PDF unavailable." }, { status: 404 });
  }
}
