"use server";

import { auth } from "@/auth";
import { createSupportTicket, updateSupportTicket } from "@testworx/lib/src/subscriber-support";
import { revalidatePath } from "next/cache";
import { retryTicketReportDelivery } from "@testworx/lib/src/report-delivery";

export async function submitProblem(_state: { error: string }, form: FormData) {
  const session = await auth({ subscriptionRecovery: true });
  if (!session?.user?.id) return { error: "Sign in to send a request." };
  let id: string;
  try {
    const file = form.get("screenshot");
    if (file instanceof File && file.size > 2 * 1024 * 1024) throw new Error("Use a screenshot smaller than 2 MB.");
    const ticket = await createSupportTicket(session.user.id, {
      title: String(form.get("title") ?? ""), description: String(form.get("description") ?? ""), blocked: form.get("blocked") === "on",
      pagePath: String(form.get("pagePath") ?? "/app"), errorReference: String(form.get("errorReference") ?? ""), reportId: String(form.get("reportId") ?? "")
    }, file instanceof File && file.size ? { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type } : undefined);
    id = ticket.id;
  } catch { return { error: "Request could not be sent. Check the fields and report reference. Screenshots must be PNG or JPEG, up to 2 MB. Your text has been preserved." }; }
  return { error: "", ticketId: id };
}

export async function replyToProblem(_state: { error: string }, form: FormData) {
  const session = await auth({ subscriptionRecovery: true });
  if (!session?.user?.id) return { error: "Sign in to continue." };
  const id = String(form.get("ticketId") ?? "");
  try {
    await updateSupportTicket(session.user.id, id, { action: String(form.get("action") ?? "reply"), body: String(form.get("body") ?? ""),
      assigneeId: String(form.get("assigneeId") ?? "") });
    revalidatePath(`/app/help/${id}`);
    revalidatePath("/app/help");
    revalidatePath("/app/platform/support");
    return { error: "", saved: true };
  } catch { return { error: "Unable to update this request. Your message has been preserved." }; }
}

export async function retryDeliveryAction(_state: { error: string }, form: FormData) {
  const session = await auth({ subscriptionRecovery: true });
  if (!session?.user?.id) return { error: "Sign in to continue." };
  const ticketId = String(form.get("ticketId") ?? "");
  try {
    const result = await retryTicketReportDelivery(session.user.id, ticketId, String(form.get("deliveryId") ?? ""));
    revalidatePath(`/app/help/${ticketId}`);
    return { error: result.status === "sent" ? "" : "Delivery was not confirmed. Review its current status before another action.", saved: result.status === "sent" };
  } catch { return { error: "Retry not permitted. Refresh to check the current delivery status." }; }
}
