import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateSystemReadiness, resetServerEnvForTests } from "..";

describe("evaluateSystemReadiness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvForTests();
  });

  it("flags localhost urls and inline storage as critical readiness issues", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://example");
    vi.stubEnv("AUTH_SECRET", "1234567890123456");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("STORAGE_DRIVER", "inline");

    const result = evaluateSystemReadiness();

    expect(result.ready).toBe(false);
    expect(result.criticalCount).toBe(2);
    expect(result.checks.find((check) => check.id === "deployment")?.level).toBe("action_required");
    expect(result.checks.find((check) => check.id === "storage")?.level).toBe("action_required");
    expect(result.summary).toMatch(/configuration updates are still required/i);
  });

  it("marks core readiness checks ready with https urls and blob storage", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://example");
    vi.stubEnv("AUTH_SECRET", "1234567890123456");
    vi.stubEnv("NEXTAUTH_URL", "https://app.testworx.com");
    vi.stubEnv("APP_URL", "https://app.testworx.com");
    vi.stubEnv("STORAGE_DRIVER", "vercel_blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_123");

    const result = evaluateSystemReadiness({
      stripeConfigured: true,
      stripeWebhookConfigured: true,
      quickBooksConfigured: true,
      quickBooksConnected: true,
      quickBooksMode: "live",
      quickBooksReconnectRequired: false
    });

    expect(result.ready).toBe(true);
    expect(result.criticalCount).toBe(0);
    expect(result.checks.find((check) => check.id === "deployment")?.level).toBe("ready");
    expect(result.checks.find((check) => check.id === "storage")?.level).toBe("ready");
    expect(result.checks.find((check) => check.id === "storage")?.detail).toMatch(/private Vercel Blob store/i);
    expect(result.checks.find((check) => check.id === "quickbooks")?.level).toBe("ready");
    expect(result.summary).toMatch(/system configuration is ready/i);
  });

  it("treats quickbooks and stripe as non-critical when core readiness is intact", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://example");
    vi.stubEnv("AUTH_SECRET", "1234567890123456");
    vi.stubEnv("NEXTAUTH_URL", "https://app.testworx.com");
    vi.stubEnv("APP_URL", "https://app.testworx.com");
    vi.stubEnv("STORAGE_DRIVER", "vercel_blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_123");

    const result = evaluateSystemReadiness({
      stripeConfigured: false,
      quickBooksConfigured: true,
      quickBooksConnected: false,
      quickBooksMode: "live",
      quickBooksReconnectRequired: true
    });

    expect(result.ready).toBe(true);
    expect(result.criticalCount).toBe(0);
    expect(result.recommendedCount).toBe(1);
    expect(result.optionalCount).toBe(1);
  });
});
