"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { auth } from "@/auth";
import {
  approveCustomerIntakeRequest,
  createCustomerIntakeRequest,
  customerIntakeSendSchema,
  rejectCustomerIntakeRequest,
  reopenCustomerIntakeRequest
} from "@testworx/lib/server/index";

type OfficeSession = {
  user: {
    id: string;
    role: string;
    tenantId: string;
  };
};

function actorFromSession(session: OfficeSession) {
  return {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  };
}

function requireOfficeSession(rawSession: unknown): OfficeSession {
  const session = rawSession as Partial<OfficeSession> | null;
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app/admin");
  }

  return session as OfficeSession;
}

function intakeHref(values?: { notice?: string; error?: string }) {
  const params = new URLSearchParams();
  if (values?.notice) {
    params.set("notice", values.notice);
  }
  if (values?.error) {
    params.set("error", values.error);
  }
  const query = params.toString();
  return query ? `/app/admin/customer-intakes?${query}` : "/app/admin/customer-intakes";
}

function detailHref(intakeRequestId: string, values?: { notice?: string; error?: string }) {
  const params = new URLSearchParams();
  if (values?.notice) {
    params.set("notice", values.notice);
  }
  if (values?.error) {
    params.set("error", values.error);
  }
  const query = params.toString();
  return query
    ? `/app/admin/customer-intakes/${encodeURIComponent(intakeRequestId)}?${query}`
    : `/app/admin/customer-intakes/${encodeURIComponent(intakeRequestId)}`;
}

export async function sendCustomerIntakeFormAction(formData: FormData) {
  const session = requireOfficeSession(await auth());
  const parsed = customerIntakeSendSchema.safeParse({
    recipientEmail: String(formData.get("recipientEmail") ?? ""),
    recipientName: String(formData.get("recipientName") ?? ""),
    optionalMessage: String(formData.get("optionalMessage") ?? "")
  });

  if (!parsed.success) {
    redirect(intakeHref({ error: parsed.error.issues[0]?.message ?? "Invalid intake request." }));
  }

  try {
    const result = await createCustomerIntakeRequest(actorFromSession(session), parsed.data);
    revalidatePath("/app/admin/customer-intakes");
    const deliverySuffix = result.delivery.sent
      ? " Email sent."
      : ` Request created, but email needs attention: ${result.delivery.error ?? "email is not configured."}`;
    redirect(intakeHref({ notice: `Customer intake request created.${deliverySuffix}` }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(intakeHref({ error: error instanceof Error ? error.message : "Unable to send intake form." }));
  }
}

export async function approveCustomerIntakeAction(formData: FormData) {
  const session = requireOfficeSession(await auth());
  const intakeRequestId = String(formData.get("intakeRequestId") ?? "").trim();
  if (!intakeRequestId) {
    redirect("/app/admin/customer-intakes");
  }

  try {
    const result = await approveCustomerIntakeRequest(actorFromSession(session), {
      intakeRequestId,
      createWorkOrderDraft: formData.get("createWorkOrderDraft") === "on",
      confirmDuplicateWarnings: formData.get("confirmDuplicateWarnings") === "on"
    });
    revalidatePath("/app/admin/customer-intakes");
    revalidatePath("/app/admin/clients");
    revalidatePath("/app/admin/inspections");
    redirect(detailHref(intakeRequestId, {
      notice: result.workOrderId
        ? "Customer, site, and work order draft created."
        : "Customer and service site created."
    }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(detailHref(intakeRequestId, {
      error: error instanceof Error ? error.message : "Unable to approve intake."
    }));
  }
}

export async function rejectCustomerIntakeAction(formData: FormData) {
  const session = requireOfficeSession(await auth());
  const intakeRequestId = String(formData.get("intakeRequestId") ?? "").trim();
  if (!intakeRequestId) {
    redirect("/app/admin/customer-intakes");
  }
  await rejectCustomerIntakeRequest(actorFromSession(session), intakeRequestId);
  revalidatePath("/app/admin/customer-intakes");
  redirect(detailHref(intakeRequestId, { notice: "Customer intake rejected." }));
}

export async function reopenCustomerIntakeAction(formData: FormData) {
  const session = requireOfficeSession(await auth());
  const intakeRequestId = String(formData.get("intakeRequestId") ?? "").trim();
  if (!intakeRequestId) {
    redirect("/app/admin/customer-intakes");
  }
  await reopenCustomerIntakeRequest(actorFromSession(session), intakeRequestId);
  revalidatePath("/app/admin/customer-intakes");
  redirect(detailHref(intakeRequestId, { notice: "Customer intake reopened for changes." }));
}
