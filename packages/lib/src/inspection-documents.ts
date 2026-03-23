import { InspectionDocumentStatus, InspectionDocumentType, InspectionStatus } from "@prisma/client";
import { prisma } from "@testworx/db";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantEntitlementForTenant } from "./billing";
import { assertTenantContext } from "./permissions";
import { canActorAccessAttachmentDownload } from "./report-service";
import { getInspectionAssignedTechnicianIds, isTechnicianAssignedToInspection } from "./scheduling";
import {
  assertStorageKeyBelongsToTenant,
  assertStorageKeyCategory,
  buildFileDownloadResponse,
  buildStoredFilePayload,
  decodeStoredFile,
  deleteStoredFile
} from "./storage";

const MAX_INSPECTION_DOCUMENT_BYTES = 12 * 1024 * 1024;

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function slugifyFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "inspection-document";
}

function readTechnicianAssignments(value: unknown): Array<{ technicianId: string }> {
  const assignments = (value as { technicianAssignments?: Array<{ technicianId: string }> } | null | undefined)?.technicianAssignments;
  return Array.isArray(assignments) ? assignments : [];
}

async function getAuthorizedCustomerCompanyId(parsedActor: ReturnType<typeof parseActor>) {
  if (parsedActor.role !== "customer_user") {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: { id: parsedActor.userId, tenantId: parsedActor.tenantId as string },
    select: { customerCompanyId: true }
  });

  if (!user?.customerCompanyId) {
    throw new Error("Customer user is not linked to a customer company.");
  }

  return user.customerCompanyId;
}

function canCustomerAccessInspectionDocument(input: {
  actorTenantId: string | null;
  actorCustomerCompanyId: string | null;
  documentTenantId: string;
  inspectionCustomerCompanyId: string;
  customerVisible: boolean;
  requiresSignature: boolean;
  status: InspectionDocumentStatus;
  signedStorageKey: string | null;
}) {
  if (!input.actorTenantId || input.actorTenantId !== input.documentTenantId) {
    return false;
  }

  if (!input.customerVisible || !input.actorCustomerCompanyId || input.actorCustomerCompanyId !== input.inspectionCustomerCompanyId) {
    return false;
  }

  if (!input.requiresSignature) {
    return true;
  }

  return Boolean(
    input.signedStorageKey &&
      (input.status === InspectionDocumentStatus.SIGNED || input.status === InspectionDocumentStatus.EXPORTED)
  );
}

async function createInspectionDocumentAuditLog(input: {
  tenantId: string;
  actorUserId: string;
  action: string;
  documentId: string;
  inspectionId: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: "InspectionDocument",
      entityId: input.documentId,
      metadata: {
        inspectionId: input.inspectionId,
        ...input.metadata
      }
    }
  });
}

async function getDocumentWithInspection(documentId: string, tenantId: string) {
  return prisma.inspectionDocument.findFirst({
    where: { id: documentId, tenantId },
    include: {
      inspection: {
        include: {
          site: true,
          customerCompany: true,
          technicianAssignments: { select: { technicianId: true } }
        }
      }
    }
  });
}

function buildSignedFileName(fileName: string) {
  const base = fileName.toLowerCase().endsWith(".pdf") ? fileName.slice(0, -4) : fileName;
  return `${slugifyFileName(base)}-signed.pdf`;
}

