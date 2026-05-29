import { AttachmentKind, InspectionStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    inspection: {
      findMany: vi.fn()
    },
    user: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

import { filterSubsetDuplicateOperationalInspections, getAdminSchedulingQueueData, getTechnicianDashboardData } from "../scheduling";

describe("technician dashboard inspection access", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T12:00:00.000Z"));
    vi.clearAllMocks();
    prismaMock.$transaction.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("shows assigned following-month inspections while keeping them out of current-month buckets", async () => {
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([
        {
          id: "inspection_future_assigned",
          tenantId: "tenant_1",
          status: InspectionStatus.scheduled,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-06-01T09:00:00.000Z"),
          site: { id: "site_1", name: "Pinecrest Tower" },
          customerCompany: { id: "customer_1", name: "Pinecrest Property Management" },
          assignedTechnician: { id: "tech_1", name: "Alex Turner" },
          technicianAssignments: [],
          closeoutRequest: null,
          convertedFromQuotes: [],
          tasks: [
            {
              id: "task_future_assigned",
              inspectionType: "fire_alarm",
              assignedTechnicianId: "tech_1",
              dueMonth: "2026-06",
              dueDate: new Date("2026-06-01T00:00:00.000Z"),
              schedulingStatus: "scheduled_now",
              status: InspectionStatus.to_be_completed,
              recurrence: null,
              report: null
            }
          ],
          attachments: [],
          documents: []
        }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_1", role: "technician", tenantId: "tenant_1" });

    expect(result.assigned).toHaveLength(1);
    expect(result.assigned[0]?.id).toBe("inspection_future_assigned");
    expect(result.thisMonth).toHaveLength(0);
    expect(result.today).toHaveLength(0);
  });

  it("removes same-period duplicate operational inspections when one visit is only a report-type subset", () => {
    const inspections = filterSubsetDuplicateOperationalInspections([
      {
        id: "inspection_kitchen_only",
        customerCompanyId: "customer_1",
        siteId: "site_1",
        scheduledStart: new Date("2026-05-01T09:00:00.000Z"),
        tasks: [
          { inspectionType: "kitchen_suppression", dueMonth: "2026-05" }
        ]
      },
      {
        id: "inspection_kitchen_and_extinguishers",
        customerCompanyId: "customer_1",
        siteId: "site_1",
        scheduledStart: new Date("2026-05-01T09:00:00.000Z"),
        tasks: [
          { inspectionType: "kitchen_suppression", dueMonth: "2026-05" },
          { inspectionType: "fire_extinguisher", dueMonth: "2026-05" }
        ]
      },
      {
        id: "inspection_other_site",
        customerCompanyId: "customer_1",
        siteId: "site_2",
        scheduledStart: new Date("2026-05-01T09:00:00.000Z"),
        tasks: [
          { inspectionType: "kitchen_suppression", dueMonth: "2026-05" }
        ]
      }
    ]);

    expect(inspections.map((inspection) => inspection.id)).toEqual([
      "inspection_kitchen_and_extinguishers",
      "inspection_other_site"
    ]);
  });

  it("allows admin fast inspection management to query the full due window without the default 40-row truncation", async () => {
    const dueWindowEnd = new Date("2026-07-18T23:59:59.999Z");
    prismaMock.inspection.findMany.mockResolvedValueOnce([]);

    await getAdminSchedulingQueueData(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      {
        statuses: [InspectionStatus.to_be_completed, InspectionStatus.scheduled],
        dueWindowEnd,
        limit: null
      }
    );

    expect(prismaMock.inspection.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: "tenant_1",
        status: { in: [InspectionStatus.to_be_completed, InspectionStatus.scheduled] },
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { scheduledStart: { lte: dueWindowEnd } },
              { tasks: { some: { dueDate: { lte: dueWindowEnd } } } },
              { tasks: { some: { dueMonth: { lte: "2026-07" } } } }
            ])
          })
        ])
      })
    }));
    expect(prismaMock.inspection.findMany.mock.calls[0]?.[0]).not.toHaveProperty("take");
  });

  it("calculates admin inspection KPI counts from the full matching queue instead of the capped display rows", async () => {
    const buildInspection = (index: number) => ({
      id: `inspection_${index}`,
      tenantId: "tenant_1",
      status: InspectionStatus.to_be_completed,
      inspectionClassification: "standard",
      isPriority: true,
      scheduledStart: new Date(`2026-05-${String((index % 28) + 1).padStart(2, "0")}T09:00:00.000Z`),
      assignedTechnicianId: null,
      site: {
        id: `site_${index}`,
        name: `Site ${index}`,
        addressLine1: "100 Main St",
        addressLine2: null,
        city: "Enid",
        state: "OK",
        postalCode: "73701"
      },
      customerCompany: {
        id: `customer_${index}`,
        name: `Customer ${index}`,
        serviceAddressLine1: null,
        serviceAddressLine2: null,
        serviceCity: null,
        serviceState: null,
        servicePostalCode: null,
        billingAddressLine1: null,
        billingAddressLine2: null,
        billingCity: null,
        billingState: null,
        billingPostalCode: null
      },
      assignedTechnician: null,
      technicianAssignments: [],
      convertedFromQuotes: [],
      tasks: [
        {
          id: `task_${index}`,
          inspectionType: "fire_extinguisher",
          assignedTechnicianId: null,
          schedulingStatus: "scheduled_now",
          status: InspectionStatus.to_be_completed,
          dueDate: null,
          dueMonth: "2026-05",
          recurrence: null,
          report: null,
          assignedTechnician: null
        }
      ]
    });
    const allRows = Array.from({ length: 41 }, (_, index) => buildInspection(index + 1));
    prismaMock.inspection.findMany
      .mockResolvedValueOnce(allRows.slice(0, 40))
      .mockResolvedValueOnce(allRows);

    const result = await getAdminSchedulingQueueData({
      userId: "admin_1",
      role: "office_admin",
      tenantId: "tenant_1"
    });

    expect(result.inspections).toHaveLength(40);
    expect(result.counts.open).toBe(41);
    expect(result.counts.priority).toBe(41);
    expect(result.counts.sharedQueue).toBe(41);
    expect(prismaMock.inspection.findMany.mock.calls[0]?.[0]).toHaveProperty("take", 40);
    expect(prismaMock.inspection.findMany.mock.calls[1]?.[0]).not.toHaveProperty("take");
  });

  it("hides stale active inspections when current report tasks are already finalized", async () => {
    const activeInspection = {
      id: "inspection_active",
      tenantId: "tenant_1",
      status: InspectionStatus.to_be_completed,
      inspectionClassification: "standard",
      isPriority: false,
      scheduledStart: new Date("2026-05-01T09:00:00.000Z"),
      assignedTechnicianId: null,
      site: {
        id: "site_1",
        name: "Active Site",
        addressLine1: "100 Main St",
        addressLine2: null,
        city: "Enid",
        state: "OK",
        postalCode: "73701"
      },
      customerCompany: {
        id: "customer_1",
        name: "Active Customer",
        serviceAddressLine1: null,
        serviceAddressLine2: null,
        serviceCity: null,
        serviceState: null,
        servicePostalCode: null,
        billingAddressLine1: null,
        billingAddressLine2: null,
        billingCity: null,
        billingState: null,
        billingPostalCode: null
      },
      assignedTechnician: null,
      technicianAssignments: [],
      convertedFromQuotes: [],
      tasks: [
        {
          id: "task_active",
          inspectionType: "fire_extinguisher",
          assignedTechnicianId: null,
          schedulingStatus: "scheduled_now",
          status: InspectionStatus.to_be_completed,
          dueDate: null,
          dueMonth: "2026-05",
          recurrence: null,
          report: null,
          assignedTechnician: null
        }
      ]
    };
    const staleCompletedInspection = {
      ...activeInspection,
      id: "inspection_stale_completed",
      customerCompany: { ...activeInspection.customerCompany, id: "customer_2", name: "Stale Completed Customer" },
      tasks: [
        {
          ...activeInspection.tasks[0],
          id: "task_stale_completed",
          status: InspectionStatus.completed,
          report: { status: "finalized", finalizedAt: new Date("2026-05-18T17:00:00.000Z") }
        }
      ]
    };

    prismaMock.inspection.findMany
      .mockResolvedValueOnce([activeInspection, staleCompletedInspection])
      .mockResolvedValueOnce([activeInspection, staleCompletedInspection]);

    const result = await getAdminSchedulingQueueData({
      userId: "admin_1",
      role: "office_admin",
      tenantId: "tenant_1"
    });

    expect(result.inspections.map((inspection) => inspection.id)).toEqual(["inspection_active"]);
    expect(result.counts.open).toBe(1);
    expect(result.counts.sharedQueue).toBe(1);
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
        OR: expect.arrayContaining([
          { scheduledStart: { lte: expect.any(Date) } },
          { tasks: { some: { dueDate: { lte: expect.any(Date) } } } },
          { tasks: { some: { dueMonth: { lte: "2026-06" } } } }
        ])
      })
    }));
    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0]?.id).toBe("inspection_shared");
  });

  it("hides stale finalized inspections from technician assigned and shared queues", async () => {
    const finalizedTask = {
      id: "task_finalized",
      tenantId: "tenant_1",
      inspectionId: "inspection_stale",
      inspectionType: "fire_extinguisher",
      customDisplayLabel: null,
      addedByUserId: null,
      assignedTechnicianId: null,
      dueMonth: "2026-05",
      dueDate: null,
      schedulingStatus: "scheduled_now",
      notes: null,
      status: InspectionStatus.completed,
      sortOrder: 0,
      createdAt: new Date("2026-05-01T09:00:00.000Z"),
      updatedAt: new Date("2026-05-18T17:00:00.000Z"),
      recurrence: null,
      report: { status: "finalized", finalizedAt: new Date("2026-05-18T17:00:00.000Z") },
      assignedTechnician: null
    };
    const staleAssigned = {
      id: "inspection_stale_assigned",
      tenantId: "tenant_1",
      status: InspectionStatus.to_be_completed,
      inspectionClassification: "standard",
      isPriority: false,
      scheduledStart: new Date("2026-05-01T09:00:00.000Z"),
      site: { id: "site_1", name: "Stale Assigned Site" },
      customerCompany: { id: "customer_1", name: "Stale Assigned Customer" },
      assignedTechnician: { id: "tech_1", name: "Alex Turner" },
      technicianAssignments: [],
      closeoutRequest: null,
      convertedFromQuotes: [],
      tasks: [{ ...finalizedTask, id: "task_stale_assigned", assignedTechnicianId: "tech_1" }],
      attachments: [],
      documents: []
    };
    const staleClaimable = {
      ...staleAssigned,
      id: "inspection_stale_claimable",
      assignedTechnician: null,
      tasks: [{ ...finalizedTask, id: "task_stale_claimable", assignedTechnicianId: null }]
    };

    prismaMock.inspection.findMany
      .mockResolvedValueOnce([staleAssigned])
      .mockResolvedValueOnce([staleClaimable])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_1", role: "technician", tenantId: "tenant_1" });

    expect(result.assigned).toEqual([]);
    expect(result.unassigned).toEqual([]);
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

  it("hides same-period claimable visits when their report types are a subset of a more complete visit", async () => {
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "inspection_kitchen_only",
          tenantId: "tenant_1",
          customerCompanyId: "customer_cafe_garcia",
          siteId: "site_cafe_garcia",
          status: InspectionStatus.scheduled,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-05-17T09:00:00.000Z"),
          site: { id: "site_cafe_garcia", name: "Cafe Garcia" },
          customerCompany: { id: "customer_cafe_garcia", name: "Cafe Garcia" },
          assignedTechnician: null,
          technicianAssignments: [],
          convertedFromQuotes: [],
          tasks: [
            {
              id: "task_kitchen_only",
              inspectionType: "kitchen_suppression",
              assignedTechnicianId: null,
              dueMonth: "2026-05",
              dueDate: new Date("2026-05-01T00:00:00.000Z"),
              schedulingStatus: "scheduled_now",
              status: InspectionStatus.to_be_completed,
              recurrence: null,
              report: null
            }
          ]
        },
        {
          id: "inspection_kitchen_and_extinguishers",
          tenantId: "tenant_1",
          customerCompanyId: "customer_cafe_garcia",
          siteId: "site_cafe_garcia",
          status: InspectionStatus.scheduled,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-05-17T09:00:00.000Z"),
          site: { id: "site_cafe_garcia", name: "Cafe Garcia" },
          customerCompany: { id: "customer_cafe_garcia", name: "Cafe Garcia" },
          assignedTechnician: null,
          technicianAssignments: [],
          convertedFromQuotes: [],
          tasks: [
            {
              id: "task_kitchen_combined",
              inspectionType: "kitchen_suppression",
              assignedTechnicianId: null,
              dueMonth: "2026-05",
              dueDate: new Date("2026-05-01T00:00:00.000Z"),
              schedulingStatus: "scheduled_now",
              status: InspectionStatus.to_be_completed,
              recurrence: null,
              report: null
            },
            {
              id: "task_extinguisher_combined",
              inspectionType: "fire_extinguisher",
              assignedTechnicianId: null,
              dueMonth: "2026-05",
              dueDate: new Date("2026-05-01T00:00:00.000Z"),
              schedulingStatus: "scheduled_now",
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
    expect(result.unassigned[0]?.id).toBe("inspection_kitchen_and_extinguishers");
    expect(result.unassigned[0]?.tasks.map((task: any) => task.inspectionType)).toEqual([
      "kitchen_suppression",
      "fire_extinguisher"
    ]);
  });

  it("keeps separate same-period claimable visits when neither report task set is a subset", async () => {
    prismaMock.inspection.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "inspection_kitchen",
          tenantId: "tenant_1",
          customerCompanyId: "customer_1",
          siteId: "site_1",
          status: InspectionStatus.scheduled,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-05-17T09:00:00.000Z"),
          site: { id: "site_1", name: "Restaurant" },
          customerCompany: { id: "customer_1", name: "Restaurant" },
          assignedTechnician: null,
          technicianAssignments: [],
          convertedFromQuotes: [],
          tasks: [
            {
              id: "task_kitchen",
              inspectionType: "kitchen_suppression",
              assignedTechnicianId: null,
              dueMonth: "2026-05",
              dueDate: new Date("2026-05-01T00:00:00.000Z"),
              schedulingStatus: "scheduled_now",
              status: InspectionStatus.to_be_completed,
              recurrence: null,
              report: null
            }
          ]
        },
        {
          id: "inspection_alarm",
          tenantId: "tenant_1",
          customerCompanyId: "customer_1",
          siteId: "site_1",
          status: InspectionStatus.scheduled,
          inspectionClassification: "standard",
          isPriority: false,
          scheduledStart: new Date("2026-05-17T09:00:00.000Z"),
          site: { id: "site_1", name: "Restaurant" },
          customerCompany: { id: "customer_1", name: "Restaurant" },
          assignedTechnician: null,
          technicianAssignments: [],
          convertedFromQuotes: [],
          tasks: [
            {
              id: "task_alarm",
              inspectionType: "fire_alarm",
              assignedTechnicianId: null,
              dueMonth: "2026-05",
              dueDate: new Date("2026-05-01T00:00:00.000Z"),
              schedulingStatus: "scheduled_now",
              status: InspectionStatus.to_be_completed,
              recurrence: null,
              report: null
            }
          ]
        }
      ])
      .mockResolvedValueOnce([]);

    const result = await getTechnicianDashboardData({ userId: "tech_2", role: "technician", tenantId: "tenant_1" });

    expect(result.unassigned.map((inspection: any) => inspection.id)).toEqual([
      "inspection_kitchen",
      "inspection_alarm"
    ]);
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

  it("shows following-month claimable inspections in the mobile shared queue", async () => {
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
