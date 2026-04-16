import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  inspection: {
    findMany: vi.fn()
  },
  inspectionReport: {
    groupBy: vi.fn()
  },
  auditLog: {
    findMany: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

describe("admin amendment management data", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "audit_superseded",
        entityId: "inspection_superseded",
        action: "inspection.amendment_created",
        createdAt: new Date("2026-03-13T15:00:00.000Z")
      }
    ]);
  });

  it("returns lifecycle counts and filterable amendment rows", async () => {
    prismaMock.inspection.findMany.mockResolvedValue([
      {
        id: "inspection_original",
        tenantId: "tenant_1",
        status: "scheduled",
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        scheduledStart: new Date("2026-03-20T09:00:00.000Z"),
        customerCompany: { name: "Original Customer" },
        site: { name: "Original Site" },
        assignedTechnician: null,
        technicianAssignments: [],
        closeoutRequest: null,
        tasks: [{ report: null }],
        documents: [],
        attachments: [],
        amendments: [],
        replacementAmendments: []
      },
      {
        id: "inspection_amended",
        tenantId: "tenant_1",
        status: "scheduled",
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        scheduledStart: new Date("2026-03-21T09:00:00.000Z"),
        customerCompany: { name: "Amended Customer" },
        site: { name: "Amended Site" },
        assignedTechnician: { name: "Taylor Tech" },
        technicianAssignments: [],
        closeoutRequest: {
          id: "request_1",
          status: "pending",
          requestType: "follow_up_inspection",
          note: "Return next week.",
          createdAt: new Date("2026-03-21T12:00:00.000Z"),
          requestedBy: { id: "tech_1", name: "Taylor Tech" },
          approvedBy: null,
          dismissedBy: null,
          createdInspection: null
        },
        tasks: [{ report: { id: "report_1", status: "finalized", finalizedAt: new Date("2026-03-21T11:00:00.000Z") } }],
        documents: [{ id: "document_1", requiresSignature: true, status: "READY_FOR_SIGNATURE" }],
        attachments: [],
        amendments: [],
        replacementAmendments: []
      },
      {
        id: "inspection_replacement",
        tenantId: "tenant_1",
        status: "scheduled",
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        scheduledStart: new Date("2026-03-22T09:00:00.000Z"),
        customerCompany: { name: "Replacement Customer" },
        site: { name: "Replacement Site" },
        assignedTechnician: { name: "Alex Tech" },
        technicianAssignments: [],
        closeoutRequest: null,
        tasks: [{ report: { id: "report_2", status: "finalized", finalizedAt: new Date("2026-03-22T12:00:00.000Z") } }],
        documents: [],
        attachments: [{ id: "attachment_1" }],
        amendments: [],
        replacementAmendments: [
          {
            id: "amendment_incoming",
            reason: "Return visit required.",
            type: "reschedule",
            createdAt: new Date("2026-03-13T14:00:00.000Z"),
            inspection: {
              id: "inspection_original_link",
              scheduledStart: new Date("2026-03-15T09:00:00.000Z"),
              site: { name: "Original Linked Site" },
              assignedTechnician: { name: "Taylor Tech" }
            }
          }
        ]
      },
      {
        id: "inspection_superseded",
        tenantId: "tenant_1",
        status: "in_progress",
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        scheduledStart: new Date("2026-03-18T09:00:00.000Z"),
        customerCompany: { name: "Superseded Customer" },
        site: { name: "Superseded Site" },
        assignedTechnician: { name: "Jordan Tech" },
        technicianAssignments: [],
        closeoutRequest: {
          id: "request_2",
          status: "approved",
          requestType: "new_inspection",
          note: "Schedule a separate scope.",
          createdAt: new Date("2026-03-18T15:00:00.000Z"),
          requestedBy: { id: "tech_2", name: "Jordan Tech" },
          approvedBy: { id: "office_1", name: "Office Admin" },
          dismissedBy: null,
          createdInspection: { id: "created_inspection_1", site: { name: "Created Site" }, customerCompany: { name: "Superseded Customer" } }
        },
        tasks: [{ report: { id: "report_3", status: "finalized", finalizedAt: new Date("2026-03-18T14:00:00.000Z") } }],
        documents: [{ id: "document_2", requiresSignature: true, status: "SIGNED" }],
        attachments: [],
        amendments: [
          {
            id: "amendment_outgoing",
            reason: "Split the remaining devices to a follow-up day.",
            type: "scope_change",
            createdAt: new Date("2026-03-13T15:00:00.000Z"),
            replacementInspection: {
              id: "inspection_replacement_link",
              scheduledStart: new Date("2026-03-25T09:00:00.000Z"),
              site: { name: "Replacement Linked Site" },
              assignedTechnician: { name: "Alex Tech" }
            }
          }
        ],
        replacementAmendments: []
      }
    ]);

    prismaMock.inspectionReport.groupBy.mockResolvedValue([
      {
        inspectionId: "inspection_amended",
        _count: { _all: 2 }
      }
    ]);

    const { getAdminAmendmentManagementData } = await import("../scheduling");
    const result = await getAdminAmendmentManagementData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { filter: "all" }
    );

    expect(result.lifecycleCounts).toEqual({
      original: 1,
      amended: 1,
      replacement: 1,
      superseded: 1
    });
    expect(result.filterCounts.pending_follow_up_request).toBe(1);
    expect(result.items.find((item) => item.id === "inspection_superseded")?.outgoingAmendment?.replacementInspection.id).toBe("inspection_replacement_link");
  }, 15000);

  it("filters items by review state", async () => {
    prismaMock.inspection.findMany.mockResolvedValue([
      {
        id: "inspection_amended",
        tenantId: "tenant_1",
        status: "scheduled",
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        scheduledStart: new Date("2026-03-21T09:00:00.000Z"),
        customerCompany: { name: "Amended Customer" },
        site: { name: "Amended Site" },
        assignedTechnician: { name: "Taylor Tech" },
        technicianAssignments: [],
        closeoutRequest: {
          id: "request_1",
          status: "pending",
          requestType: "follow_up_inspection",
          note: "Return next week.",
          createdAt: new Date("2026-03-21T12:00:00.000Z"),
          requestedBy: { id: "tech_1", name: "Taylor Tech" },
          approvedBy: null,
          dismissedBy: null,
          createdInspection: null
        },
        tasks: [{ report: { id: "report_1", status: "finalized", finalizedAt: new Date("2026-03-21T11:00:00.000Z") } }],
        documents: [],
        attachments: [],
        amendments: [],
        replacementAmendments: []
      },
      {
        id: "inspection_original",
        tenantId: "tenant_1",
        status: "scheduled",
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        scheduledStart: new Date("2026-03-20T09:00:00.000Z"),
        customerCompany: { name: "Original Customer" },
        site: { name: "Original Site" },
        assignedTechnician: null,
        technicianAssignments: [],
        closeoutRequest: null,
        tasks: [{ report: { id: "report_2", status: "finalized", finalizedAt: new Date("2026-03-20T10:00:00.000Z") } }],
        documents: [],
        attachments: [],
        amendments: [],
        replacementAmendments: []
      }
    ]);
    prismaMock.inspectionReport.groupBy.mockResolvedValue([
      {
        inspectionId: "inspection_amended",
        _count: { _all: 1 }
      }
    ]);

    const { getAdminAmendmentManagementData } = await import("../scheduling");
    const result = await getAdminAmendmentManagementData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { filter: "pending_follow_up_request" }
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("inspection_amended");
    expect(result.filter).toBe("pending_follow_up_request");
  });

  it("uses the customer as the primary title for generic inspection sites", async () => {
    prismaMock.inspection.findMany.mockResolvedValue([
      {
        id: "inspection_generic",
        tenantId: "tenant_1",
        status: "completed",
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        scheduledStart: new Date("2026-03-21T09:00:00.000Z"),
        customerCompany: { name: "Land Run Historical Center" },
        site: { name: "General / No Fixed Site" },
        assignedTechnician: { name: "Taylor Tech" },
        technicianAssignments: [],
        closeoutRequest: null,
        tasks: [{ report: { id: "report_1", status: "draft", finalizedAt: null } }],
        documents: [],
        attachments: [],
        amendments: [],
        replacementAmendments: []
      }
    ]);
    prismaMock.inspectionReport.groupBy.mockResolvedValue([]);

    const { getAdminAmendmentManagementData } = await import("../scheduling");
    const result = await getAdminAmendmentManagementData(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      { filter: "all" }
    );

    expect(result.items[0]?.primaryTitle).toBe("Land Run Historical Center");
    expect(result.items[0]?.customerLabel).toBe("Land Run Historical Center");
    expect(result.items[0]?.locationLabel).toBe("No fixed service address");
    expect(result.items[0]?.secondaryTitle).toBeNull();
  });

  it("blocks technician access to amendment management", async () => {
    const { getAdminAmendmentManagementData } = await import("../scheduling");

    await expect(
      getAdminAmendmentManagementData({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, { filter: "all" })
    ).rejects.toThrow(/only tenant and office administrators/i);
  });
});
