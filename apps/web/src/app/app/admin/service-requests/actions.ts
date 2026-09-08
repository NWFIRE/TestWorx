"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { reviewFieldServiceRequest } from "@testworx/lib/server/index";

export async function reviewFieldServiceRequestAction(formData: FormData) {
  try {
  const session = await auth();
  if (!session?.user?.tenantId || !["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    throw new Error("Office access is required.");
  }
  await reviewFieldServiceRequest(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    { requestId: formData.get("requestId"), status: formData.get("status"), adminNote: formData.get("adminNote") }
  );
  revalidatePath("/app/admin/service-requests");
  revalidatePath("/app/admin/dashboard");
  revalidatePath("/app/tech/requests");
  return { ok: true, message: "Request updated." };
  } catch {
    return { ok: false, message: "Unable to update this request. It may have changed or your session may have expired. Refresh and try again." };
  }
}
