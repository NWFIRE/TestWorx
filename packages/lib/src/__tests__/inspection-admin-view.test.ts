import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  inspection: {
    findFirst: vi.fn()
  },
  inspectionReport: {
    count: vi.fn()
  },
  deficiency: {
    findMany: vi.fn()
  },
  auditLog: {
    findMany: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

describe("inspection admin lifecycle view", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prismaMock.inspectionReport.count.mockResolvedValue(2);
    prismaMock.deficiency.findMany.mockResolvedValue([]);
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "audit_1",
        action: "inspection.amendment_created",
        createdAt: new Date("2026-03-13T14:00:00.000Z"),
        metadata: {
          reason: "Customer requested a return visit.",
          amendmentType: "reschedule",
          replacementInspectionId: "replacement_1"
        }
      }
    ]);
  });

  it("returns superseded state with replacement navigation details", async () => {
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
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
      assignedTechnician: { id: "tech_1", name: "Taylor Tech" },
      replacementAmendments: [],
      amendments: [
        {
          id: "amendment_1",
          reason: "Customer requested a return visit.",
          type: "reschedule",
          createdAt: new Date("2026-03-13T14:00:00.000Z"),
          replacementInspection: {
            id: "replacement_1",
            scheduledStart: new Date("2026-03-20T09:00:00.000Z"),
            site: { name: "Replacement Site" },
            assignedTechnician: { name: "Alex Tech" }
          }
        }
      ]
    });

    const { getInspectionForEdit } = await import("../scheduling");
    const result = await getInspectionForEdit({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" }, "inspection_1");

    expect(result?.lifecycle).toBe("superseded");
    expect(result?.outgoingAmendment?.replacementInspection.id).toBe("replacement_1");
    expect(result?.auditTrail).toHaveLength(1);
  }, 15000);

  it("returns replacement state with original inspection navigation details", async () => {
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "replacement_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      siteId: "site_2",
      assignedTechnicianId: "tech_2",
      status: "scheduled",
      scheduledStart: new Date("2026-03-20T09:00:00.000Z"),
      scheduledEnd: new Date("2026-03-20T10:00:00.000Z"),
      notes: "Replacement visit",
      tasks: [{ inspectionType: "fire_alarm", recurrence: { frequency: "ANNUAL" } }],
      site: { name: "Replacement Site" },
      customerCompany: { name: "Original Customer" },
      assignedTechnician: { id: "tech_2", name: "Alex Tech" },
      replacementAmendments: [
        {
          id: "amendment_1",
          reason: "Customer requested a return visit.",
          type: "reschedule",
          createdAt: new Date("2026-03-13T14:00:00.000Z"),
          inspection: {
            id: "inspection_1",
            scheduledStart: new Date("2026-03-13T09:00:00.000Z"),
            site: { name: "Original Site" },
            assignedTechnician: { name: "Taylor Tech" }
          }
        }
      ],
      amendments: []
    });

    const { getInspectionForEdit } = await import("../scheduling");
    const result = await getInspectionForEdit({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" }, "replacement_1");

    expect(result?.lifecycle).toBe("replacement");
    expect(result?.originalAmendment?.inspection.id).toBe("inspection_1");
  });

  it("blocks non-admin roles from viewing amendment details", async () => {
    const { getInspectionForEdit } = await import("../scheduling");

    await expect(
      getInspectionForEdit({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, "inspection_1")
    ).rejects.toThrow(/only tenant and office administrators/i);
  });
});
