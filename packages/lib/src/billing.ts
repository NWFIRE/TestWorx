import Stripe from "stripe";
import { prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { getOptionalStripeEnv, getServerEnv } from "./env";
import { assertTenantContext } from "./permissions";

const billingPlanCodeSchema = z.enum(["starter", "professional", "enterprise"]);
const billingFeatureSchema = z.enum(["advancedRecurrence", "uploadedInspectionPdfs"]);

export type BillingPlanCode = z.infer<typeof billingPlanCodeSchema>;
export type BillingFeature = z.infer<typeof billingFeatureSchema>;

export type TenantEntitlements = Record<BillingFeature, boolean>;
export type StripeWebhookProcessingResult = {
  tenantId: string | null;
  planCode: BillingPlanCode | null;
  duplicate?: boolean;
  ignored?: boolean;
  reason?: string;
  type?: string;
};

type BillingPlanDefinition = {
  label: string;
  description: string;
  highlight: string;
  features: string[];
  monthlyPriceCents: number;
  entitlements: TenantEntitlements;
};

const billingPlanContent: Record<BillingPlanCode, BillingPlanDefinition> = {
  starter: {
    label: "Starter",
    description: "Operational foundation for growing inspection teams.",
    highlight: "Great for early-stage multi-tech teams",
    monthlyPriceCents: 19900,
    features: ["Core scheduling", "Mobile technician workflows", "Customer portal and PDFs"],
    entitlements: {
      advancedRecurrence: false,
      uploadedInspectionPdfs: false
    }
  },
  professional: {
    label: "Professional",
    description: "Full-service operations for scaling inspection companies.",
    highlight: "Recommended for active field service companies",
    monthlyPriceCents: 49900,
    features: ["Everything in Starter", "Advanced report workflows", "Recurring inspection management", "Uploaded inspection PDFs"],
    entitlements: {
      advancedRecurrence: true,
      uploadedInspectionPdfs: true
    }
  },
  enterprise: {
    label: "Enterprise",
    description: "Custom rollout support, controls, and volume pricing.",
    highlight: "Best for multi-office and complex compliance teams",
    monthlyPriceCents: 99900,
    features: ["Everything in Professional", "Priority onboarding", "Custom SLA and account support"],
    entitlements: {
      advancedRecurrence: true,
      uploadedInspectionPdfs: true
    }
  }
};

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function getStripeClient() {
  const { STRIPE_SECRET_KEY: secretKey } = getOptionalStripeEnv();
  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, { apiVersion: "2026-02-25.clover" });
}

function getStripeWebhookSecret() {
  return getOptionalStripeEnv().STRIPE_WEBHOOK_SECRET;
}

function normalizePlanCode(value: string | null | undefined): BillingPlanCode | null {
  const parsed = billingPlanCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function canManageBilling(role: string) {
  return ["tenant_admin", "platform_admin"].includes(role);
}

export function canViewTenantSettings(role: string) {
  return ["tenant_admin", "platform_admin", "office_admin"].includes(role);
}

export function resolveTenantEntitlements(planCode: BillingPlanCode | null | undefined, subscriptionStatus?: string | null): TenantEntitlements {
  const base = billingPlanContent[planCode ?? "starter"]?.entitlements ?? billingPlanContent.starter.entitlements;
  const activeStatuses = new Set(["active", "trialing", "past_due"]);
  if (subscriptionStatus && !activeStatuses.has(subscriptionStatus)) {
    return {
      advancedRecurrence: false,
      uploadedInspectionPdfs: false
    };
  }

  return { ...base };
}

export function resolvePlanCodeFromStripePriceId(priceId: string | null | undefined): BillingPlanCode | null {
  if (!priceId) {
    return null;
  }

  const config = getBillingConfiguration();
  return config.plans.find((plan) => plan.stripePriceId === priceId)?.code ?? null;
}

export function getBillingConfiguration() {
  const env = getServerEnv();
  const plans = (Object.keys(billingPlanContent) as BillingPlanCode[]).map((code) => ({
    code,
    ...billingPlanContent[code],
    stripePriceId: env[`STRIPE_PRICE_${code.toUpperCase() as "STARTER" | "PROFESSIONAL" | "ENTERPRISE"}`] ?? null
  }));

  return {
    enabled: Boolean(env.STRIPE_SECRET_KEY && plans.every((plan) => plan.stripePriceId || plan.code === "enterprise")),
    portalReturnUrl: `${env.APP_URL}/app/admin/settings`,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? null,
    webhookConfigured: Boolean(getStripeWebhookSecret()),
    storageConfigured: env.STORAGE_DRIVER === "vercel_blob" || Boolean(env.BLOB_READ_WRITE_TOKEN),
    plans
  };
}

function mapSubscriptionStatusToTenantStatus(status: string | null | undefined) {
  if (status === "trialing") {
    return "trialing" as const;
  }

  if (status === "active" || status === "past_due") {
    return "active" as const;
  }

  return "suspended" as const;
}

async function getTenantPlanRecord(planCode: BillingPlanCode | null) {
  if (!planCode) {
    return null;
  }

  return prisma.subscriptionPlan.findUnique({ where: { code: planCode } });
}

export async function getTenantEntitlementsForTenantId(tenantId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    include: { subscriptionPlan: true }
  });

  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  const planCode = normalizePlanCode(tenant.subscriptionPlan?.code ?? null);
  return {
    tenantId: tenant.id,
    planCode,
    subscriptionStatus: tenant.stripeSubscriptionStatus ?? null,
    entitlements: resolveTenantEntitlements(planCode, tenant.stripeSubscriptionStatus)
  };
}

