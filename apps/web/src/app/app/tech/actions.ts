"use server";

import { revalidatePath } from "next/cache";
import { InspectionStatus, type InspectionType } from "@prisma/client";

import { auth } from "@/auth";
import { addInspectionTask, claimInspection, signInspectionDocument, updateInspectionStatus } from "@testworx/lib";

type ActionResult = { ok: boolean; error: string | null };
type FormActionResult = { error: string | null; success: string | null };

export async function claimInspectionAction(inspectionId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.tenantId || session.user.role !== "technician") {
    return { ok: false, error: "Your session no longer has technician access. Please sign in again." };
  }

  try {
    await claimInspection({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId);
    revalidatePath("/app/tech");
    revalidatePath("/app/admin");
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to claim this inspection." };
  }
}

export async function updateInspectionStatusAction(inspectionId: string, status: InspectionStatus): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  try {
    await updateInspectionStatus({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId, status);
    revalidatePath("/app/tech");
    revalidatePath("/app/admin");
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to update inspection status." };
  }
}

export async function addInspectionTaskAction(inspectionId: string, inspectionType: InspectionType): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  try {
    await addInspectionTask(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { inspectionId, inspectionType }
    );
    revalidatePath("/app/tech");
    revalidatePath("/app/admin");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to add this report type." };
  }
}

export async function signInspectionDocumentAction(_: FormActionResult, formData: FormData): Promise<FormActionResult> {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const signerName = String(formData.get("signerName") ?? "");
  const signatureDataUrl = String(formData.get("signatureDataUrl") ?? "");

  if (!session?.user?.tenantId || !inspectionId || !documentId) {
    return { error: "Your session has expired. Please sign in again.", success: null };
  }

  try {
    await signInspectionDocument(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { documentId, signerName, signatureDataUrl }
    );

    revalidatePath("/app/tech");
    revalidatePath(`/app/tech/inspections/${inspectionId}/documents/${documentId}`);
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath("/app/customer");
    return { error: null, success: "Signed PDF saved to this inspection." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to sign inspection document.", success: null };
  }
}
