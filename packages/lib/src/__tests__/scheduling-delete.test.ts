import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteStoredFileMock,
  inspectionFindFirstMock,
  inspectionFindManyMock,
  auditLogCreateMock,
  transactionMock
} = vi.hoisted(() => ({
  deleteStoredFileMock: vi.fn(),
  inspectionFindFirstMock: vi.fn(),
  inspectionFindManyMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  transactionMock: {
    reportCorrectionEvent: { deleteMany: vi.fn() },
    attachment: { deleteMany: vi.fn() },
    signature: { deleteMany: vi.fn() },
    deficiency: { deleteMany: vi.fn() },
    inspectionDocument: { deleteMany: vi.fn() },
    inspectionReport: { deleteMany: vi.fn() },
    inspectionRecurrence: { deleteMany: vi.fn() },
    inspectionTask: { deleteMany: vi.fn() },
    inspectionTechnicianAssignment: { deleteMany: vi.fn() },
    inspectionBillingSummary: { deleteMany: vi.fn() },
    serviceSchedule: { updateMany: vi.fn() },
    inspection: { delete: vi.fn() },
    auditLog: { create: vi.fn() }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: {
    inspection: {
      findFirst: inspectionFindFirstMock,
      findMany: inspectionFindManyMock
    },
    auditLog: {
      create: auditLogCreateMock
    },
    $transaction: vi.fn(async (callback: (tx: typeof transactionMock) => unknown) => callback(transactionMock))
  }
}));

vi.mock("../storage", () => ({
  deleteStoredFile: deleteStoredFileMock
}));

import { deleteInspection } from "../scheduling";

describe("inspection deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectionFindManyMock.mockResolvedValue([]);
  });

  it("blocks deletion for inspections with amendment history and audits the attempt", async () => {
    inspectionFindFirstMock.mockResolvedValue({
      id: "inspection_1",
      customerCompany: { name: "NW Fire" },
      site: { name: "General / No Fixed Site" },
      amendments: [{ id: "amendment_1" }],
      replacementAmendments: [],
      billingSummary: null,
      tasks: [],
      attachments: [],
      reports: [],
      documents: []
    });

    await expect(
      deleteInspection(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        "inspection_1"
      )
    ).rejects.toThrow(/linked to amendment history/i);

    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "inspection.delete_blocked",
        entityId: "inspection_1"
      })
    });
  });

  it("deletes owned records and stored files for a safe inspection", async () => {
    inspectionFindFirstMock.mockResolvedValue({
      id: "inspection_1",
      customerCompany: { name: "NW Fire" },
      site: { name: "General / No Fixed Site" },
      amendments: [],
      replacementAmendments: [],
      billingSummary: { id: "summary_1", status: "reviewed", quickbooksInvoiceId: null, quickbooksSyncStatus: "failed" },
      tasks: [],
      attachments: [{ id: "attachment_1", storageKey: "blob:tenant_1/uploaded-pdf/inspection.pdf" }],
      reports: [
        {
          id: "report_1",
          attachments: [{ id: "attachment_2", storageKey: "blob:tenant_1/photo/photo.png" }],
          signatures: [{ id: "signature_1", imageDataUrl: "blob:tenant_1/signature/signature.png" }],
          deficiencies: [{ id: "deficiency_1", photoStorageKey: "blob:tenant_1/photo/deficiency.png" }]
        }
      ],
      documents: [
        {
          id: "document_1",
          originalStorageKey: "blob:tenant_1/inspection-document-original/original.pdf",
          signedStorageKey: "blob:tenant_1/inspection-document-signed/signed.pdf"
        }
      ]
    });

    await deleteInspection(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(transactionMock.inspection.delete).toHaveBeenCalledWith({
      where: { id: "inspection_1" }
    });
    expect(deleteStoredFileMock).toHaveBeenCalledTimes(6);
    expect(transactionMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "inspection.deleted",
        entityId: "inspection_1"
      })
    });
  });

  it("blocks deletion for invoiced or QuickBooks-linked billing history", async () => {
    inspectionFindFirstMock.mockResolvedValue({
      id: "inspection_1",
      customerCompany: { name: "NW Fire" },
      site: { name: "Main Campus" },
      amendments: [],
      replacementAmendments: [],
      billingSummary: { id: "summary_1", status: "invoiced", quickbooksInvoiceId: "123", quickbooksSyncStatus: "synced" },
      tasks: [],
      attachments: [],
      reports: [],
      documents: []
    });

    await expect(
      deleteInspection(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        "inspection_1"
      )
    ).rejects.toThrow(/invoicing or QuickBooks history/i);

    expect(transactionMock.inspection.delete).not.toHaveBeenCalled();
  });

  it("deletes the selected recurring inspection and future occurrences while preserving past visits", async () => {
    inspectionFindFirstMock.mockResolvedValue({
      id: "inspection_current",
      scheduledStart: new Date("2026-09-01T14:00:00.000Z"),
      customerCompany: { name: "Recurring Customer" },
      site: { name: "Main Campus" },
      amendments: [],
      replacementAmendments: [],
      billingSummary: null,
      tasks: [
        {
          id: "task_current",
          serviceScheduleId: "schedule_1",
          recurrence: { frequency: "ANNUAL", seriesId: "series_1" }
        }
      ],
      attachments: [],
      reports: [],
      documents: []
    });
    inspectionFindManyMock.mockResolvedValue([
      {
        id: "inspection_future",
        scheduledStart: new Date("2027-09-01T14:00:00.000Z"),
        customerCompany: { name: "Recurring Customer" },
        site: { name: "Main Campus" },
        amendments: [],
        replacementAmendments: [],
        billingSummary: null,
        tasks: [
          {
            id: "task_future",
            serviceScheduleId: "schedule_1",
            recurrence: { frequency: "ANNUAL", seriesId: "series_1" }
          }
        ],
        attachments: [],
        reports: [],
        documents: []
      }
    ]);

    await deleteInspection(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_current",
      "future"
    );

    expect(inspectionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant_1",
          id: { not: "inspection_current" },
          scheduledStart: { gte: new Date("2026-09-01T14:00:00.000Z") }
        })
      })
    );
    expect(transactionMock.serviceSchedule.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1", id: { in: ["schedule_1"] } },
      data: { isActive: false }
    });
    expect(transactionMock.inspection.delete).toHaveBeenNthCalledWith(1, {
      where: { id: "inspection_current" }
    });
    expect(transactionMock.inspection.delete).toHaveBeenNthCalledWith(2, {
      where: { id: "inspection_future" }
    });
    expect(transactionMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "inspection.series_deleted",
        metadata: expect.objectContaining({
          scope: "future",
          deletedInspectionCount: 2,
          deactivatedServiceScheduleCount: 1
        })
      })
    });
  });

  it("keeps recurring schedules active when only one inspection is deleted", async () => {
    inspectionFindFirstMock.mockResolvedValue({
      id: "inspection_current",
      scheduledStart: new Date("2026-09-01T14:00:00.000Z"),
      customerCompany: { name: "Recurring Customer" },
      site: { name: "Main Campus" },
      amendments: [],
      replacementAmendments: [],
      billingSummary: null,
      tasks: [
        {
          id: "task_current",
          serviceScheduleId: "schedule_1",
          recurrence: { frequency: "ANNUAL", seriesId: "series_1" }
        }
      ],
      attachments: [],
      reports: [],
      documents: []
    });

    await deleteInspection(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      "inspection_current",
      "single"
    );

    expect(inspectionFindManyMock).not.toHaveBeenCalled();
    expect(transactionMock.serviceSchedule.updateMany).not.toHaveBeenCalled();
    expect(transactionMock.inspection.delete).toHaveBeenCalledTimes(1);
  });
});