export async function assertTenantEntitlementForTenant(tenantId: string, feature: BillingFeature, message?: string) {
  const entitlementState = await getTenantEntitlementsForTenantId(tenantId);
  if (!entitlementState.entitlements[feature]) {
    throw new Error(message ?? `The current subscription does not include ${feature}.`);
  }

  return entitlementState;
}

export async function assertTenantEntitlement(actor: ActorContext, feature: BillingFeature, message?: string) {
  const parsedActor = parseActor(actor);
  return assertTenantEntitlementForTenant(parsedActor.tenantId as string, feature, message);
}

export async function getTenantBillingSettings(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (!canViewTenantSettings(parsedActor.role)) {
    throw new Error("Only administrators can access billing settings.");
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: parsedActor.tenantId as string },
    include: { subscriptionPlan: true }
  });

  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  const planCode = normalizePlanCode(tenant.subscriptionPlan?.code ?? null);
  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      billingEmail: tenant.billingEmail,
      stripeCustomerId: tenant.stripeCustomerId,
      stripeSubscriptionId: tenant.stripeSubscriptionId,
      stripeSubscriptionStatus: tenant.stripeSubscriptionStatus,
      stripeCurrentPeriodEndsAt: tenant.stripeCurrentPeriodEndsAt,
      stripeCancelAtPeriodEnd: tenant.stripeCancelAtPeriodEnd,
      stripeSubscriptionSyncedAt: tenant.stripeSubscriptionSyncedAt,
      stripeSubscriptionEventCreatedAt: tenant.stripeSubscriptionEventCreatedAt,
      stripeSubscriptionEventId: tenant.stripeSubscriptionEventId,
      subscriptionPlan: tenant.subscriptionPlan
    },
    entitlements: resolveTenantEntitlements(planCode, tenant.stripeSubscriptionStatus),
    config: getBillingConfiguration()
  };
}

export async function createBillingCheckoutSession(actor: ActorContext, input: { planCode: BillingPlanCode; successUrl: string; cancelUrl: string }) {
  const parsedActor = parseActor(actor);
  if (!canManageBilling(parsedActor.role)) {
    throw new Error("Only tenant administrators can manage billing.");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe billing is not configured.");
  }

  const tenant = await prisma.tenant.findFirst({ where: { id: parsedActor.tenantId as string }, include: { subscriptionPlan: true } });
  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  const config = getBillingConfiguration();
  const plan = config.plans.find((entry) => entry.code === input.planCode);
  if (!plan?.stripePriceId) {
    throw new Error("Selected plan is not configured for checkout.");
  }

  const customer = tenant.stripeCustomerId
    ? tenant.stripeCustomerId
    : (await stripe.customers.create({
        name: tenant.name,
        email: tenant.billingEmail ?? undefined,
        metadata: { tenantId: tenant.id }
      })).id;

  if (!tenant.stripeCustomerId) {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { stripeCustomerId: customer } });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      tenantId: tenant.id,
      planCode: input.planCode
    },
    line_items: [{ price: plan.stripePriceId, quantity: 1 }]
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorUserId: parsedActor.userId,
      action: "billing.checkout_started",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { planCode: input.planCode, stripeCheckoutSessionId: session.id }
    }
  });

  return { url: session.url };
}

