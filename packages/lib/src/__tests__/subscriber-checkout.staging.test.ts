import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@testworx/db";
import { createSubscriberCheckout } from "../subscriber-checkout";
import { syncTenantSubscriptionFromStripe } from "../billing";
import { subscriptionAccess } from "../subscriber-policy";

const staging = process.env.APP_ENV === "staging" && process.env.DATABASE_URL === "postgresql://perf@127.0.0.1:55439/tradeworx_subscriber";
describe.skipIf(!staging)("subscriber billing database and provider contract", () => {
  afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); });
  it("reuses concurrent checkout, blocks additional active subscriptions and models billing recovery", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_contract_not_a_real_key");
    const tenant = await prisma.tenant.create({ data: { name: "Billing Contract Fixture", slug: `billing-${Date.now()}`, subscriptionManaged: true } });
    const user = await prisma.user.create({ data: { tenantId: tenant.id, name: "Contract Owner", email: `billing-${Date.now()}@example.test`, role: "tenant_admin", passwordHash: "not-a-login" } });
    const actor = { userId: user.id, tenantId: tenant.id, role: user.role };
    const sessions = new Map<string, any>();
    const subscriptions: any[] = [];
    const stripe = {
      prices: { retrieve: vi.fn(async () => ({ active: true, recurring: { interval: "month", interval_count: 1 } })) },
      customers: { create: vi.fn(async () => ({ id: `cus_contract_${tenant.id}` })) },
      subscriptions: { list: vi.fn(async () => ({ data: subscriptions })) },
      checkout: { sessions: {
        create: vi.fn(async (payload: unknown, options: { idempotencyKey: string }) => { if (!sessions.has(options.idempotencyKey)) sessions.set(options.idempotencyKey, { id: "cs_contract", url: "https://checkout.stripe.test/session", status: "open", payload }); return sessions.get(options.idempotencyKey); }),
        retrieve: vi.fn(async () => [...sessions.values()][0])
      } }
    };
    try {
      const input = { planCode: "professional", priceId: "price_contract", successUrl: "http://localhost:3340/app", cancelUrl: "http://localhost:3340/app" };
      const checkout = () => createSubscriberCheckout(stripe as any, actor, input);
      const results = await Promise.all([checkout(), checkout(), checkout()]);
      expect(new Set(results.map(result => result.url)).size).toBe(1);
      expect(sessions.size).toBe(1);
      const subscriptionId = `sub_${tenant.id}`;
      subscriptions.push({ id: subscriptionId, status: "active" });
      await expect(checkout()).rejects.toThrow("already has a subscription");
      const base = { tenantId: tenant.id, stripeCustomerId: `cus_contract_${tenant.id}`, stripeSubscriptionId: subscriptionId, metadataPlanCode: "professional", currentPeriodEndsAt: new Date("2027-01-25T12:00:00Z") };
      await syncTenantSubscriptionFromStripe({ ...base, subscriptionStatus: "active", stripeEventCreatedAt: new Date("2026-11-25T12:00:00Z") });
      expect(subscriptionAccess(await prisma.tenant.findUniqueOrThrow({where:{id:tenant.id}}),new Date("2026-11-26"))).toBe(true);
      await syncTenantSubscriptionFromStripe({ ...base, subscriptionStatus: "past_due", stripeEventCreatedAt: new Date("2026-11-26T12:00:00Z") });
      let state=await prisma.tenant.findUniqueOrThrow({where:{id:tenant.id}});
      expect(subscriptionAccess(state,new Date("2026-11-27"),7)).toBe(true);
      expect(subscriptionAccess(state,new Date("2026-12-05"),7)).toBe(false);
      await syncTenantSubscriptionFromStripe({ ...base, subscriptionStatus: "active", cancelAtPeriodEnd: true, stripeEventCreatedAt: new Date("2026-11-28T12:00:00Z") });
      state=await prisma.tenant.findUniqueOrThrow({where:{id:tenant.id}});
      expect(state.paymentFailedAt).toBeNull();expect(state.stripeCancelAtPeriodEnd).toBe(true);
      expect(subscriptionAccess(state,new Date("2026-12-05"))).toBe(true);
      await syncTenantSubscriptionFromStripe({ ...base, subscriptionStatus: "canceled", stripeEventCreatedAt: new Date("2027-01-25T12:00:00Z") });
      expect(subscriptionAccess(await prisma.tenant.findUniqueOrThrow({where:{id:tenant.id}}),new Date("2027-01-26"))).toBe(false);
    } finally {
      await prisma.auditLog.deleteMany({where:{tenantId:tenant.id}});await prisma.user.delete({where:{id:user.id}});await prisma.tenant.delete({where:{id:tenant.id}});
    }
  },60000);
});
