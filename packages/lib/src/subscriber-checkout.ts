import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { prisma } from "@testworx/db";
import type { ActorContext } from "@testworx/types";

export async function createSubscriberCheckout(stripe: Stripe, actor: ActorContext, input: { planCode: string; priceId: string; successUrl: string; cancelUrl: string }) {
  const user = await prisma.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId, role: "tenant_admin", isActive: true }, select: { id: true } });
  if (!user || !actor.tenantId) throw new Error("Only the company administrator can manage subscriptions.");
  if (process.env.APP_ENV === "staging" && !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Staging requires a Stripe test key.");
  const origin = new URL(process.env.APP_URL!).origin;
  if ([input.successUrl, input.cancelUrl].some(url => new URL(url).origin !== origin)) throw new Error("Invalid return address.");
  const price = await stripe.prices.retrieve(input.priceId);
  if (!price.active || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) throw new Error("Configure an active monthly Stripe price.");
  let tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } });
  if (!tenant.subscriptionManaged) throw new Error("Billing activation for this existing company requires an approved rollout.");
  if (!tenant.stripeCustomerId) {
    const customer = await stripe.customers.create({ name: tenant.name, email: tenant.billingEmail ?? undefined, metadata: { tenantId: tenant.id } }, { idempotencyKey: `workspace-customer-${tenant.id}` });
    tenant = await prisma.tenant.update({ where: { id: tenant.id }, data: { stripeCustomerId: customer.id } });
  }
  const subscriptions = await stripe.subscriptions.list({ customer: tenant.stripeCustomerId!, status: "all", limit: 100 });
  if (subscriptions.data.some(subscription => !["canceled", "incomplete_expired"].includes(subscription.status))) throw new Error("This company already has a subscription. Use Manage subscription.");
  if (tenant.checkoutSessionId) {
    const previous = await stripe.checkout.sessions.retrieve(tenant.checkoutSessionId);
    if (previous.status === "open") return { url: previous.url };
    if (previous.status === "complete" && !subscriptions.data.some(subscription => subscription.id === previous.subscription && ["canceled", "incomplete_expired"].includes(subscription.status))) throw new Error("Checkout is complete. Waiting for verified billing confirmation.");
    await prisma.tenant.updateMany({ where: { id: tenant.id, checkoutSessionId: previous.id }, data: { checkoutSessionId: null, checkoutAttemptId: null, checkoutAttemptAt: null } });
  }
  await prisma.tenant.updateMany({ where: { id: tenant.id, checkoutAttemptId: null }, data: { checkoutAttemptId: `${input.planCode}:${randomUUID()}`, checkoutAttemptAt: new Date() } });
  tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  if (!tenant.checkoutAttemptId?.startsWith(`${input.planCode}:`)) throw new Error("Finish the existing checkout before changing plans.");
  // An unresolved request older than the provider's idempotency window needs reconciliation, not a blind retry.
  if (!tenant.checkoutAttemptAt || Date.now() - tenant.checkoutAttemptAt.getTime() > 23 * 3600000) throw new Error("Checkout needs support review before another attempt.");
  const configuredTrial = Number(process.env.SUBSCRIPTION_TRIAL_DAYS ?? "0");
  if (!Number.isInteger(configuredTrial) || configuredTrial < 0 || configuredTrial > 30) throw new Error("Invalid trial configuration.");
  const session = await stripe.checkout.sessions.create({ mode: "subscription", customer: tenant.stripeCustomerId!,
    success_url: `${origin}/app/admin/settings/subscription?checkout=complete`, cancel_url: `${origin}/app/admin/settings/subscription`,
    metadata: { tenantId: tenant.id, planCode: input.planCode },
    subscription_data: { metadata: { tenantId: tenant.id, planCode: input.planCode },
      ...(!tenant.stripeSubscriptionId && configuredTrial ? { trial_period_days: configuredTrial } : {}) },
    line_items: [{ price: input.priceId, quantity: 1 }]
  }, { idempotencyKey: `workspace-checkout-${tenant.id}-${tenant.checkoutAttemptId}` });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { checkoutSessionId: session.id } });
  await prisma.auditLog.create({ data: { tenantId: tenant.id, actorUserId: actor.userId, action: "billing.checkout_started", entityType: "Tenant", entityId: tenant.id, metadata: { stripeCheckoutSessionId: session.id, planCode: input.planCode } } });
  return { url: session.url };
}
