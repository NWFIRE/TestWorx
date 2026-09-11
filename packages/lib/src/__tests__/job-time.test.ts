import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  inspection: { findFirst: vi.fn(), updateMany: vi.fn() },
  user: { findFirst: vi.fn() },
  jobTimeSession: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  tenant: { findUnique: vi.fn() }, auditLog: { create: vi.fn() }, $executeRaw: vi.fn(), $queryRaw: vi.fn(), $transaction: vi.fn()
}));
vi.mock("@testworx/db", () => ({ prisma: db }));
import { applyJobFinishTimeTx, assertJobStarted, recordJobTimeEvent, correctJobTime, getJobTime, stopJobTimeTx } from "../job-time";
const actor = { userId: "tech", tenantId: "tenant", role: "technician" };
const id = "c9678537-a28e-40a0-a8c8-7f73d055c321";
const event = () => ({ action: "start", sessionId: id, inspectionId: "job", userId: "tech", occurredAt: new Date().toISOString(), offline: false });
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (callback) => callback(db));
  db.auditLog.create.mockResolvedValue({ id: "audit" });
  db.user.findFirst.mockResolvedValue({ id: "tech" });
  db.inspection.findFirst.mockResolvedValue({ id: "job", status: "to_be_completed", archivedAt: null, assignedTechnicianId: "tech", technicianAssignments: [] });
  db.jobTimeSession.findFirst.mockResolvedValue(null);
  db.jobTimeSession.create.mockImplementation(async ({ data }) => data);
  db.jobTimeSession.update.mockImplementation(async ({ data }) => ({ id, ...data }));
  db.jobTimeSession.updateMany.mockResolvedValue({ count: 1 });
});
describe("job time", () => {
  it.each(["invalid", "2099-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z"])("retains server completion and flags an invalid device finish: %s", async (time) => {
    await applyJobFinishTimeTx(db as never, actor, "job", new Date(), time);
    expect(db.jobTimeSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { needsReview: true } }));
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });
  it("keeps server completion when a captured finish precedes the job start", async () => {
    db.jobTimeSession.findFirst.mockResolvedValue({ id });
    await applyJobFinishTimeTx(db as never, actor, "job", new Date("2026-09-11T12:00:00Z"), "2026-09-11T11:00:00Z");
    expect(db.jobTimeSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { needsReview: true } }));
  });
  it("preserves a valid delayed finish time", async () => {
    await applyJobFinishTimeTx(db as never, actor, "job", new Date("2026-09-11T12:00:00Z"), "2026-09-11T11:00:00Z");
    expect(db.jobTimeSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { endedAt: new Date("2026-09-11T11:00:00Z"), needsReview: true } }));
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it("blocks editing before start or while paused", async () => {
    await expect(assertJobStarted(actor, "job")).rejects.toThrow("Start or resume");
    expect(db.jobTimeSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant", technicianId: "tech", inspectionId: "job", endedAt: null } }));
  });
  it("allows editing with an active session", async () => {
    db.jobTimeSession.findFirst.mockResolvedValue({ id });
    await expect(assertJobStarted(actor, "job")).resolves.toBeUndefined();
  });
  it("does not require office corrections to start a timer", async () => {
    await assertJobStarted({ ...actor, role: "office_admin" }, "job");
    expect(db.jobTimeSession.findFirst).not.toHaveBeenCalled();
  });
  it("starts a job once and advances only a starting status", async () => {
    await recordJobTimeEvent(actor, event());
    expect(db.jobTimeSession.create).toHaveBeenCalledOnce();
    expect(db.inspection.updateMany).toHaveBeenCalledWith({ where: { id: "job", tenantId: "tenant", status: { in: ["to_be_completed", "scheduled"] } }, data: { status: "in_progress" } });
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });
  it("deduplicates a retried start without reopening a stopped session", async () => {
    db.jobTimeSession.findFirst.mockResolvedValue({ id, tenantId: "tenant", technicianId: "tech", inspectionId: "job", endedAt: new Date() });
    await recordJobTimeEvent(actor, event());
    expect(db.jobTimeSession.create).not.toHaveBeenCalled();
  });
  it("rejects overlapping active jobs", async () => {
    db.jobTimeSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "other" });
    await expect(recordJobTimeEvent(actor, event())).rejects.toThrow("Pause your current");
    expect(db.jobTimeSession.create).not.toHaveBeenCalled();
  });
  it.each(["completed", "cancelled", "invoiced"])("does not start a %s job", async (status) => {
    db.inspection.findFirst.mockResolvedValue({ status, assignedTechnicianId: "tech", technicianAssignments: [] });
    await expect(recordJobTimeEvent(actor, event())).rejects.toThrow("Closed jobs");
  });
  it("denies unassigned and cross-tenant access", async () => {
    db.inspection.findFirst.mockResolvedValue(null);
    await expect(recordJobTimeEvent(actor, event())).rejects.toThrow("not found");
    db.inspection.findFirst.mockResolvedValue({ assignedTechnicianId: "other", technicianAssignments: [] });
    await expect(recordJobTimeEvent(actor, event())).rejects.toThrow("does not have access");
  });
  it("rejects an offline event belonging to a different signed-in user", async () => {
    await expect(recordJobTimeEvent(actor, { ...event(), userId: "other" })).rejects.toThrow("Unauthorized");
  });
  it("preserves offline capture time and flags it for review", async () => {
    const occurredAt = new Date(Date.now() - 3600000).toISOString();
    await recordJobTimeEvent(actor, { ...event(), offline: true, occurredAt });
    expect(db.jobTimeSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ startedAt: new Date(occurredAt), needsReview: true }) });
  });
  it("pauses a running session", async () => {
    db.jobTimeSession.findFirst.mockResolvedValue({ id, tenantId: "tenant", technicianId: "tech", inspectionId: "job", startedAt: new Date(Date.now() - 3600000), endedAt: null });
    await recordJobTimeEvent(actor, { ...event(), action: "pause" });
    expect(db.jobTimeSession.update).toHaveBeenCalledWith({ where: { id }, data: expect.objectContaining({ endedAt: expect.any(Date), endReason: "paused" }) });
  });
  it("viewing does not change job status or create time", async () => {
    db.jobTimeSession.findMany.mockResolvedValue([]);
    await getJobTime(actor, "job");
    expect(db.jobTimeSession.create).not.toHaveBeenCalled();
    expect(db.inspection.updateMany).not.toHaveBeenCalled();
  });
  it("whole-job closure stops every active technician session", async () => {
    const now = new Date(); await stopJobTimeTx(db as never, "tenant", "job", now);
    expect(db.jobTimeSession.updateMany).toHaveBeenCalledWith({ where: { tenantId: "tenant", inspectionId: "job", endedAt: null }, data: { endedAt: now, endReason: "completed" } });
  });
  it("rejects technician time corrections", async () => {
    await expect(correctJobTime(actor, {})).rejects.toThrow("Only office");
  });
  it("requires a reason for office corrections", async () => {
    await expect(correctJobTime({ ...actor, role: "office_admin" }, { id, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reason: " " })).rejects.toThrow();
    expect(db.jobTimeSession.updateMany).not.toHaveBeenCalled();
  });
  it("allows reissued corrections without downgrading a completed inspection", async () => {
    db.inspection.findFirst.mockResolvedValue({ status: "completed", assignedTechnicianId: "tech", technicianAssignments: [], reports: [{ status: "draft", correctionState: "reissued_to_technician" }] });
    await recordJobTimeEvent(actor, event());
    expect(db.jobTimeSession.create).toHaveBeenCalledOnce();
    expect(db.inspection.updateMany.mock.calls[0]?.[0].where.status.in).not.toContain("completed");
  });
  it("rejects future offline timestamps", async () => {
    await expect(recordJobTimeEvent(actor, { ...event(), offline: true, occurredAt: new Date(Date.now() + 3600000).toISOString() })).rejects.toThrow("office review");
  });
  it("corrects a session with an audited reason", async () => {
    const startedAt = new Date(Date.now() - 7200000).toISOString(), endedAt = new Date(Date.now() - 3600000).toISOString();
    db.jobTimeSession.findFirst.mockResolvedValueOnce({ id, inspectionId: "job", technicianId: "tech", startedAt: new Date(startedAt), endedAt: null }).mockResolvedValueOnce(null);
    await correctJobTime({ ...actor, role: "office_admin" }, { id, startedAt, endedAt, updatedAt: endedAt, reason: "Missed stop" });
    expect(db.jobTimeSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant", updatedAt: new Date(endedAt) }), data: expect.objectContaining({ needsReview: false, endedAt: new Date(endedAt) }) }));
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "job.time_corrected", metadata: expect.objectContaining({ reason: "Missed stop" }) }) }));
  });
  it("rejects a correction that overlaps another job", async () => {
    const startedAt = new Date(Date.now() - 7200000).toISOString(), endedAt = new Date(Date.now() - 3600000).toISOString();
    db.jobTimeSession.findFirst.mockResolvedValueOnce({ id, technicianId: "tech" }).mockResolvedValueOnce({ id: "other" });
    await expect(correctJobTime({ ...actor, role: "office_admin" }, { id, startedAt, endedAt, updatedAt: endedAt, reason: "Fix" })).rejects.toThrow("overlap");
    expect(db.jobTimeSession.updateMany).not.toHaveBeenCalled();
  });
});
