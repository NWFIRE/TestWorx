import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { createFieldServiceRequest, reviewFieldServiceRequest, getPendingFieldServiceRequestCount, fieldServiceRequestReviewSchema, fieldServiceRequestSchema } from "../field-service-requests";

const db = vi.hoisted(() => ({
  customerCompany: { findFirst: vi.fn() },
  fieldServiceRequest: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn()
}));
vi.mock("@testworx/db", () => ({ prisma: db }));
const tech = { userId: "tech_1", role: "technician" as const, tenantId: "tenant_1" };
const office = { ...tech, userId: "office_1", role: "office_admin" as const };
const input = {
  submissionId: "50a62a16-fc01-402b-a288-d13404351be0",
  customerCompanyId: "customer_1", siteId: null, requestType: "service_ticket", priority: "normal",
  title: "Replace pull station", description: "The pull station by the east exit is damaged.",
  equipmentContext: null, preferredTiming: null
};

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((callback) => callback(db));
  db.customerCompany.findFirst.mockResolvedValue({ id: "customer_1", sites: [] });
  db.fieldServiceRequest.create.mockResolvedValue({ id: input.submissionId });
  db.fieldServiceRequest.findFirst.mockResolvedValue({ id: "request_1", status: "pending", adminNote: null, updatedAt: new Date("2026-09-08") });
  db.fieldServiceRequest.updateMany.mockResolvedValue({ count: 1 });
});

describe("field service request validation", () => {
  it("accepts a detailed technician request without a site", () => {
    const result = fieldServiceRequestSchema.parse({
      customerCompanyId: "customer_1",
      siteId: "",
      requestType: "service_ticket",
      priority: "urgent",
      title: "Replace damaged pull station",
      description: "The east hallway pull station is cracked and needs replacement.",
      equipmentContext: "First floor, east exit",
      preferredTiming: "Before Friday"
    });
    expect(result.siteId).toBeNull();
    expect(result.priority).toBe("urgent");
  });

  it("rejects requests without actionable field details", () => {
    expect(() => fieldServiceRequestSchema.parse({
      customerCompanyId: "customer_1",
      requestType: "work_order",
      priority: "normal",
      title: "Fix",
      description: "Broken"
    })).toThrow();
  });

  it("only allows office workflow statuses during review", () => {
    expect(() => fieldServiceRequestReviewSchema.parse({ requestId: "request_1", status: "pending" })).toThrow();
    expect(fieldServiceRequestReviewSchema.parse({ requestId: "request_1", status: "resolved" }).status).toBe("resolved");
  });
});

describe("field request persistence", () => {
  it("accepts null optional fields from a form without saved sites", async () => {
    await createFieldServiceRequest(tech, input);
    expect(db.fieldServiceRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      id: input.submissionId, tenantId: "tenant_1", requestedByUserId: "tech_1", siteId: null
    }) });
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a customer outside the tenant before writing", async () => {
    db.customerCompany.findFirst.mockResolvedValue(null);
    await expect(createFieldServiceRequest(tech, input)).rejects.toThrow("not available");
    expect(db.customerCompany.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "customer_1", tenantId: "tenant_1", isActive: true } }));
    expect(db.fieldServiceRequest.create).not.toHaveBeenCalled();
  });

  it("rejects a stale site from another customer", async () => {
    await expect(createFieldServiceRequest(tech, { ...input, siteId: "other_site" })).rejects.toThrow("does not belong");
    expect(db.fieldServiceRequest.create).not.toHaveBeenCalled();
  });

  it("returns an owned saved request after a duplicate retry without another audit entry", async () => {
    db.fieldServiceRequest.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6.19.2" }));
    db.fieldServiceRequest.findFirst.mockResolvedValue({ id: input.submissionId });
    expect(await createFieldServiceRequest(tech, input)).toEqual({ id: input.submissionId });
    expect(db.fieldServiceRequest.findFirst).toHaveBeenCalledWith({ where: { id: input.submissionId, tenantId: "tenant_1", requestedByUserId: "tech_1" } });
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("never exposes another user's request after an ID collision", async () => {
    db.fieldServiceRequest.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6.19.2" }));
    db.fieldServiceRequest.findFirst.mockResolvedValue(null);
    await expect(createFieldServiceRequest(tech, input)).rejects.toThrow("duplicate");
  });

  it("blocks technicians from office review", async () => {
    await expect(reviewFieldServiceRequest(tech, { requestId: "request_1", status: "resolved" })).rejects.toThrow("Only office");
    expect(db.fieldServiceRequest.updateMany).not.toHaveBeenCalled();
  });

  it("does not reopen a closed request from a stale form", async () => {
    db.fieldServiceRequest.findFirst.mockResolvedValue({ id: "request_1", status: "resolved", adminNote: null });
    await expect(reviewFieldServiceRequest(office, { requestId: "request_1", status: "acknowledged" })).rejects.toThrow("already been closed");
    expect(db.fieldServiceRequest.updateMany).not.toHaveBeenCalled();
  });

  it("does not repeat an identical review or its timestamp", async () => {
    db.fieldServiceRequest.findFirst.mockResolvedValue({ id: "request_1", status: "acknowledged", adminNote: null });
    await reviewFieldServiceRequest(office, { requestId: "request_1", status: "acknowledged" });
    expect(db.fieldServiceRequest.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("detects a concurrent office edit before recording success", async () => {
    db.fieldServiceRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(reviewFieldServiceRequest(office, { requestId: "request_1", status: "resolved" })).rejects.toThrow("changed while");
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("updates and audits a tenant scoped review", async () => {
    await reviewFieldServiceRequest(office, { requestId: "request_1", status: "resolved", adminNote: "Scheduled repair" });
    expect(db.fieldServiceRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant_1", status: "pending", updatedAt: expect.any(Date) }) }));
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("counts only pending requests for the office tenant", async () => {
    db.fieldServiceRequest.count.mockResolvedValue(2);
    expect(await getPendingFieldServiceRequestCount(office)).toBe(2);
    expect(db.fieldServiceRequest.count).toHaveBeenCalledWith({ where: { tenantId: "tenant_1", status: "pending" } });
  });
});
