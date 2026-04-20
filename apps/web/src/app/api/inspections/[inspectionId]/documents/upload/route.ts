import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { uploadInspectionDocument } from "@testworx/lib/server/index";

export const runtime = "nodejs";

function isAdminRole(role: string | undefined) {
  return role === "platform_admin" || role === "tenant_admin" || role === "office_admin";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ inspectionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { inspectionId } = await context.params;

  try {
    const formData = await request.formData();
    const requiresSignature = formData.get("requiresSignature") === "on";
    const customerVisible = formData.get("customerVisible") === "on";
    const label = String(formData.get("label") ?? "").trim();
    const file = formData.get("document");

    if (!inspectionId || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Select a PDF to upload." }, { status: 400 });
    }

    await uploadInspectionDocument(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        inspectionId,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        bytes: new Uint8Array(await file.arrayBuffer()),
        label,
        requiresSignature,
        customerVisible
      }
    );

    return NextResponse.json({ success: `${file.name} uploaded.` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload PDF." },
      { status: 400 }
    );
  }
}