async function buildSignedInspectionDocumentPdf(input: {
  originalBytes: Uint8Array;
  signatureBytes: Uint8Array;
  signerName: string;
  signedAt: Date;
  label: string;
}) {
  const pdf = await PDFDocument.load(input.originalBytes);
  const signatureImage = await pdf.embedPng(input.signatureBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);

  page.drawText("Signed External Inspection Document", {
    x: 48,
    y: 736,
    size: 20,
    font: bold,
    color: rgb(0.06, 0.1, 0.16)
  });
  page.drawText(`Document: ${input.label}`, {
    x: 48,
    y: 700,
    size: 12,
    font: regular,
    color: rgb(0.2, 0.27, 0.37)
  });
  page.drawText(`Signed by technician: ${input.signerName}`, {
    x: 48,
    y: 676,
    size: 12,
    font: regular,
    color: rgb(0.2, 0.27, 0.37)
  });
  page.drawText(`Signed at: ${input.signedAt.toISOString()}`, {
    x: 48,
    y: 652,
    size: 12,
    font: regular,
    color: rgb(0.2, 0.27, 0.37)
  });
  page.drawText("The original uploaded PDF remains preserved separately in TradeWorx.", {
    x: 48,
    y: 616,
    size: 11,
    font: regular,
    color: rgb(0.2, 0.27, 0.37)
  });

  const scaled = signatureImage.scaleToFit(280, 120);
  page.drawRectangle({
    x: 48,
    y: 430,
    width: 320,
    height: 150,
    borderWidth: 1,
    borderColor: rgb(0.8, 0.84, 0.9),
    color: rgb(0.98, 0.99, 1)
  });
  page.drawText("Captured signature", {
    x: 48,
    y: 592,
    size: 11,
    font: bold,
    color: rgb(0.06, 0.1, 0.16)
  });
  page.drawImage(signatureImage, {
    x: 68,
    y: 455,
    width: scaled.width,
    height: scaled.height
  });

  return pdf.save();
}

async function assertInspectionDocumentAccess(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, tenantId: parsedActor.tenantId as string },
    include: { technicianAssignments: { select: { technicianId: true } } }
  });

  if (!inspection) {
    throw new Error("Inspection not found.");
  }

  if (["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    return { parsedActor, inspection };
  }

  if (
    parsedActor.role === "technician" &&
    isTechnicianAssignedToInspection({
      userId: parsedActor.userId,
      assignedTechnicianId: inspection.assignedTechnicianId,
      technicianAssignments: readTechnicianAssignments(inspection)
    })
  ) {
    if (inspection.status === InspectionStatus.completed) {
      throw new Error("Completed inspections are no longer available in the technician app.");
    }

    return { parsedActor, inspection };
  }

  if (parsedActor.role === "customer_user") {
    const customerCompanyId = await getAuthorizedCustomerCompanyId(parsedActor);
    if (customerCompanyId && inspection.customerCompanyId === customerCompanyId) {
      return { parsedActor, inspection };
    }
  }

  throw new Error("You do not have access to this inspection.");
}

export async function uploadInspectionDocument(actor: ActorContext, input: {
  inspectionId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  label?: string | null;
  requiresSignature?: boolean;
  customerVisible?: boolean;
}) {
  const { parsedActor, inspection } = await assertInspectionDocumentAccess(actor, input.inspectionId);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can upload external inspection documents.");
  }

  await assertTenantEntitlementForTenant(parsedActor.tenantId as string, "uploadedInspectionPdfs", "Uploaded inspection PDFs require a Professional or Enterprise subscription.");

  if (input.mimeType !== "application/pdf") {
    throw new Error("Only PDF files are supported.");
  }

  if (!input.fileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Uploaded inspection documents must use a .pdf file name.");
  }

  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_INSPECTION_DOCUMENT_BYTES) {
    throw new Error("Inspection document uploads must be between 1 byte and 12 MB.");
  }

  const payload = await buildStoredFilePayload({
    tenantId: parsedActor.tenantId as string,
    category: "inspection-document-original",
    fileName: input.fileName,
    mimeType: input.mimeType,
    bytes: input.bytes
  });

  const document = await prisma.inspectionDocument.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      inspectionId: inspection.id,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      fileSize: payload.sizeBytes,
      documentType: InspectionDocumentType.EXTERNAL_CUSTOMER_FORM,
      label: input.label?.trim() || null,
      requiresSignature: Boolean(input.requiresSignature),
      status: input.requiresSignature ? InspectionDocumentStatus.READY_FOR_SIGNATURE : InspectionDocumentStatus.UPLOADED,
      customerVisible: Boolean(input.customerVisible),
      originalStorageKey: payload.storageKey,
      uploadedByUserId: parsedActor.userId
    }
  });

  await createInspectionDocumentAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: "inspection_document.uploaded",
    documentId: document.id,
    inspectionId: inspection.id,
    metadata: {
      requiresSignature: document.requiresSignature,
      customerVisible: document.customerVisible
    }
  });

  return document;
}

