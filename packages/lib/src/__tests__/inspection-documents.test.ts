import { beforeEach, describe, expect, it, vi } from "vitest";
import { InspectionDocumentStatus, InspectionStatus } from "@prisma/client";

const prismaMock = {
  user: {
    findFirst: vi.fn()
  },
  inspection: {
    findFirst: vi.fn()
  },
  inspectionDocument: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn()
  },
  auditLog: {
    create: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../billing", () => ({
  assertTenantEntitlementForTenant: vi.fn(async () => undefined)
}));

vi.mock("../report-service", () => ({
  canActorAccessAttachmentDownload: vi.fn(() => true)
}));

vi.mock("../scheduling", () => ({
  getInspectionAssignedTechnicianIds: vi.fn(({ assignedTechnicianId, technicianAssignments }) => {
    const ids = new Set<string>();
    if (assignedTechnicianId) {
      ids.add(assignedTechnicianId);
    }
    for (const assignment of technicianAssignments ?? []) {
      if (assignment.technicianId) {
        ids.add(assignment.technicianId);
      }
    }
    return [...ids];
  }),
  isTechnicianAssignedToInspection: vi.fn(({ userId, assignedTechnicianId, technicianAssignments }) => {
    if (assignedTechnicianId === userId) {
      return true;
    }
    return (technicianAssignments ?? []).some((assignment: { technicianId: string }) => assignment.technicianId === userId);
  })
}));

vi.mock("../storage", async () => {
  const actual = await vi.importActual<typeof import("../storage")>("../storage");
  return {
    ...actual,
    buildStoredFilePayload: vi.fn(),
    buildFileDownloadResponse: vi.fn(async ({ storageKey, fileName, fallbackMimeType }) => ({
      storageKey,
      fileName,
      mimeType: fallbackMimeType,
      bytes: new Uint8Array([1, 2, 3])
    })),
    decodeStoredFile: vi.fn(),
    deleteStoredFile: vi.fn(async () => undefined)
  };
});