export async function createBillingPortalSession(actor: ActorContext, input: { returnUrl: string }) {
  const parsedActor = parseActor(actor);
  if (!canManageBilling(parsedActor.role)) {
    throw new Error("Only tenant administrators can manage billing.");
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error("Stripe billing is not configured.");
  }

  const tenant = await prisma.tenant.findFirst({ where: { id: parsedActor.tenantId as string } });
  if (!tenant?.stripeCustomerId) {
    throw new Error("Stripe customer is not connected for this tenant.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: input.returnUrl
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorUserId: parsedActor.userId,
      action: "billing.portal_opened",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { stripeCustomerId: tenant.stripeCustomerId }
    }
  });

  return { url: session.url };
}

async function updateTenantFromCheckoutSession(session: Stripe.Checkout.Session): Promise<StripeWebhookProcessingResult | null> {
  const tenantId = String(session.metadata?.tenantId ?? "");
  const planCode = normalizePlanCode(session.metadata?.planCode);
  if (!tenantId) {
    return null;
  }

  const plan = await getTenantPlanRecord(planCode);
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
      stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null,
      subscriptionPlanId: plan?.id ?? undefined
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: "billing.checkout_completed",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { planCode, stripeCheckoutSessionId: session.id }
    }
  });

  return { tenantId: tenant.id, planCode };
}

export async function syncTenantSubscriptionFromStripe(input: {
  tenantId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId: string;
  stripePriceId?: string | null;
  subscriptionStatus?: string | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEndsAt?: Date | null;
  metadataPlanCode?: string | null;
  stripeEventId?: string | null;
  stripeEventCreatedAt?: Date | null;
}): Promise<StripeWebhookProcessingResult> {
  const tenant = input.tenantId
    ? await prisma.tenant.findFirst({ where: { id: input.tenantId }, include: { subscriptionPlan: true } })
    : await prisma.tenant.findFirst({
        where: {
          OR: [
            input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : undefined,
            { stripeSubscriptionId: input.stripeSubscriptionId }
          ].filter(Boolean) as any
        },
        include: { subscriptionPlan: true }
      });

  if (!tenant) {
    throw new Error("Tenant for Stripe subscription could not be resolved.");
  }

  const currentEventCreatedAt = tenant.stripeSubscriptionEventCreatedAt;
  const incomingEventCreatedAt = input.stripeEventCreatedAt ?? null;
  if (currentEventCreatedAt && incomingEventCreatedAt && incomingEventCreatedAt < currentEventCreatedAt) {
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: "billing.subscription_sync_ignored",
        entityType: "Tenant",
        entityId: tenant.id,
        metadata: {
          reason: "stale_event",
          stripeEventId: input.stripeEventId ?? null,
          stripeEventCreatedAt: incomingEventCreatedAt.toISOString(),
          currentStripeEventId: tenant.stripeSubscriptionEventId,
          currentStripeEventCreatedAt: currentEventCreatedAt.toISOString()
        }
      }
    });

    return { tenantId: tenant.id, planCode: normalizePlanCode(tenant.subscriptionPlan?.code ?? null), ignored: true as const, reason: "stale_event" };
  }

  const planCode = resolvePlanCodeFromStripePriceId(input.stripePriceId) ?? normalizePlanCode(input.metadataPlanCode);
  const plan = await getTenantPlanRecord(planCode);
  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      subscriptionPlanId: plan?.id ?? tenant.subscriptionPlanId,
      stripeCustomerId: input.stripeCustomerId ?? tenant.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeSubscriptionStatus: input.subscriptionStatus ?? tenant.stripeSubscriptionStatus,
      stripePriceId: input.stripePriceId ?? tenant.stripePriceId,
      stripeCurrentPeriodEndsAt: input.currentPeriodEndsAt ?? null,
      stripeCancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      stripeSubscriptionSyncedAt: new Date(),
      stripeSubscriptionEventCreatedAt: input.stripeEventCreatedAt ?? tenant.stripeSubscriptionEventCreatedAt,
      stripeSubscriptionEventId: input.stripeEventId ?? tenant.stripeSubscriptionEventId,
      status: mapSubscriptionStatusToTenantStatus(input.subscriptionStatus)
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: "billing.subscription_synced",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: {
        planCode,
        stripeCustomerId: updated.stripeCustomerId,
        stripeSubscriptionId: updated.stripeSubscriptionId,
        stripeSubscriptionStatus: updated.stripeSubscriptionStatus,
        stripePriceId: updated.stripePriceId,
        stripeEventId: input.stripeEventId ?? null,
        stripeEventCreatedAt: input.stripeEventCreatedAt?.toISOString() ?? null
      }
    }
  });

  return { tenantId: tenant.id, planCode };
}