export async function getInspectionDocuments(actor: ActorContext, inspectionId: string) {
  const { parsedActor, inspection } = await assertInspectionDocumentAccess(actor, inspectionId);
  const actorCustomerCompanyId = parsedActor.role === "customer_user" ? await getAuthorizedCustomerCompanyId(parsedActor) : null;

  const documents = await prisma.inspectionDocument.findMany({
    where: { tenantId: parsedActor.tenantId as string, inspectionId },
    orderBy: [{ createdAt: "desc" }]
  });

  if (parsedActor.role !== "customer_user") {
    return documents;
  }

  return documents.filter((document) =>
    canCustomerAccessInspectionDocument({
      actorTenantId: parsedActor.tenantId,
      actorCustomerCompanyId,
      documentTenantId: document.tenantId,
      inspectionCustomerCompanyId: inspection.customerCompanyId,
      customerVisible: document.customerVisible,
      requiresSignature: document.requiresSignature,
      status: document.status,
      signedStorageKey: document.signedStorageKey
    })
  );
}

export async function getTechnicianInspectionDocumentDetail(actor: ActorContext, inspectionId: string, documentId: string) {
  const { parsedActor, inspection } = await assertInspectionDocumentAccess(actor, inspectionId);
  if (parsedActor.role !== "technician") {
    throw new Error("Only technicians can access the field signing workflow.");
  }

  const document = await prisma.inspectionDocument.findFirst({
    where: {
      id: documentId,
      tenantId: parsedActor.tenantId as string,
      inspectionId
    }
  });

  if (!document) {
    throw new Error("Inspection document not found.");
  }

  return {
    inspection,
    document
  };
}

export async function signInspectionDocument(actor: ActorContext, input: {
  documentId: string;
  signerName: string;
  signatureDataUrl: string;
}) {
  const parsedActor = parseActor(actor);
  if (!["technician", "tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only technicians and administrators can sign inspection documents.");
  }

  const document = await getDocumentWithInspection(input.documentId, parsedActor.tenantId as string);
  if (!document) {
    throw new Error("Inspection document not found.");
  }

  const allowed = canActorAccessAttachmentDownload({
    actorRole: parsedActor.role,
    actorTenantId: parsedActor.tenantId,
    actorUserId: parsedActor.userId,
    attachmentTenantId: document.tenantId,
    inspectionCustomerCompanyId: document.inspection.customerCompanyId,
    inspectionAssignedTechnicianId: document.inspection.assignedTechnicianId,
    inspectionAssignedTechnicianIds: getInspectionAssignedTechnicianIds({
      assignedTechnicianId: document.inspection.assignedTechnicianId,
      technicianAssignments: readTechnicianAssignments(document.inspection)
    }),
    attachmentCustomerVisible: false
  });

  if (!allowed) {
    throw new Error("You do not have access to sign this inspection document.");
  }

  if (parsedActor.role === "technician" && document.inspection.status === InspectionStatus.completed) {
    throw new Error("Completed inspections are no longer available in the technician app.");
  }

  if (!document.requiresSignature) {
    throw new Error("This document does not require signature.");
  }

  if (!input.signerName.trim()) {
    throw new Error("Signer name is required.");
  }

  const [originalPdf, signatureImage] = await Promise.all([
    decodeStoredFile(document.originalStorageKey),
    decodeStoredFile(input.signatureDataUrl)
  ]);

  const signedAt = new Date();
  const signedBytes = await buildSignedInspectionDocumentPdf({
    originalBytes: originalPdf.bytes,
    signatureBytes: signatureImage.bytes,
    signerName: input.signerName.trim(),
    signedAt,
    label: document.label ?? document.fileName
  });

  const payload = await buildStoredFilePayload({
    tenantId: parsedActor.tenantId as string,
    category: "inspection-document-signed",
    fileName: buildSignedFileName(document.fileName),
    mimeType: "application/pdf",
    bytes: signedBytes
  });

  const previousSignedKey = document.signedStorageKey;
  const updated = await prisma.inspectionDocument.update({
    where: { id: document.id },
    data: {
      status: InspectionDocumentStatus.SIGNED,
      signedStorageKey: payload.storageKey,
      signedByUserId: parsedActor.userId,
      signedAt
    }
  });

  await createInspectionDocumentAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: "inspection_document.signed",
    documentId: document.id,
    inspectionId: document.inspectionId,
    metadata: {
      signedAt: signedAt.toISOString(),
      signerName: input.signerName.trim()
    }
  });

  if (previousSignedKey) {
    await deleteStoredFile(previousSignedKey);
  }

  return updated;
}

