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
      where: {
        tenantId: "tenant_1",
        assignedTechnicianId: null,
        technicianAssignments: { none: {} },
        claimable: true,
        status: { in: [InspectionStatus.to_be_completed, InspectionStatus.scheduled] }
      }
    }));
    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0]?.id).toBe("inspection_shared");
  });
});
