import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  inspection: {
    findFirst: vi.fn(),
    create: vi.fn(),
    findUniqueOrThrow: vi.fn()
  },
  inspectionReport: {
    count: vi.fn(),
    create: vi.fn()
  },
  customerCompany: {
    findFirst: vi.fn()
  },
  site: {
    findFirst: vi.fn()
  },
  user: {
    findFirst: vi.fn()
  },
  inspectionTask: {
    create: vi.fn()
  },
  inspectionRecurrence: {
    create: vi.fn()
  },
  inspectionAmendment: {
    findFirst: vi.fn(),
    create: vi.fn()
  },
  auditLog: {
    create: vi.fn()
  }
};

const prismaMock = {
  $transaction: vi.fn(async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx)),
  tenant: {
    findFirst: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

describe("inspection amendment workflow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: "tenant_1",
      stripeSubscriptionStatus: "active",
      subscriptionPlan: { code: "professional" }
    });
    tx.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      customerCompanyId: "customer_1",
      siteId: "site_1",
      assignedTechnicianId: "tech_1",
      status: "in_progress",
      scheduledStart: new Date("2026-03-13T09:00:00.000Z"),
      scheduledEnd: new Date("2026-03-13T10:00:00.000Z"),
      notes: "Original visit",
      tasks: [{ inspectionType: "fire_alarm", recurrence: { frequency: "ANNUAL" } }],
      site: { name: "Original Site" },
      customerCompany: { name: "Original Customer" },
      assignedTechnician: { id: "tech_1", name: "Taylor Tech" }
    });
    tx.inspectionReport.count.mockResolvedValue(2);
    tx.customerCompany.findFirst.mockResolvedValue({ id: "customer_2" });
    tx.site.findFirst.mockResolvedValue({ id: "site_2", customerCompanyId: "customer_2" });
    tx.user.findFirst.mockResolvedValue({ id: "tech_2", role: "technician" });
    tx.inspection.create.mockResolvedValue({ id: "replacement_1" });
    tx.inspectionAmendment.findFirst.mockResolvedValue(null);
    tx.inspectionTask.create
      .mockResolvedValueOnce({ id: "task_1" })
      .mockResolvedValueOnce({ id: "task_2" });
    tx.inspectionRecurrence.create.mockResolvedValue({});
    tx.inspectionReport.create.mockResolvedValue({});
    tx.inspectionAmendment.create.mockResolvedValue({ id: "amendment_1" });
    tx.auditLog.create.mockResolvedValue({});
    tx.inspection.findUniqueOrThrow.mockResolvedValue({ id: "replacement_1", status: "scheduled" });
  });

  it("creates an audited replacement visit instead of editing a started inspection", async () => {
    const { createInspectionAmendment } = await import("../scheduling");
    const created = await createInspectionAmendment(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1",
      {
        customerCompanyId: "customer_2",
        siteId: "site_2",
        scheduledStart: new Date("2026-03-20T09:00:00.000Z"),
        scheduledEnd: new Date("2026-03-20T10:30:00.000Z"),
        assignedTechnicianId: "tech_2",
        status: "scheduled",
        notes: "Return visit for remaining devices.",
        reason: "Customer requested a return visit after the initial inspection started.",
        tasks: [
          { inspectionType: "fire_alarm", frequency: "ANNUAL" },
          { inspectionType: "wet_fire_sprinkler", frequency: "ANNUAL" }
        ]
      } as any
    );

    expect(created).toEqual({ id: "replacement_1", status: "scheduled" });
    expect(tx.inspectionAmendment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inspectionId: "inspection_1",
        replacementInspectionId: "replacement_1",
        reason: expect.stringContaining("return visit")
      })
    }));
    expect(tx.auditLog.create).toHaveBeenCalledTimes(3);
  }, 15000);

  it("blocks no-op amendments that do not change scheduling details", async () => {
    tx.customerCompany.findFirst.mockResolvedValueOnce({ id: "customer_1" });
    tx.site.findFirst.mockResolvedValueOnce({ id: "site_1", customerCompanyId: "customer_1" });
    tx.user.findFirst.mockResolvedValueOnce({ id: "tech_1", role: "technician" });
    const { createInspectionAmendment } = await import("../scheduling");
    await expect(
      createInspectionAmendment(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        "inspection_1",
        {
          customerCompanyId: "customer_1",
          siteId: "site_1",
          scheduledStart: new Date("2026-03-13T09:00:00.000Z"),
          scheduledEnd: new Date("2026-03-13T10:00:00.000Z"),
          assignedTechnicianId: "tech_1",
          status: "scheduled",
          notes: "Original visit",
          reason: "Trying to save without making a real scheduling change.",
          tasks: [{ inspectionType: "fire_alarm", frequency: "ANNUAL" }]
        } as any
      )
    ).rejects.toThrow(/no scheduling changes/i);
  });

  it("blocks non-admin users from creating amendments", async () => {
    const { createInspectionAmendment } = await import("../scheduling");
    await expect(
      createInspectionAmendment(
        { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
        "inspection_1",
        {
          customerCompanyId: "customer_2",
          siteId: "site_2",
          scheduledStart: new Date("2026-03-20T09:00:00.000Z"),
          scheduledEnd: null,
          assignedTechnicianId: null,
          status: "scheduled",
          notes: "",
          reason: "Need a follow-up.",
          tasks: [{ inspectionType: "fire_alarm", frequency: "ANNUAL" }]
        } as any
      )
    ).rejects.toThrow(/only office administrators/i);
  });

  it("blocks creating a second amendment from the same started inspection", async () => {
    tx.inspectionAmendment.findFirst.mockResolvedValueOnce({ id: "existing_amendment" });
    const { createInspectionAmendment } = await import("../scheduling");
    await expect(
      createInspectionAmendment(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        "inspection_1",
        {
          customerCompanyId: "customer_2",
          siteId: "site_2",
          scheduledStart: new Date("2026-03-20T09:00:00.000Z"),
          scheduledEnd: new Date("2026-03-20T10:30:00.000Z"),
          assignedTechnicianId: "tech_2",
          status: "scheduled",
          notes: "Return visit for remaining devices.",
          reason: "Customer requested a follow-up after work already started.",
          tasks: [{ inspectionType: "fire_alarm", frequency: "ANNUAL" }]
        } as any
      )
    ).rejects.toThrow(/already has an amendment/i);
  });
});
