import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetServerEnvForTests } from "../env";

const stripeConstructEventMock = vi.fn();

const prismaMock = {
  tenant: {
    findFirst: vi.fn(),
    update: vi.fn()
  },
  subscriptionPlan: {
    findUnique: vi.fn()
  },
  auditLog: {
    create: vi.fn()
  },
  stripeWebhookEvent: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = {
      constructEvent: stripeConstructEventMock
    };
  }
}));

describe("billing webhook processing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvForTests();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/testworx?schema=public");
    vi.stubEnv("AUTH_SECRET", "replace-with-a-long-random-secret");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("STORAGE_DRIVER", "inline");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_123");
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter");
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_professional");
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_test_123");
    resetServerEnvForTests();
  });

  it("maps Stripe price ids into tenant plan sync updates", async () => {
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      stripePriceId: null,
      subscriptionPlanId: null,
      stripeSubscriptionEventCreatedAt: null,
      stripeSubscriptionEventId: null,
      subscriptionPlan: null
    });
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue({ id: "plan_professional", code: "professional" });
    prismaMock.tenant.update.mockResolvedValue({
      id: "tenant_1",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripeSubscriptionStatus: "active",
      stripePriceId: "price_professional"
    });
    prismaMock.auditLog.create.mockResolvedValue({});

    const { processStripeWebhookEvent } = await import("../billing");
    const result = await processStripeWebhookEvent({
      id: "evt_1",
      created: 1760000000,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          cancel_at_period_end: false,
          metadata: { planCode: "professional" },
          items: {
            data: [
              {
                price: { id: "price_professional" },
                current_period_end: 1760000000
              }
            ]
          }
        }
      }
    } as any);

    expect(result).toEqual({ tenantId: "tenant_1", planCode: "professional" });
    expect(prismaMock.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "tenant_1" },
      data: expect.objectContaining({
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_professional",
        stripeSubscriptionStatus: "active",
        stripeSubscriptionEventId: "evt_1"
      })
    }));
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("ignores stale out-of-order subscription events", async () => {
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripeSubscriptionStatus: "active",
      stripePriceId: "price_professional",
      subscriptionPlanId: "plan_professional",
      stripeSubscriptionEventCreatedAt: new Date("2026-03-13T12:00:00.000Z"),
      stripeSubscriptionEventId: "evt_newer",
      subscriptionPlan: { code: "professional" }
    });
    prismaMock.auditLog.create.mockResolvedValue({});

    const { processStripeWebhookEvent } = await import("../billing");
    const result = await processStripeWebhookEvent({
      id: "evt_stale",
      created: 1760000000,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "canceled",
          cancel_at_period_end: true,
          metadata: { planCode: "starter" },
          items: {
            data: [
              {
                price: { id: "price_starter" },
                current_period_end: 1760000000
              }
            ]
          }
        }
      }
    } as any);

    expect(result).toMatchObject({ tenantId: "tenant_1", planCode: "professional", ignored: true, reason: "stale_event" });
    expect(prismaMock.tenant.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "billing.subscription_sync_ignored"
      })
    }));
  });

  it("treats already processed webhook deliveries as duplicates", async () => {
    stripeConstructEventMock.mockReturnValue({
      id: "evt_duplicate",
      created: 1760000000,
      type: "customer.subscription.updated",
      data: { object: { id: "sub_123" } }
    });
    prismaMock.stripeWebhookEvent.findUnique.mockResolvedValue({
      stripeEventId: "evt_duplicate",
      tenantId: "tenant_1",
      type: "customer.subscription.updated",
      status: "processed"
    });

    const { handleStripeWebhook } = await import("../billing");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig_123" });

    expect(result).toEqual({ duplicate: true, tenantId: "tenant_1", type: "customer.subscription.updated" });
    expect(prismaMock.stripeWebhookEvent.upsert).not.toHaveBeenCalled();
  });

  it("retries failed deliveries safely and marks them processed on success", async () => {
    stripeConstructEventMock.mockReturnValue({
      id: "evt_retry",
      created: 1760000000,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          cancel_at_period_end: false,
          metadata: { planCode: "professional" },
          items: {
            data: [
              {
                price: { id: "price_professional" },
                current_period_end: 1760000000
              }
            ]
          }
        }
      }
    });
    prismaMock.stripeWebhookEvent.findUnique.mockResolvedValueOnce({
      stripeEventId: "evt_retry",
      status: "failed"
    });
    prismaMock.stripeWebhookEvent.upsert.mockResolvedValue({});
    prismaMock.stripeWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      stripePriceId: null,
      subscriptionPlanId: null,
      stripeSubscriptionEventCreatedAt: null,
      stripeSubscriptionEventId: null,
      subscriptionPlan: null
    });
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue({ id: "plan_professional", code: "professional" });
    prismaMock.tenant.update.mockResolvedValue({
      id: "tenant_1",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripeSubscriptionStatus: "active",
      stripePriceId: "price_professional"
    });
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.stripeWebhookEvent.update.mockResolvedValue({});

    const { handleStripeWebhook } = await import("../billing");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig_123" });

    expect(result).toMatchObject({ duplicate: false, tenantId: "tenant_1", type: "customer.subscription.updated" });
    expect(prismaMock.stripeWebhookEvent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        deliveryCount: { increment: 1 }
      })
    }));
    expect(prismaMock.stripeWebhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { stripeEventId: "evt_retry" },
      data: expect.objectContaining({
        status: "processed"
      })
    }));
  });

  it("handles in-flight duplicate deliveries without double-processing", async () => {
    stripeConstructEventMock.mockReturnValue({
      id: "evt_processing",
      created: 1760000000,
      type: "customer.subscription.updated",
      data: { object: { id: "sub_123" } }
    });
    prismaMock.stripeWebhookEvent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        stripeEventId: "evt_processing",
        tenantId: "tenant_1",
        type: "customer.subscription.updated",
        status: "processing"
      });
    prismaMock.stripeWebhookEvent.upsert.mockResolvedValue({});
    prismaMock.stripeWebhookEvent.updateMany.mockResolvedValue({ count: 0 });

    const { handleStripeWebhook } = await import("../billing");
    const result = await handleStripeWebhook({ rawBody: "{}", signature: "sig_123" });

    expect(result).toEqual({ duplicate: true, tenantId: "tenant_1", type: "customer.subscription.updated" });
    expect(prismaMock.tenant.update).not.toHaveBeenCalled();
  });
});
