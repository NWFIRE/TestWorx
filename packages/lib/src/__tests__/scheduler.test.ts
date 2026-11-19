import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ user: { findFirst: vi.fn(), findMany: vi.fn() }, tenant: { findUniqueOrThrow: vi.fn() }, inspection: { findFirst: vi.fn(), findFirstOrThrow: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() }, inspectionTechnicianAssignment: { createMany: vi.fn(), deleteMany: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn(), $executeRaw: vi.fn() }));
vi.mock("@testworx/db", () => ({ prisma: db }));
import { getScheduler, getSchedulerJob, saveSchedulerJob } from "../scheduler";
const actor = { userId: "office", tenantId: "tenant", role: "office_admin" };
const job = { id: "job", scheduledStart: new Date("2026-11-19T15:00Z"), scheduledEnd: new Date("2026-11-19T16:00Z"), updatedAt: new Date("2026-11-19T12:00Z"), status: "to_be_completed", assignedTechnicianId: "a", technicianAssignments: [{ technicianId: "a" }, { technicianId: "b" }], customerCompany: { name: "Customer" }, site: { name: "Site", addressLine1: "1 Main", city: "Enid", state: "OK", postalCode: "" }, tasks: [{ inspectionType: "fire_alarm" }], jobTimeSessions: [] };
const input = { inspectionId: "job", updatedAt: job.updatedAt.toISOString(), start: "2026-11-26T09:00", end: "2026-11-26T10:00", technicianIds: ["a", "b"] };
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn) => fn(db));
  db.user.findFirst.mockResolvedValue({ id: "office" });
  db.user.findMany.mockResolvedValue([{ id: "a", name: "A", isActive: true }, { id: "b", name: "B", isActive: true }]);
  db.tenant.findUniqueOrThrow.mockResolvedValue({ timezone: "America/Chicago" });
  db.inspection.findFirst.mockResolvedValue(job);
  db.inspection.findFirstOrThrow.mockResolvedValue(job);
  db.inspection.findMany.mockResolvedValue([]);
  db.inspection.updateMany.mockResolvedValue({ count: 1 });
});
describe("scheduler authorization and dispatch", () => {
  it.each(["technician", "customer_user", "platform_admin"])("blocks %s", async (role) => {
    await expect(getScheduler({ ...actor, role }, {})).rejects.toThrow("Only office");
    expect(db.inspection.findMany).not.toHaveBeenCalled();
  });
  it("blocks deactivated office users", async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(saveSchedulerJob(actor, input)).rejects.toThrow("access");
  });
  it("loads only tenant/range records and keeps empty technicians", async () => {
    const board = await getScheduler(actor, { date: "2026-11-26", view: "week" });
    expect(board.days).toHaveLength(7);
    expect(board.technicians).toHaveLength(2);
    expect(db.inspection.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant", OR: expect.any(Array) }), take: 2001 }));
  });
  it("enforces tenant on individual detail fetch", async () => {
    await getSchedulerJob(actor, "job");
    expect(db.inspection.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant", id: "job" } }));
  });
  it("preserves multiple assignments and changes no recurrence/report fields", async () => {
    const result = await saveSchedulerJob(actor, input);
    expect(result.ok).toBe(true);
    expect(db.inspection.updateMany).toHaveBeenCalledWith({ where: { tenantId: "tenant", id: "job", updatedAt: job.updatedAt }, data: { scheduledStart: new Date("2026-11-26T15:00Z"), scheduledEnd: new Date("2026-11-26T16:00Z"), assignedTechnicianId: "a", claimable: false } });
    expect(db.inspectionTechnicianAssignment.createMany).toHaveBeenCalledWith({ data: ["a", "b"].map((technicianId) => ({ tenantId: "tenant", inspectionId: "job", technicianId })), skipDuplicates: true });
  });
  it("rejects stale edits before writing", async () => {
    await expect(saveSchedulerJob(actor, { ...input, updatedAt: "2026-11-18T12:00:00Z" })).rejects.toThrow("changed");
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
  });
  it("rejects assignment to another tenant or inactive user", async () => {
    db.user.findMany.mockResolvedValue([{ id: "a" }]);
    await expect(saveSchedulerJob(actor, input)).rejects.toThrow("active technicians");
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
  });
  it("requires explicit overlap acknowledgement", async () => {
    db.inspection.findMany.mockResolvedValue([{ id: "other", customerCompany: { name: "Other" } }]);
    expect(await saveSchedulerJob(actor, input)).toEqual({ ok: false, conflicts: [{ id: "other", customer: "Other" }] });
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
    expect((await saveSchedulerJob(actor, { ...input, allowOverlap: true })).ok).toBe(true);
  });
  it.each(["completed", "invoiced", "cancelled"])("does not reschedule %s", async (status) => {
    db.inspection.findFirst.mockResolvedValue({ ...job, status });
    await expect(saveSchedulerJob(actor, input)).rejects.toThrow("Closed");
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
  });
});
