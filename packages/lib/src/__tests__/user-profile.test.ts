import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn()
}));
vi.mock("@testworx/db", () => ({ prisma: db }));
import { getOwnUserProfile, updateOwnUserProfile } from "../user-profile";

const actor = { userId: "self", tenantId: "company-a" };
describe("own profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(callback => callback(db));
    db.user.findFirst.mockResolvedValue({ name: "Old name" });
    db.user.updateMany.mockResolvedValue({ count: 1 });
  });
  it("reads only the current active account in the exact tenant", async () => {
    await getOwnUserProfile(actor);
    expect(db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id:"self",tenantId:"company-a",isActive:true}}));
    const select = db.user.findFirst.mock.calls[0][0].select;
    expect(select.passwordHash).toBeUndefined();
    expect(select.allowances).toBeUndefined();
  });
  it("does not broaden a platform account's null tenant scope", async () => {
    await getOwnUserProfile({...actor,tenantId:null});
    expect(db.user.findFirst.mock.calls[0][0].where.tenantId).toBeNull();
  });
  it("updates only the name and audits the change", async () => {
    await expect(updateOwnUserProfile(actor,"  New name  ")).resolves.toBe("New name");
    expect(db.user.updateMany).toHaveBeenCalledWith({where:{id:"self",tenantId:"company-a",isActive:true},data:{name:"New name"}});
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({entityId:"self",tenantId:"company-a",actorUserId:"self"})}));
  });
  it.each(["", "   ", "x".repeat(101), "Bad\u0000Name", null])("rejects invalid names: %s", async name => {
    await expect(updateOwnUserProfile(actor,name)).rejects.toThrow("Enter a name");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects missing, inactive, or cross-tenant accounts", async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(updateOwnUserProfile(actor,"Name")).rejects.toThrow("no longer available");
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it("does not audit or update unchanged values", async () => {
    await updateOwnUserProfile(actor,"Old name");
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it("rejects accounts deactivated before the update", async () => {
    db.user.updateMany.mockResolvedValue({count:0});
    await expect(updateOwnUserProfile(actor,"Name")).rejects.toThrow("could not be updated");
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});
