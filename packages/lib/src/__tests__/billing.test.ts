import { afterEach, describe, expect, it, vi } from "vitest";

import { canManageBilling, getBillingConfiguration, resolveTenantEntitlements } from "../billing";
import { resetServerEnvForTests } from "../env";

describe("billing authorization and config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvForTests();
  });

  it("limits billing controls to tenant admins and platform admins", () => {
    expect(canManageBilling("tenant_admin")).toBe(true);
    expect(canManageBilling("platform_admin")).toBe(true);
    expect(canManageBilling("office_admin")).toBe(false);
    expect(canManageBilling("customer_user")).toBe(false);
  });

  it("disables gated entitlements when a subscription is not active", () => {
    expect(resolveTenantEntitlements("professional", "active").advancedRecurrence).toBe(true);
    expect(resolveTenantEntitlements("professional", "canceled").advancedRecurrence).toBe(false);
    expect(resolveTenantEntitlements("starter", "active").uploadedInspectionPdfs).toBe(false);
  });

  it("reads Stripe plan configuration from env vars", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/testworx?schema=public");
    vi.stubEnv("AUTH_SECRET", "replace-with-a-long-random-secret");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("STORAGE_DRIVER", "inline");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_starter");
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_professional");
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_test_123");

    const config = getBillingConfiguration();

    expect(config.enabled).toBe(true);
    expect(config.publishableKey).toBe("pk_test_123");
    expect(config.plans.find((plan) => plan.code === "starter")?.stripePriceId).toBe("price_starter");
    expect(config.plans.find((plan) => plan.code === "enterprise")?.label).toBe("Enterprise");
  });
});
