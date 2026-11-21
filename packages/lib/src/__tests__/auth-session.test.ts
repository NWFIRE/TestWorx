import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, captured } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  captured: { callbacks: null as any }
}));

vi.mock("@testworx/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@testworx/lib/server/index", () => ({
  assertEnvForFeature: vi.fn(),
  comparePassword: vi.fn()
}));
vi.mock("next-auth", () => ({
  default: (config: any) => {
    captured.callbacks = config.callbacks;
    return {};
  }
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (config: any) => config }));

describe("server session revalidation", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await import("../../../../apps/web/src/auth");
  });

  it.each([null, { isActive: false }])("revokes a missing or deactivated user session", async (user) => {
    findUnique.mockResolvedValue(user);
    expect(await captured.callbacks.jwt({ token: {
      sub: "user_a", role: "tenant_admin", tenantId: "company_a", allowances: { accountAdmin: true }
    } })).toBeNull();
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user_a" }, select: expect.objectContaining({ isActive: true })
    }));
  });

  it("refreshes permissions and company from the server, not stale token claims", async () => {
    findUnique.mockResolvedValue({
      isActive: true, name: "Technician", role: "technician", tenantId: "company_b", allowances: null
    });
    expect(await captured.callbacks.jwt({ token: {
      sub: "user_a", role: "tenant_admin", tenantId: "company_a", allowances: { accountAdmin: true }
    } })).toMatchObject({ sub: "user_a", role: "technician", tenantId: "company_b", allowances: null });
  });

  it("fails closed when membership cannot be checked", async () => {
    findUnique.mockRejectedValue(new Error("Database unavailable"));
    await expect(captured.callbacks.jwt({ token: { sub: "user_a" } })).rejects.toThrow("Database unavailable");
  });
});
