"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { sendManualEmailReminders } from "@testworx/lib/server/index";

export async function sendEmailRemindersAction(input: {
  dueMonth: string;
  customerCompanyIds: string[];
  templateKey: string;
  subject: string;
  body: string;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Unauthorized", message: null, summary: null };
  }

  try {
    const result = await sendManualEmailReminders(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      input
    );

    revalidatePath("/app/admin/email-reminders");
    return {
      ok: true,
      error: null,
      message:
        result.failedCount > 0
          ? `Sent ${result.sentCount} ${result.templateLabel}${result.sentCount === 1 ? "" : "s"}. ${result.failedCount} could not be delivered.`
          : `Sent ${result.sentCount} ${result.templateLabel}${result.sentCount === 1 ? "" : "s"}.`,
      summary: result
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to send reminder emails.",
      message: null,
      summary: null
    };
  }
}

