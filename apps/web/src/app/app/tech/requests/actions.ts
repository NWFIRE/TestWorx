"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createFieldServiceRequest } from "@testworx/lib/server/index";
import { z } from "zod";

export type FieldRequestActionState = { ok: boolean; message: string };

export async function submitFieldRequestAction(
  _state: FieldRequestActionState,
  formData: FormData
): Promise<FieldRequestActionState> {
  const session = await auth();
  if (!session?.user?.tenantId || session.user.role !== "technician") {
    return { ok: false, message: "Your session expired. Sign in and try again." };
  }
  try {
    await createFieldServiceRequest(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        submissionId: formData.get("submissionId") ?? undefined,
        customerCompanyId: formData.get("customerCompanyId"),
        siteId: formData.get("siteId"),
        requestType: formData.get("requestType"),
        priority: formData.get("priority"),
        title: formData.get("title"),
        description: formData.get("description"),
        equipmentContext: formData.get("equipmentContext"),
        preferredTiming: formData.get("preferredTiming")
      }
    );
    revalidatePath("/app/tech/requests");
    revalidatePath("/app/admin/service-requests");
    revalidatePath("/app/admin/dashboard");
    return { ok: true, message: "Request sent to the office team." };
  } catch (error) {
    return { ok: false, message: error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join(" ") : "Unable to send the request. Your details are still here. Please try again." };
  }
}
