import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluatePilotReadiness, resetServerEnvForTests } from "..";

describe("evaluatePilotReadiness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvForTests();
  });

  it("flags localhost urls and inline storage as critical pilot blockers", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://example");
    vi.stubEnv("AUTH_SECRET", "1234567890123456");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("STORAGE_DRIVER", "inline");

    const result = evaluatePilotReadiness();

    expect(result.readyForPilot).toBe(false);
    expect(result.criticalCount).toBe(2);
    expect(result.checks.find((check) => check.id === "deployment")?.level).toBe("action_required");
    expect(result.checks.find((check) => check.id === "storage")?.level).toBe("action_required");
  });

  it("marks core pilot checks ready with https urls and blob storage", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://example");
    vi.stubEnv("AUTH_SECRET", "1234567890123456");
    vi.stubEnv("NEXTAUTH_URL", "https://app.testworx.com");
    vi.stubEnv("APP_URL", "https://app.testworx.com");
    vi.stubEnv("STORAGE_DRIVER", "vercel_blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_123");

    const result = evaluatePilotReadiness({
      stripeConfigured: true,
      stripeWebhookConfigured: true,
      quickBooksConfigured: true,
      quickBooksConnected: true,
      quickBooksMode: "live",
      quickBooksReconnectRequired: false
    });

    expect(result.readyForPilot).toBe(true);
    expect(result.criticalCount).toBe(0);
    expect(result.checks.find((check) => check.id === "deployment")?.level).toBe("ready");
    expect(result.checks.find((check) => check.id === "storage")?.level).toBe("ready");
    expect(result.checks.find((check) => check.id === "quickbooks")?.level).toBe("ready");
  });

  it("treats quickbooks and stripe as non-critical for an internal pilot", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://example");
    vi.stubEnv("AUTH_SECRET", "1234567890123456");
    vi.stubEnv("NEXTAUTH_URL", "https://app.testworx.com");
    vi.stubEnv("APP_URL", "https://app.testworx.com");
    vi.stubEnv("STORAGE_DRIVER", "vercel_blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_123");

    const result = evaluatePilotReadiness({
      stripeConfigured: false,
      quickBooksConfigured: true,
      quickBooksConnected: false,
      quickBooksMode: "live",
      quickBooksReconnectRequired: true
    });

    expect(result.readyForPilot).toBe(true);
    expect(result.criticalCount).toBe(0);
    expect(result.recommendedCount).toBe(1);
    expect(result.optionalCount).toBe(1);
  });
});