function minimalPdfBytes() {
  return new Uint8Array(
    Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 35 >>
stream
BT /F1 12 Tf 36 100 Td (Test PDF) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer
<< /Root 1 0 R /Size 5 >>
startxref
288
%%EOF`)
  );
}

function tinyPngBytes() {
  return new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=", "base64"));
}

describe("inspection external documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findFirst.mockReset();
    prismaMock.inspection.findFirst.mockReset();
    prismaMock.inspectionDocument.create.mockReset();
    prismaMock.inspectionDocument.findFirst.mockReset();
    prismaMock.inspectionDocument.findMany.mockReset();
    prismaMock.inspectionDocument.update.mockReset();
    prismaMock.auditLog.create.mockReset();
  });

  it("uploads external PDFs with signature-ready status when required", async () => {
    const { buildStoredFilePayload } = await import("../storage");
    vi.mocked(buildStoredFilePayload).mockResolvedValue({
      fileName: "customer-form.pdf",
      mimeType: "application/pdf",
      storageKey: "blob:tenant_1/inspection-document-original/customer-form.pdf",
      sizeBytes: 2048
    });

    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      assignedTechnicianId: "tech_1",
      status: InspectionStatus.in_progress,
      technicianAssignments: [{ technicianId: "tech_1" }]
    });
    prismaMock.inspectionDocument.create.mockResolvedValue({ id: "doc_1" });

    const { uploadInspectionDocument } = await import("../inspection-documents");
    await uploadInspectionDocument(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        inspectionId: "inspection_1",
        fileName: "customer-form.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([1, 2, 3]),
        label: "Customer form",
        requiresSignature: true,
        customerVisible: true
      }
    );

    expect(prismaMock.inspectionDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inspectionId: "inspection_1",
          label: "Customer form",
          requiresSignature: true,
          customerVisible: true,
          status: InspectionDocumentStatus.READY_FOR_SIGNATURE,
          originalStorageKey: "blob:tenant_1/inspection-document-original/customer-form.pdf"
        })
      })
    );
  });

  it("creates a separate signed PDF and updates status when signed", async () => {
    const { buildStoredFilePayload, decodeStoredFile, deleteStoredFile } = await import("../storage");
    vi.mocked(decodeStoredFile)
      .mockResolvedValueOnce({ mimeType: "application/pdf", bytes: minimalPdfBytes() })
      .mockResolvedValueOnce({ mimeType: "image/png", bytes: tinyPngBytes() });
    vi.mocked(buildStoredFilePayload).mockResolvedValue({
      fileName: "customer-form-signed.pdf",
      mimeType: "application/pdf",
      storageKey: "blob:tenant_1/inspection-document-signed/customer-form-signed.pdf",
      sizeBytes: 4096
    });

    prismaMock.inspectionDocument.findFirst.mockResolvedValue({
      id: "doc_1",
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      fileName: "customer-form.pdf",
      label: "Customer form",
      requiresSignature: true,
      status: InspectionDocumentStatus.READY_FOR_SIGNATURE,
      originalStorageKey: "blob:tenant_1/inspection-document-original/customer-form.pdf",
      signedStorageKey: "blob:tenant_1/inspection-document-signed/old.pdf",
      inspection: {
        id: "inspection_1",
        tenantId: "tenant_1",
        customerCompanyId: "customer_1",
        assignedTechnicianId: "tech_1",
        status: InspectionStatus.in_progress,
        technicianAssignments: [{ technicianId: "tech_1" }]
      }
    });
    prismaMock.inspectionDocument.update.mockResolvedValue({ id: "doc_1", status: InspectionDocumentStatus.SIGNED });

    const { signInspectionDocument } = await import("../inspection-documents");
    await signInspectionDocument(
      { userId: "tech_1", role: "technician", tenantId: "tenant_1" },
      {
        documentId: "doc_1",
        signerName: "Alex Turner",
        signatureDataUrl: "data:image/png;base64,abc"
      }
    );

    expect(prismaMock.inspectionDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: InspectionDocumentStatus.SIGNED,
          signedStorageKey: "blob:tenant_1/inspection-document-signed/customer-form-signed.pdf",
          signedByUserId: "tech_1"
        })
      })
    );
    expect(deleteStoredFile).toHaveBeenCalledWith("blob:tenant_1/inspection-document-signed/old.pdf");
  });

  it("only exposes signed customer-visible documents to customer users when signature is required", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ customerCompanyId: "customer_1" });
    prismaMock.inspection.findFirst.mockResolvedValue({
      id: "inspection_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      assignedTechnicianId: "tech_1",
      status: InspectionStatus.in_progress,
      technicianAssignments: [{ technicianId: "tech_1" }]
    });
    prismaMock.inspectionDocument.findMany.mockResolvedValue([
      {
        id: "doc_ready",
        tenantId: "tenant_1",
        customerVisible: true,
        requiresSignature: true,
        status: InspectionDocumentStatus.READY_FOR_SIGNATURE,
        signedStorageKey: null
      },
      {
        id: "doc_signed",
        tenantId: "tenant_1",
        customerVisible: true,
        requiresSignature: true,
        status: InspectionDocumentStatus.SIGNED,
        signedStorageKey: "blob:tenant_1/inspection-document-signed/signed.pdf"
      },
      {
        id: "doc_reference",
        tenantId: "tenant_1",
        customerVisible: true,
        requiresSignature: false,
        status: InspectionDocumentStatus.UPLOADED,
        signedStorageKey: null
      }
    ]);

    const { getInspectionDocuments } = await import("../inspection-documents");
    const documents = await getInspectionDocuments(
      { userId: "customer_user_1", role: "customer_user", tenantId: "tenant_1" },
      "inspection_1"
    );

    expect(documents.map((document) => document.id)).toEqual(["doc_signed", "doc_reference"]);
  });

  it("blocks customers from downloading the original unsigned-required PDF variant", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ customerCompanyId: "customer_1" });
    prismaMock.inspectionDocument.findFirst.mockResolvedValue({
      id: "doc_1",
      tenantId: "tenant_1",
      inspectionId: "inspection_1",
      fileName: "customer-form.pdf",
      mimeType: "application/pdf",
      customerVisible: true,
      requiresSignature: true,
      status: InspectionDocumentStatus.SIGNED,
      originalStorageKey: "blob:tenant_1/inspection-document-original/customer-form.pdf",
      signedStorageKey: "blob:tenant_1/inspection-document-signed/customer-form-signed.pdf",
      inspection: {
        id: "inspection_1",
        tenantId: "tenant_1",
        customerCompanyId: "customer_1",
        assignedTechnicianId: "tech_1",
        status: InspectionStatus.completed,
        technicianAssignments: [{ technicianId: "tech_1" }]
      }
    });

    const { getAuthorizedInspectionDocumentDownload } = await import("../inspection-documents");

    await expect(
      getAuthorizedInspectionDocumentDownload(
        { userId: "customer_user_1", role: "customer_user", tenantId: "tenant_1" },
        { documentId: "doc_1", variant: "original" }
      )
    ).rejects.toThrow(/not available in the customer portal/i);
  });
});
