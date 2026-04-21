import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { registerInspectionDocumentUpload, uploadInspectionDocument } from "@testworx/lib/server/index";

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
    const uploadedPathnames = formData.getAll("uploadedBlobPathname").map((entry) => String(entry || "").trim()).filter(Boolean);
    const uploadedFileNames = formData.getAll("uploadedFileName").map((entry) => String(entry || "").trim());
    const uploadedMimeTypes = formData.getAll("uploadedMimeType").map((entry) => String(entry || "").trim());
    const files = formData
      .getAll("document")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!inspectionId || (files.length === 0 && uploadedPathnames.length === 0)) {
      return NextResponse.json({ error: "Select at least one PDF to upload." }, { status: 400 });
    }

    if (uploadedPathnames.length > 0) {
      for (const [index, blobPathname] of uploadedPathnames.entries()) {
        await registerInspectionDocumentUpload(
          { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
          {
            inspectionId,
            blobPathname,
            fileName: uploadedFileNames[index] || "inspection-document.pdf",
            mimeType: uploadedMimeTypes[index] || "application/pdf",
            label: uploadedPathnames.length === 1 ? label || null : null,
            requiresSignature,
            customerVisible
          }
        );
      }
    } else {
      for (const file of files) {
        await uploadInspectionDocument(
          { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
          {
            inspectionId,
            fileName: file.name,
            mimeType: file.type || "application/pdf",
            bytes: new Uint8Array(await file.arrayBuffer()),
            label: files.length === 1 ? label || null : null,
            requiresSignature,
            customerVisible
          }
        );
      }
    }

    return NextResponse.json({
      success: uploadedPathnames.length + files.length === 1
        ? `${uploadedFileNames[0] || files[0]!.name} uploaded.`
        : `${uploadedPathnames.length + files.length} PDFs uploaded.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload PDF." },
      { status: 400 }
    );
  }
}
