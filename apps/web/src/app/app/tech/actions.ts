"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  addInspectionTask,
  claimInspection,
  completeInspectionWithCloseoutRequest,
  editableInspectionStatuses,
  inspectionTypeRegistry,
  removeInspectionTask,
  signInspectionDocument,
  submitTechnicianInspectionFieldUpdate,
  updateInspectionStatus
} from "@testworx/lib/server/index";

type ActionResult = { ok: boolean; error: string | null };
type AddInspectionTaskActionResult = ActionResult & { taskId?: string | null };
type FormActionResult = { error: string | null; success: string | null };
type InspectionStatus = typeof editableInspectionStatuses[number];
type InspectionType = keyof typeof inspectionTypeRegistry;

export async function claimInspectionAction(inspectionId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.tenantId || session.user.role !== "technician") {
    return { ok: false, error: "Your session no longer has technician access. Please sign in again." };
  }

  try {
    await claimInspection({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId);
    revalidatePath("/app/tech");
    revalidatePath("/app/tech/inspections");
    revalidatePath("/app/tech/work");
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/inspections");
    revalidatePath("/app/admin/dashboard");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
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
    revalidatePath("/app/admin/inspections");
    revalidatePath("/app/admin/dashboard");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to update inspection status." };
  }
}

export async function addInspectionTaskAction(inspectionId: string, inspectionType: InspectionType): Promise<AddInspectionTaskActionResult> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Your session has expired. Please sign in again.", taskId: null };
  }

  try {
    const task = await addInspectionTask(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { inspectionId, inspectionType }
    );
    revalidatePath("/app/tech");
    revalidatePath("/app/tech/inspections");
    revalidatePath("/app/tech/work");
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/inspections");
    revalidatePath("/app/admin/dashboard");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath(`/app/tech/reports/${inspectionId}/${task.id}`);
    return { ok: true, error: null, taskId: task.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to add this report type.", taskId: null };
  }
}

export async function completeInspectionWithCloseoutRequestAction(
  inspectionId: string,
  input: { requestType: "none" | "new_inspection" | "follow_up_inspection"; note?: string }
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  try {
    await completeInspectionWithCloseoutRequest(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId,
      input.requestType === "none"
        ? { requestType: "none" }
        : { requestType: input.requestType, note: input.note ?? "" }
    );
    revalidatePath("/app/tech");
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/inspections");
    revalidatePath("/app/admin/dashboard");
    revalidatePath("/app/admin/amendments");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to complete this inspection." };
  }
}

export async function submitInspectionFieldUpdateAction(
  inspectionId: string,
  input: { requestType: "customer_refused"; note: string } | { requestType: "wrong_due_month"; requestedDueMonth: string; note?: string }
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.tenantId || session.user.role !== "technician") {
    return { ok: false, error: "Your session no longer has technician access. Please sign in again." };
  }

  try {
    await submitTechnicianInspectionFieldUpdate(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId,
      input
    );
    revalidatePath("/app/tech");
    revalidatePath("/app/tech/inspections");
    revalidatePath("/app/tech/work");
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/inspections");
    revalidatePath("/app/admin/dashboard");
    revalidatePath("/app/admin/amendments");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to send this field update." };
  }
}

export async function removeInspectionTaskAction(inspectionId: string, inspectionTaskId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  try {
    await removeInspectionTask(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { inspectionId, inspectionTaskId }
    );
    revalidatePath("/app/tech");
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/inspections");
    revalidatePath("/app/admin/dashboard");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to remove this report type." };
  }
}

export async function signInspectionDocumentAction(_: FormActionResult, formData: FormData): Promise<FormActionResult> {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const signerName = String(formData.get("signerName") ?? "");
  const signatureDataUrl = String(formData.get("signatureDataUrl") ?? "");
  const annotationData = String(formData.get("annotationData") ?? "");

  if (!session?.user?.tenantId || !inspectionId || !documentId) {
    return { error: "Your session has expired. Please sign in again.", success: null };
  }

  try {
    await signInspectionDocument(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { documentId, signerName, signatureDataUrl, annotationData }
    );

    revalidatePath("/app/tech");
    revalidatePath(`/app/tech/inspections/${inspectionId}/documents/${documentId}`);
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath("/app/customer");
    return { error: null, success: "PDF changes saved to this inspection." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to save inspection document changes.", success: null };
  }
}

