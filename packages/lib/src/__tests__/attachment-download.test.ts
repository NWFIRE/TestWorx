import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildFileDownloadResponseMock, buildStoredFilePayloadMock, deleteStoredFileMock } = vi.hoisted(() => ({
  buildFileDownloadResponseMock: vi.fn(),
  buildStoredFilePayloadMock: vi.fn(),
  deleteStoredFileMock: vi.fn()
}));

const prismaMock = {
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)),
  user: {
    findFirst: vi.fn()
  },
  attachment: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn()
  },
  inspectionReport: {
    findFirst: vi.fn()
  },
  inspection: {
    findFirst: vi.fn()
  },
  auditLog: {
    create: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../storage", async () => {
  const actual = await vi.importActual<typeof import("../storage")>("../storage");
  return {
    ...actual,
    buildFileDownloadResponse: buildFileDownloadResponseMock,
    buildStoredFilePayload: buildStoredFilePayloadMock,
    deleteStoredFile: deleteStoredFileMock
  };
});

vi.mock("../pdf-report", () => ({
  generateInspectionReportPdf: vi.fn(async () => new Uint8Array([9, 9, 9]))
}));

describe("attachment download authorization", () => {
  it("refreshes old numbered PDFs once, without touching uploaded PDFs or drafts", async () => {
    const { shouldRefreshGeneratedPdfForCurrentRenderer: needsRefresh } = await import("../report-service");
    const attachment = { kind: "pdf" as const, source: "generated", inspectionReportId: "report_1", createdAt: new Date("2020-01-01"), fileName: "old-report.pdf" };
    const report = { id: "report_1", reportNumber: 1234, status: "finalized" as const, finalizedAt: new Date("2026-01-01"), task: { inspectionType: "fire_extinguisher" as const } };
    expect(needsRefresh({ attachment, report })).toBe(true);
    expect(needsRefresh({ attachment: { ...attachment, fileName: "customer-report-R-001234.pdf" }, report })).toBe(false);
    expect(needsRefresh({ attachment: { ...attachment, source: "uploaded" }, report })).toBe(false);
    expect(needsRefresh({ attachment, report: { ...report, status: "draft" } })).toBe(false);
    expect(needsRefresh({ attachment, report: { ...report, task: { inspectionType: "fire_alarm" } } })).toBe(true);
  }, 15000);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    buildFileDownloadResponseMock.mockResolvedValue({
      storageKey: "blob:tenant_1/generated-pdf/report.pdf",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3])
    });
    buildStoredFilePayloadMock.mockResolvedValue({
      fileName: "rebuilt-report.pdf",
      mimeType: "application/pdf",
      storageKey: "blob:tenant_1/generated-pdf/rebuilt-report.pdf",
      sizeBytes: 3
    });
  });

  it("blocks raw report media paths that are not photo or signature storage", async () => {
    prismaMock.inspectionReport.findFirst.mockResolvedValue({
      id: "report_1",
      tenantId: "tenant_1",
      status: "draft",
      contentJson: {
        templateVersion: 1,
        inspectionType: "fire_extinguisher",
        overallNotes: "",
        sectionOrder: [],
        activeSectionId: null,
        sections: {},
        deficiencies: [],
        attachments: [],
        signatures: {
          technician: {
            signerName: "Alex",
            imageDataUrl: "blob:tenant_1/generated-pdf/not-allowed.pdf",
            signedAt: "2026-03-13T12:00:00.000Z"
          }
        },
        context: {
          siteName: "",
          customerName: "",
          scheduledDate: "",
          assetCount: 0,
          priorReportSummary: ""
        }
      },
      inspection: {
        id: "inspection_1",
        tenantId: "tenant_1",
        customerCompanyId: "customer_1",
        assignedTechnicianId: "tech_1"
      }
    });

    const { getAuthorizedReportMediaDownload } = await import("../report-service");

    await expect(
      getAuthorizedReportMediaDownload(
        { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
        { inspectionReportId: "report_1", storageKey: "blob:tenant_1/generated-pdf/not-allowed.pdf" }
      )
    ).rejects.toThrow(/category is not valid/i);
  }, 15000);

  it("regenerates a finalized generated PDF when the stored blob cannot be fetched", async () => {
    const { StoredFileReadError } = await import("../storage");
    buildFileDownloadResponseMock.mockRejectedValueOnce(new StoredFileReadError("blob:tenant_1/generated-pdf/report.pdf"));
    prismaMock.attachment.findFirst.mockResolvedValue({
      id: "attachment_report",
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      inspectionReportId: "report_1",
      kind: "pdf",
      source: "generated",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      storageKey: "blob:tenant_1/generated-pdf/report.pdf",
      customerVisible: true,
      createdAt: new Date("2026-07-07T12:00:00.000Z")
    });
    prismaMock.inspectionReport.findFirst
      .mockResolvedValueOnce({
        id: "report_1",
        tenantId: "tenant_1",
        status: "finalized",
        finalizedAt: new Date("2026-05-26T12:00:00.000Z"),
        inspectionId: "inspection_1",
        inspectionTaskId: "task_1",
        inspection: {
          id: "inspection_1",
          tenantId: "tenant_1",
          customerCompanyId: "customer_1",
          assignedTechnicianId: "tech_1",
          technicianAssignments: []
        },
        task: {
          inspectionType: "fire_extinguisher"
        }
      })
      .mockResolvedValueOnce({
        id: "report_1",
        tenantId: "tenant_1",
        status: "finalized",
        finalizedAt: new Date("2026-05-26T12:00:00.000Z"),
        contentJson: {
          templateVersion: 1,
          inspectionType: "fire_extinguisher",
          overallNotes: "",
          sectionOrder: [],
          activeSectionId: null,
          sections: {},
          deficiencies: [],
          attachments: [],
          signatures: {},
          context: {
            siteName: "",
            customerName: "",
            scheduledDate: "",
            assetCount: 0,
            priorReportSummary: ""
          }
        },
        inspectionId: "inspection_1",
        inspectionTaskId: "task_1",
        tenant: {
          name: "NW Fire",
          branding: {}
        },
        inspection: {
          id: "inspection_1",
          tenantId: "tenant_1",
          customerCompanyId: "customer_1",
          assignedTechnicianId: "tech_1",
          site: {
            name: "Main Site",
            addressLine1: "100 Main",
            addressLine2: null,
            city: "Enid",
            state: "OK",
            postalCode: "73701"
          },
          customerCompany: {
            name: "Customer",
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
          }
        },
        task: {
          inspectionType: "fire_extinguisher"
        },
        technician: {
          name: "Alex"
        },
        attachments: [
          {
            id: "attachment_report",
            kind: "pdf",
            source: "generated",
            storageKey: "blob:tenant_1/generated-pdf/report.pdf"
          }
        ],
        signatures: [],
        deficiencies: []
      });
    prismaMock.attachment.create.mockResolvedValue({
      id: "attachment_rebuilt",
      fileName: "rebuilt-report.pdf",
      mimeType: "application/pdf",
      storageKey: "blob:tenant_1/generated-pdf/rebuilt-report.pdf"
    });

    const { getAuthorizedAttachmentDownload } = await import("../report-service");

    const result = await getAuthorizedAttachmentDownload(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      "attachment_report"
    );

    expect(result).toEqual({
      fileName: "rebuilt-report.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([9, 9, 9])
    });
    expect(prismaMock.attachment.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant_1",
        inspectionReportId: "report_1",
        kind: "pdf",
        source: "generated"
      },
      data: expect.objectContaining({ inspectionReportId: "report_1", fileName: "rebuilt-report.pdf" })
    });
    expect(prismaMock.attachment.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.attachment.create).not.toHaveBeenCalled();
    expect(deleteStoredFileMock).toHaveBeenCalledWith("blob:tenant_1/generated-pdf/report.pdf");
  }, 15000);

  it("regenerates legacy finalized fire extinguisher PDFs through the current renderer before download", async () => {
    prismaMock.attachment.findFirst.mockResolvedValue({
      id: "attachment_report",
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      inspectionReportId: "report_1",
      kind: "pdf",
      source: "generated",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      storageKey: "blob:tenant_1/generated-pdf/report.pdf",
      customerVisible: true,
      createdAt: new Date("2026-07-06T19:00:00.000Z")
    });
    prismaMock.inspectionReport.findFirst
      .mockResolvedValueOnce({
        id: "report_1",
        tenantId: "tenant_1",
        status: "finalized",
        finalizedAt: new Date("2026-05-26T12:00:00.000Z"),
        inspectionId: "inspection_1",
        inspectionTaskId: "task_1",
        inspection: {
          id: "inspection_1",
          tenantId: "tenant_1",
          customerCompanyId: "customer_1",
          assignedTechnicianId: "tech_1",
          technicianAssignments: []
        },
        task: {
          inspectionType: "fire_extinguisher"
        }
      })
      .mockResolvedValueOnce({
        id: "report_1",
        tenantId: "tenant_1",
        status: "finalized",
        finalizedAt: new Date("2026-05-26T12:00:00.000Z"),
        contentJson: {
          templateVersion: 1,
          inspectionType: "fire_extinguisher",
          overallNotes: "",
          sectionOrder: ["inventory"],
          activeSectionId: "inventory",
          sections: {
            inventory: {
              status: "pass",
              notes: "",
              fields: {
                extinguishers: [
                  {
                    location: "Lobby",
                    extinguisherType: "5 lb ABC",
                    gaugeStatus: "pass",
                    mountingSecure: "pass"
                  }
                ]
              }
            }
          },
          deficiencies: [],
          attachments: [],
          signatures: {},
          context: {
            siteName: "",
            customerName: "",
            scheduledDate: "",
            assetCount: 0,
            priorReportSummary: ""
          }
        },
        inspectionId: "inspection_1",
        inspectionTaskId: "task_1",
        tenant: {
          name: "NW Fire",
          branding: {}
        },
        inspection: {
          id: "inspection_1",
          tenantId: "tenant_1",
          customerCompanyId: "customer_1",
          assignedTechnicianId: "tech_1",
          site: {
            name: "Main Site",
            addressLine1: "100 Main",
            addressLine2: null,
            city: "Enid",
            state: "OK",
            postalCode: "73701"
          },
          customerCompany: {
            name: "Customer",
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
          }
        },
        task: {
          inspectionType: "fire_extinguisher"
        },
        technician: {
          name: "Alex"
        },
        attachments: [
          {
            id: "attachment_report",
            kind: "pdf",
            source: "generated",
            storageKey: "blob:tenant_1/generated-pdf/report.pdf"
          }
        ],
        signatures: [],
        deficiencies: []
      });
    prismaMock.attachment.create.mockResolvedValue({
      id: "attachment_rebuilt",
      fileName: "rebuilt-report.pdf",
      mimeType: "application/pdf",
      storageKey: "blob:tenant_1/generated-pdf/rebuilt-report.pdf"
    });

    const { getAuthorizedAttachmentDownload } = await import("../report-service");

    const result = await getAuthorizedAttachmentDownload(
      { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" },
      "attachment_report"
    );

    expect(result).toEqual({
      fileName: "rebuilt-report.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([9, 9, 9])
    });
    expect(buildFileDownloadResponseMock).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "report.pdf_regenerated_for_current_renderer",
        entityId: "report_1"
      })
    });
  }, 15000);
});
