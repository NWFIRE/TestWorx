import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: {
    findFirst: vi.fn()
  },
  attachment: {
    findFirst: vi.fn()
  },
  inspectionReport: {
    findFirst: vi.fn()
  },
  inspection: {
    findFirst: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../storage", async () => {
  const actual = await vi.importActual<typeof import("../storage")>("../storage");
  return {
    ...actual,
    buildFileDownloadResponse: vi.fn(async ({ storageKey, fileName, fallbackMimeType }) => ({
      storageKey,
      fileName,
      mimeType: fallbackMimeType,
      bytes: new Uint8Array([1, 2, 3])
    }))
  };
});

describe("attachment download authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
});
