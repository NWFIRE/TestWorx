import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ user: { findFirst: vi.fn() }, site: { findFirst: vi.fn(), updateMany: vi.fn(), findFirstOrThrow: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@testworx/db", () => ({ prisma: db }));
import { saveServiceLocation, serviceLocationSchema } from "../service-location";
const actor = { userId: "office", tenantId: "tenant", role: "office_admin" };
const data = { addressLine1: "10 Main", addressLine2: "", city: "Enid", state: "OK", postalCode: "73701", latitude: "36.4", longitude: "-97.9" };
beforeEach(() => { vi.resetAllMocks(); db.$transaction.mockImplementation((fn) => fn(db)); db.user.findFirst.mockResolvedValue({ id: "office" }); db.site.findFirst.mockResolvedValue({ id: "site", latitude: null, longitude: null }); });
describe("service location editing", () => {
  it.each(["technician", "customer_user", "platform_admin"])("blocks %s", async (role) => { await expect(saveServiceLocation({ ...actor, role }, "site", data)).rejects.toThrow("Only office"); expect(db.site.updateMany).not.toHaveBeenCalled(); });
  it("blocks inactive accounts", async () => { db.user.findFirst.mockResolvedValue(null); await expect(saveServiceLocation(actor, "site", data)).rejects.toThrow("unavailable"); });
  it("rejects foreign sites", async () => { db.site.findFirst.mockResolvedValue(null); await expect(saveServiceLocation(actor, "foreign", data)).rejects.toThrow("not found"); expect(db.site.updateMany).not.toHaveBeenCalled(); });
  it("updates only the tenant's site and records the edit", async () => {
    await saveServiceLocation(actor, "site", data);
    expect(db.site.findFirst).toHaveBeenCalledWith({ where: { id: "site", tenantId: "tenant" } });
    expect(db.site.updateMany).toHaveBeenCalledWith({ where: { id: "site", tenantId: "tenant" }, data: { ...data, latitude: 36.4, longitude: -97.9 } });
    expect(db.auditLog.create).toHaveBeenCalled();
  });
  it.each([{ latitude: "", longitude: "1" }, { latitude: "91" }, { longitude: "181" }, { latitude: "Infinity" }, { latitude: "foo" }])("rejects invalid/partial pins", (value) => expect(serviceLocationSchema.safeParse({ ...data, ...value }).success).toBe(false));
  it("removes a pin when both coordinates are blank", () => expect(serviceLocationSchema.parse({ ...data, latitude: "", longitude: "" })).toMatchObject({ latitude: null, longitude: null }));
});
