import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetServerEnvForTests } from "../env";

const prismaMock = {
  tenant: {
    findFirst: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

describe("billing authorization and persisted entitlements", () => {
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
    resetServerEnvForTests();
  });

  it("allows office admins to read tenant billing settings but still blocks non-admin roles", async () => {
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      name: "Evergreen Fire",
      billingEmail: "billing@evergreenfire.com",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: "active",
      stripeCurrentPeriodEndsAt: null,
      stripeCancelAtPeriodEnd: false,
      stripeSubscriptionSyncedAt: null,
      stripeSubscriptionEventCreatedAt: null,
      stripeSubscriptionEventId: null,
      subscriptionPlan: { code: "professional", name: "Professional" }
    });

    const { getTenantBillingSettings } = await import("../billing");

    await expect(
      getTenantBillingSettings({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" })
    ).resolves.toMatchObject({
      tenant: {
        id: "tenant_1"
      }
    });

    await expect(
      getTenantBillingSettings({ userId: "tech_1", role: "technician", tenantId: "tenant_1" })
    ).rejects.toThrow(/only administrators can access billing settings/i);
  });

  it("enforces entitlements from persisted subscription state", async () => {
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      stripeSubscriptionStatus: "canceled",
      subscriptionPlan: { code: "professional" }
    });

    const { assertTenantEntitlementForTenant } = await import("../billing");

    await expect(
      assertTenantEntitlementForTenant("tenant_1", "advancedRecurrence", "Advanced recurrence should be blocked.")
    ).rejects.toThrow(/advanced recurrence should be blocked/i);
  });
});
