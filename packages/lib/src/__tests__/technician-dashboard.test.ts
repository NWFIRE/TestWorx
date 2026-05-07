import { AttachmentKind, InspectionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    inspection: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

import { getTechnicianDashboardData } from "../scheduling";

describe("technician dashboard inspection access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes completed inspections from technician dashboard results", async () => {
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([
        {
          id: "inspection_1",
          tenantId: "tenant_1",
          status: InspectionStatus.scheduled,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-03-17T09:00:00.000Z"),
          site: { id: "site_1", name: "Pinecrest Tower" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          assignedTechnician: { id: "tech_1", name: "Alex Turner" },
          technicianAssignments: [],
          tasks: [
            {
              id: "task_1",
              inspectionType: "fire_extinguisher",
              assignedTechnicianId: "tech_1",
              schedulingStatus: "scheduled_now",
              recurrence: null,
              report: null
            }
          ],
          attachments: [
            {
              id: "attachment_pdf_1",
              fileName: "floor-plan.pdf",
              mimeType: "application/pdf",
              source: "uploaded",
              customerVisible: false,
              createdAt: new Date("2026-03-16T09:00:00.000Z")
            }
          ],
          documents: [
            {
              id: "document_1",
              label: "Customer form",
              fileName: "customer-form.pdf",
              fileSize: 12000,
              mimeType: "application/pdf",
              requiresSignature: true,
              status: "READY_FOR_SIGNATURE",
              annotatedStorageKey: null,
              signedStorageKey: null,
              signedAt: null
            }
          ]
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_1", role: "technician", tenantId: "tenant_1" });

    expect(prismaMock.inspection.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        tenantId: "tenant_1",
        status: {
          in: [
            InspectionStatus.to_be_completed,
            InspectionStatus.scheduled,
            InspectionStatus.in_progress,
            InspectionStatus.follow_up_required
          ]
        }
      }),
      include: expect.objectContaining({
        attachments: expect.objectContaining({
          where: { kind: AttachmentKind.pdf },
          select: expect.objectContaining({
            id: true,
            fileName: true,
            mimeType: true
          })
        }),
        documents: expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            fileName: true,
            fileSize: true,
            mimeType: true
          })
        })
      })
    }));
    expect(result.assigned).toHaveLength(1);
    expect(result.assigned[0]?.id).toBe("inspection_1");
    expect(result.assigned[0]?.documents).toHaveLength(1);
    expect(result.assigned[0]?.attachments).toHaveLength(1);
  });

  it("shows unassigned claimable inspections in the shared queue for technicians", async () => {
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "inspection_shared",
          tenantId: "tenant_1",
          status: InspectionStatus.scheduled,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-03-17T09:00:00.000Z"),
          site: { id: "site_1", name: "Pinecrest Tower" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          assignedTechnician: null,
          technicianAssignments: [],
          tasks: [
            {
              id: "task_shared",
              inspectionType: "fire_extinguisher",
              assignedTechnicianId: null,
              schedulingStatus: "scheduled_now",
              recurrence: null,
              report: null
            }
          ]
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_2", role: "technician", tenantId: "tenant_1" });

    expect(prismaMock.inspection.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        tenantId: "tenant_1",
        claimable: true,
        status: {
          in: [
            InspectionStatus.to_be_completed,
            InspectionStatus.scheduled,
            InspectionStatus.in_progress,
            InspectionStatus.follow_up_required
          ]
        },
        scheduledStart: { lte: expect.any(Date) }
      })
    }));
    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0]?.id).toBe("inspection_shared");
  });

  it("deduplicates claimable inspections while preserving multi-report task summaries", async () => {
    const multiReportInspection = {
      id: "inspection_multi_report",
      tenantId: "tenant_1",
      status: InspectionStatus.scheduled,
      inspectionClassification: "standard",
      isPriority: false,
      scheduledStart: new Date("2026-03-17T09:00:00.000Z"),
      site: { id: "site_1", name: "Pinecrest Tower" },
      customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
      assignedTechnician: null,
      technicianAssignments: [],
      convertedFromQuotes: [],
      tasks: [
        {
          id: "task_kitchen",
          inspectionType: "kitchen_suppression",
          assignedTechnicianId: null,
          schedulingStatus: "scheduled_now",
          recurrence: null,
          report: null
        },
        {
          id: "task_extinguisher",
          inspectionType: "fire_extinguisher",
          assignedTechnicianId: null,
          schedulingStatus: "scheduled_now",
          recurrence: null,
          report: null
        },
        {
          id: "task_alarm",
          inspectionType: "fire_alarm",
          assignedTechnicianId: null,
          schedulingStatus: "scheduled_now",
          recurrence: null,
          report: null
        }
      ]
    };

    prismaMock.inspection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([multiReportInspection, { ...multiReportInspection }])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_2", role: "technician", tenantId: "tenant_1" });

    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0]?.id).toBe("inspection_multi_report");
    expect(result.unassigned[0]?.tasks).toHaveLength(3);
  });

  it("keeps claimable inspections visible when stale assignment rows exist", async () => {
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "inspection_shared_stale_assignment",
          tenantId: "tenant_1",
          status: InspectionStatus.scheduled,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-03-17T09:00:00.000Z"),
          site: { id: "site_1", name: "Pinecrest Tower" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          assignedTechnician: { id: "tech_old", name: "Previous Tech" },
          technicianAssignments: [{ technicianId: "tech_old", technician: { name: "Previous Tech" } }],
          tasks: [
            {
              id: "task_shared_stale_assignment",
              inspectionType: "fire_extinguisher",
              assignedTechnicianId: null,
              schedulingStatus: "scheduled_now",
              recurrence: null,
              report: null
            }
          ]
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_2", role: "technician", tenantId: "tenant_1" });

    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0]?.id).toBe("inspection_shared_stale_assignment");
  });

  it("does not show claimable inspections when their current report tasks are already assigned", async () => {
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "inspection_claimable_assigned_task",
          tenantId: "tenant_1",
          status: InspectionStatus.scheduled,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-03-17T09:00:00.000Z"),
          site: { id: "site_1", name: "Pinecrest Tower" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          assignedTechnician: null,
          technicianAssignments: [],
          tasks: [
            {
              id: "task_assigned",
              inspectionType: "fire_extinguisher",
              assignedTechnicianId: "tech_1",
              schedulingStatus: "scheduled_now",
              recurrence: null,
              report: null
            }
          ]
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_2", role: "technician", tenantId: "tenant_1" });

    expect(result.unassigned).toHaveLength(0);
  });

  it("shows near-term future claimable inspections when their future-scheduled tasks belong to that visit period", async () => {
    const scheduledStart = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const dueMonth = `${scheduledStart.getFullYear()}-${String(scheduledStart.getMonth() + 1).padStart(2, "0")}`;

    prismaMock.inspection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "inspection_future_shared",
          tenantId: "tenant_1",
          status: InspectionStatus.to_be_completed,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart,
          site: { id: "site_1", name: "Pinecrest Tower" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          assignedTechnician: null,
          technicianAssignments: [],
          tasks: [
            {
              id: "task_future_shared",
              inspectionType: "fire_alarm",
              assignedTechnicianId: null,
              dueMonth,
              dueDate: scheduledStart,
              schedulingStatus: "scheduled_future",
              status: InspectionStatus.to_be_completed,
              recurrence: null,
              report: null
            }
          ]
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_2", role: "technician", tenantId: "tenant_1" });

    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0]?.id).toBe("inspection_future_shared");
    expect(result.unassigned[0]?.tasks).toHaveLength(1);
  });

  it("excludes far-future claimable inspections from the mobile shared queue", async () => {
    const scheduledStart = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    const dueMonth = `${scheduledStart.getFullYear()}-${String(scheduledStart.getMonth() + 1).padStart(2, "0")}`;

    prismaMock.inspection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "inspection_far_future_shared",
          tenantId: "tenant_1",
          status: InspectionStatus.to_be_completed,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart,
          site: { id: "site_1", name: "Pinecrest Tower" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          assignedTechnician: null,
          technicianAssignments: [],
          tasks: [
            {
              id: "task_far_future_shared",
              inspectionType: "fire_alarm",
              assignedTechnicianId: null,
              dueMonth,
              dueDate: scheduledStart,
              schedulingStatus: "scheduled_future",
              status: InspectionStatus.to_be_completed,
              recurrence: null,
              report: null
            }
          ]
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_2", role: "technician", tenantId: "tenant_1" });

    expect(result.unassigned).toHaveLength(0);
  });

  it("does not show claimable inspections when fallback tasks are cancelled", async () => {
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "inspection_current_with_cancelled_task",
          tenantId: "tenant_1",
          status: InspectionStatus.to_be_completed,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-04-01T09:00:00.000Z"),
          site: { id: "site_1", name: "Pinecrest Tower" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          assignedTechnician: null,
          technicianAssignments: [],
          tasks: [
            {
              id: "task_cancelled",
              inspectionType: "fire_alarm",
              assignedTechnicianId: null,
              dueMonth: "2026-10",
              dueDate: new Date("2026-10-01T00:00:00.000Z"),
              schedulingStatus: "scheduled_future",
              status: InspectionStatus.cancelled,
              recurrence: null,
              report: null
            }
          ]
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_2", role: "technician", tenantId: "tenant_1" });

    expect(result.unassigned).toHaveLength(0);
  });

  it("does not show claimable inspections when their only tasks are future-due for another visit period", async () => {
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "inspection_claimable_legacy_task",
          tenantId: "tenant_1",
          status: InspectionStatus.to_be_completed,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-05-01T09:00:00.000Z"),
          site: { id: "site_1", name: "Pinecrest Tower" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          assignedTechnician: null,
          technicianAssignments: [],
          tasks: [
            {
              id: "task_legacy",
              inspectionType: "fire_extinguisher",
              assignedTechnicianId: null,
              dueMonth: "2026-10",
              dueDate: new Date("2026-10-01T00:00:00.000Z"),
              schedulingStatus: "scheduled_future",
              status: InspectionStatus.to_be_completed,
              recurrence: null,
              report: null
            }
          ]
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_2", role: "technician", tenantId: "tenant_1" });

    expect(result.unassigned).toHaveLength(0);
  });
});
