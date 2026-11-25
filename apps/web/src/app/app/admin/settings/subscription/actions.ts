"use server";
import { auth } from "@/auth";
import { createBillingCheckoutSession, createBillingPortalSession } from "@testworx/lib/src/billing";
import { supportActor } from "@testworx/lib/src/subscriber-support";
import { redirect } from "next/navigation";

export async function subscriptionAction(_state: { error: string }, form: FormData) {
  const session = await auth({ subscriptionRecovery: true });
  if (!session?.user?.id) return { error: "Sign in to continue." };
  let url: string | null;
  try {
    const user = await supportActor(session.user.id);
    if (user.role !== "tenant_admin") throw new Error("Access denied.");
    const actor = { userId: user.id, tenantId: user.tenantId, role: user.role };
    const returnUrl = `${process.env.APP_URL}/app/admin/settings/subscription`;
    const result = form.get("action") === "portal" ? await createBillingPortalSession(actor, { returnUrl }) : await createBillingCheckoutSession(actor, {
      planCode: form.get("plan") === "starter" ? "starter" : "professional", successUrl: returnUrl, cancelUrl: returnUrl });
    url = result.url;
    if (!url) throw new Error("Billing provider did not return a checkout URL.");
  } catch { return { error: "Subscription action is unavailable. Check configuration or use Manage subscription if checkout has already completed. Contact support if this persists." }; }
  redirect(url);
}
