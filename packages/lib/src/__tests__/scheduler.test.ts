import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ user: { findFirst: vi.fn(), findMany: vi.fn() }, tenant: { findUniqueOrThrow: vi.fn() }, inspection: { findFirst: vi.fn(), findFirstOrThrow: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() }, inspectionTechnicianAssignment: { createMany: vi.fn(), deleteMany: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn(), $executeRaw: vi.fn() }));
vi.mock("@testworx/db", () => ({ prisma: db }));
import { getScheduler, getSchedulerJob, saveSchedulerJob } from "../scheduler";
import { serviceDestination } from "../service-directions";
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
  it("resizes an unassigned visit without assigning, claiming, or changing its start/status", async () => {
    db.inspection.findFirst.mockResolvedValue({...job, assignedTechnicianId:null, technicianAssignments:[]});
    await saveSchedulerJob(actor, {...input, start:"2026-11-19T09:00", end:"2026-11-19T11:15", technicianIds:[], resizeOnly:true});
    expect(db.inspection.updateMany).toHaveBeenCalledWith({where:{tenantId:"tenant", id:"job", updatedAt:job.updatedAt},data:{scheduledEnd:new Date("2026-11-19T17:15:00Z")}});
    expect(db.inspectionTechnicianAssignment.deleteMany).not.toHaveBeenCalled();
    expect(db.inspectionTechnicianAssignment.createMany).not.toHaveBeenCalled();
  });
  it("does not allow resize requests to change assignments or start", async () => {
    await expect(saveSchedulerJob(actor, {...input, resizeOnly:true})).rejects.toThrow("only change the end");
    await expect(saveSchedulerJob(actor, {...input, start:"2026-11-19T09:00", end:"2026-11-19T11:00", resizeOnly:true, technicianIds:["a"]})).rejects.toThrow("only change the end");
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
  });
  it("keeps overlap, version and closed-record checks for resizing", async () => {
    const resize = {...input, start:"2026-11-19T09:00", end:"2026-11-19T11:15", resizeOnly:true};
    db.inspection.findMany.mockResolvedValue([{id:"other", customerCompany:{name:"Other"}}]);
    expect((await saveSchedulerJob(actor, resize)).ok).toBe(false);
    await expect(saveSchedulerJob(actor, {...resize,updatedAt:"2026-11-18T12:00:00Z"})).rejects.toThrow("changed");
    db.inspection.findFirst.mockResolvedValue({...job,archivedAt:new Date()});
    await expect(saveSchedulerJob(actor, resize)).rejects.toThrow("Closed");
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
  });
  it("still requires assignments for normal schedule saves", async () => {
    await expect(saveSchedulerJob(actor, {...input, technicianIds:[]})).rejects.toThrow("Choose at least one");
  });
  it("loads a busy Home day without changing inspection status or progress", async () => {
    db.inspection.findMany.mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({ ...job, id: `job-${index}` })));
    const result = await getScheduler(actor, { date: "2026-11-19", view: "day" });
    expect(result.jobs).toHaveLength(12);
    expect(result.days).toEqual(["2026-11-19"]);
    expect(result.jobs[0].status).toBe("to_be_completed");
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("returns an empty Home day scoped to the selected company", async () => {
    const result = await getScheduler({ ...actor, tenantId: "other-company" }, { date: "2026-11-19", view: "day" });
    expect(result.jobs).toEqual([]);
    expect(db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "other-company", isActive: true }) }));
    expect(db.inspection.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "other-company" }) }));
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
  });
  it("includes the linked customer address in scheduler details without mutating the job", async () => {
    const site = { ...job.site, name: "General / No Fixed Site", addressLine1: "No fixed service address" };
    const customerCompany = { name: "Waste Connections", serviceAddressLine1: "38558 S. County Road 270", serviceCity: "Meno", serviceState: "OK", servicePostalCode: "73760" };
    db.inspection.findFirst.mockResolvedValue({ ...job, site, customerCompany });
    const result = await getSchedulerJob(actor, "job");
    expect(serviceDestination(result.serviceLocation, result.customerLocation)).toEqual(serviceDestination(site, customerCompany));
    expect(result.address).toContain("38558 S. County Road 270");
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("uses the inspection site for directions without writing workflow data", async () => {
    const site = { ...job.site, id: "site", addressLine2: "Entrance B", latitude: 36.4, longitude: -97.9 };
    db.inspection.findFirst.mockResolvedValue({ ...job, site });
    const result = await getSchedulerJob(actor, "job");
    expect(serviceDestination(result.serviceLocation)).toEqual(serviceDestination(site));
    expect(result.address).toContain("Entrance B");
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
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