export async function getAuthorizedInspectionDocumentDownload(actor: ActorContext, input: {
  documentId: string;
  variant?: "original" | "signed" | "preferred";
}) {
  const parsedActor = parseActor(actor);
  const actorCustomerCompanyId = await getAuthorizedCustomerCompanyId(parsedActor);
  const document = await getDocumentWithInspection(input.documentId, parsedActor.tenantId as string);

  if (!document) {
    throw new Error("Inspection document not found.");
  }

  let allowed = false;
  if (parsedActor.role === "customer_user") {
    allowed = canCustomerAccessInspectionDocument({
      actorTenantId: parsedActor.tenantId,
      actorCustomerCompanyId,
      documentTenantId: document.tenantId,
      inspectionCustomerCompanyId: document.inspection.customerCompanyId,
      customerVisible: document.customerVisible,
      requiresSignature: document.requiresSignature,
      status: document.status,
      signedStorageKey: document.signedStorageKey
    });
  } else {
    allowed = canActorAccessAttachmentDownload({
      actorRole: parsedActor.role,
      actorTenantId: parsedActor.tenantId,
      actorUserId: parsedActor.userId,
      actorCustomerCompanyId,
      attachmentTenantId: document.tenantId,
      inspectionCustomerCompanyId: document.inspection.customerCompanyId,
      inspectionAssignedTechnicianId: document.inspection.assignedTechnicianId,
      inspectionAssignedTechnicianIds: getInspectionAssignedTechnicianIds({
        assignedTechnicianId: document.inspection.assignedTechnicianId,
        technicianAssignments: readTechnicianAssignments(document.inspection)
      }),
      attachmentCustomerVisible: document.customerVisible
    });
  }

  if (!allowed) {
    throw new Error("You do not have access to this inspection document.");
  }

  if (parsedActor.role === "technician" && document.inspection.status === InspectionStatus.completed) {
    throw new Error("Completed inspections are no longer available in the technician app.");
  }

  const variant = input.variant ?? "preferred";
  if (parsedActor.role === "customer_user" && document.requiresSignature && variant === "original") {
    throw new Error("Original document is not available in the customer portal.");
  }
  const useSigned = variant === "signed" || (variant === "preferred" && Boolean(document.signedStorageKey));
  const storageKey = useSigned ? document.signedStorageKey : document.originalStorageKey;

  if (!storageKey) {
    throw new Error("Signed inspection document is not available yet.");
  }

  assertStorageKeyBelongsToTenant(storageKey, document.tenantId);
  assertStorageKeyCategory(storageKey, [
    "inspection-document-original",
    "inspection-document-signed"
  ]);

  return buildFileDownloadResponse({
    storageKey,
    fileName: useSigned ? buildSignedFileName(document.fileName) : document.fileName,
    fallbackMimeType: document.mimeType
  });
}

export async function getSignedInspectionDocumentsForExport(actor: ActorContext, inspectionId: string) {
  const { parsedActor } = await assertInspectionDocumentAccess(actor, inspectionId);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can review export-ready inspection documents.");
  }

  return prisma.inspectionDocument.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      inspectionId,
      signedStorageKey: { not: null },
      status: { in: [InspectionDocumentStatus.SIGNED, InspectionDocumentStatus.EXPORTED] }
    },
    orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }]
  });
}
