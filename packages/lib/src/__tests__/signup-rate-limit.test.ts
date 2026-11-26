import { afterEach, describe, expect, it, vi } from "vitest";
import { signupClientKey } from "../signup-rate-limit";

afterEach(() => vi.unstubAllEnvs());
describe("signup edge identity", () => {
  it("ignores spoofed forwarded headers outside the trusted edge", () => {
    vi.stubEnv("AUTH_SECRET", "unit-test-secret"); vi.stubEnv("VERCEL", "");
    expect(signupClientKey(new Headers({ "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "1.2.3.4" })))
      .toBe(signupClientKey(new Headers()));
  });
  it("uses only a valid Vercel address and never stores it as plaintext", () => {
    vi.stubEnv("AUTH_SECRET", "unit-test-secret"); vi.stubEnv("VERCEL", "1");
    const key = signupClientKey(new Headers({ "x-vercel-forwarded-for": "1.2.3.4" }));
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toBe(signupClientKey(new Headers({ "x-vercel-forwarded-for": "1.2.3.5" })));
    expect(signupClientKey(new Headers({ "x-vercel-forwarded-for": "1.2.3.4, spoofed" }))).toBe(signupClientKey(new Headers()));
  });
  it("fails closed without a hashing secret", () => {
    vi.stubEnv("AUTH_SECRET", ""); vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() => signupClientKey(new Headers())).toThrow(/not configured/);
  });
});