function getStripeEventObjectId(event: Stripe.Event) {
  const object = event.data?.object as { id?: string } | undefined;
  return typeof object?.id === "string" ? object.id : null;
}

export async function processStripeWebhookEvent(event: Stripe.Event): Promise<StripeWebhookProcessingResult | null> {
  switch (event.type) {
    case "checkout.session.completed": {
      return updateTenantFromCheckoutSession(event.data.object as Stripe.Checkout.Session);
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price?.id ?? null;
      const periodEndUnix = subscription.items.data[0]?.current_period_end ?? (subscription as any).current_period_end ?? null;
      const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

      return syncTenantSubscriptionFromStripe({
        tenantId: typeof subscription.metadata?.tenantId === "string" ? subscription.metadata.tenantId : null,
        stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        subscriptionStatus: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEndsAt: periodEnd,
        metadataPlanCode: subscription.metadata?.planCode ?? null,
        stripeEventId: event.id,
        stripeEventCreatedAt: new Date(event.created * 1000)
      });
    }
    default:
      return null;
  }
}

export async function handleStripeWebhook(input: { rawBody: string; signature: string }) {
  const stripe = getStripeClient();
  const webhookSecret = getStripeWebhookSecret();
  if (!stripe || !webhookSecret) {
    throw new Error("Stripe webhook handling is not configured.");
  }

  const event = stripe.webhooks.constructEvent(input.rawBody, input.signature, webhookSecret);
  const stripeCreatedAt = new Date(event.created * 1000);
  const stripeObjectId = getStripeEventObjectId(event);
  const existing = await prisma.stripeWebhookEvent.findUnique({ where: { stripeEventId: event.id } });
  if (existing?.status === "processed") {
    return { duplicate: true, tenantId: existing.tenantId ?? null, type: existing.type };
  }

  await prisma.stripeWebhookEvent.upsert({
    where: { stripeEventId: event.id },
    create: {
      stripeEventId: event.id,
      type: event.type,
      status: "received",
      deliveryCount: 1,
      stripeCreatedAt,
      stripeObjectId,
      payload: event as any
    },
    update: {
      type: event.type,
      status: "received",
      deliveryCount: { increment: 1 },
      stripeCreatedAt,
      stripeObjectId,
      payload: event as any,
      errorMessage: null
    }
  });

  const claimed = await prisma.stripeWebhookEvent.updateMany({
    where: {
      stripeEventId: event.id,
      status: { in: ["received", "failed"] }
    },
    data: {
      status: "processing",
      processingStartedAt: new Date(),
      errorMessage: null
    }
  });

  if (claimed.count !== 1) {
    const latest = await prisma.stripeWebhookEvent.findUnique({ where: { stripeEventId: event.id } });
    return {
      duplicate: true,
      tenantId: latest?.tenantId ?? null,
      type: latest?.type ?? event.type
    };
  }

  try {
    const result = await processStripeWebhookEvent(event);
    await prisma.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: {
        tenantId: result?.tenantId ?? null,
        status: "processed",
        stripeCreatedAt,
        stripeObjectId,
        processingStartedAt: null,
        processedAt: new Date(),
        errorMessage: null
      }
    });

    return { duplicate: false, ignored: result?.ignored ?? false, tenantId: result?.tenantId ?? null, type: event.type };
  } catch (error) {
    await prisma.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: {
        status: "failed",
        processingStartedAt: null,
        errorMessage: error instanceof Error ? error.message : "Unknown webhook processing error."
      }
    });
    throw error;
  }
}
