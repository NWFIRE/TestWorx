"use server";
import { auth } from "@/auth";
import { requestReportDelivery } from "@testworx/lib/src/report-delivery";
export async function sendReportAction(_state: { message: string }, form: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { message: "Sign in to continue." };
  try {
    const result = await requestReportDelivery(session.user.id, String(form.get("reportId") ?? ""));
    return { message: result.status === "sent" ? "Report delivery confirmed." : result.status === "unchanged" ? "Delivery already exists. No duplicate email was sent." : "Report delivery needs review. Contact support with the report reference." };
  } catch { return { message: "Unable to send. A finalized report, issued PDF, and customer email are required." }; }
}
