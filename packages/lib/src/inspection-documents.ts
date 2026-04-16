import { InspectionDocumentStatus, InspectionDocumentType, InspectionStatus } from "@prisma/client";
import { prisma } from "@testworx/db";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantEntitlementForTenant } from "./billing";
import { assertTenantContext } from "./permissions";
import { canActorAccessAttachmentDownload } from "./report-service";
import { getInspectionAssignedTechnicianIds, isActiveOperationalInspectionStatus, isTechnicianAssignedToInspection } from "./scheduling";
import {
  assertStorageKeyBelongsToTenant,
  assertStorageKeyCategory,
  buildFileDownloadResponse,
  buildStoredFilePayload,
  decodeStoredFile,
  deleteStoredFile
} from "./storage";

const MAX_INSPECTION_DOCUMENT_BYTES = 12 * 1024 * 1024;
const documentAnnotationSchema = z.object({
  version: z.literal(1),
  strokes: z.array(z.object({
    pageIndex: z.number().int().min(0),
    color: z.string().regex(/^#([0-9a-f]{6})$/i),
    width: z.number().min(0.5).max(24),
    points: z.array(z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1)
    })).min(1)
  })).default([])
});

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
  annotatedStorageKey: string | null;
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

function buildAnnotatedFileName(fileName: string) {
  const base = fileName.toLowerCase().endsWith(".pdf") ? fileName.slice(0, -4) : fileName;
  return `${slugifyFileName(base)}-annotated.pdf`;
}

async function buildSignedInspectionDocumentPdf(input: {
  originalBytes: Uint8Array;
  signatureBytes: Uint8Array;
  signerName?: string;
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
  page.drawText(`Signed by technician: ${input.signerName?.trim() || "Technician"}`, {
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

function hexToRgbTuple(hex: string) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;

  return rgb(red, green, blue);
}

async function buildAnnotatedInspectionDocumentPdf(input: {
  originalBytes: Uint8Array;
  signerName?: string;
  savedAt: Date;
  label: string;
  annotations: z.infer<typeof documentAnnotationSchema>;
}) {
  const pdf = await PDFDocument.load(input.originalBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();

  for (const stroke of input.annotations.strokes) {
    const page = pages[stroke.pageIndex];
    if (!page) {
      continue;
    }

    const { width, height } = page.getSize();
    const strokeColor = hexToRgbTuple(stroke.color);

    if (stroke.points.length === 1) {
      const point = stroke.points[0]!;
      page.drawCircle({
        x: point.x * width,
        y: height - point.y * height,
        size: stroke.width / 2,
        color: strokeColor
      });
      continue;
    }

    for (let index = 1; index < stroke.points.length; index += 1) {
      const start = stroke.points[index - 1]!;
      const end = stroke.points[index]!;
      page.drawLine({
        start: { x: start.x * width, y: height - start.y * height },
        end: { x: end.x * width, y: height - end.y * height },
        thickness: stroke.width,
        color: strokeColor,
        opacity: 1
      });
    }
  }

  const summaryPage = pdf.addPage([612, 792]);
  summaryPage.drawText("Annotated External Inspection Document", {
    x: 48,
    y: 736,
    size: 20,
    font: bold,
    color: rgb(0.06, 0.1, 0.16)
  });
  summaryPage.drawText(`Document: ${input.label}`, {
    x: 48,
    y: 700,
    size: 12,
    font: regular,
    color: rgb(0.2, 0.27, 0.37)
  });
  summaryPage.drawText(`Saved at: ${input.savedAt.toISOString()}`, {
    x: 48,
    y: 676,
    size: 12,
    font: regular,
    color: rgb(0.2, 0.27, 0.37)
  });
  if (input.signerName?.trim()) {
    summaryPage.drawText(`Annotated by technician: ${input.signerName.trim()}`, {
      x: 48,
      y: 652,
      size: 12,
      font: regular,
      color: rgb(0.2, 0.27, 0.37)
    });
  }
  summaryPage.drawText(`Markup strokes captured: ${input.annotations.strokes.length}`, {
    x: 48,
    y: input.signerName?.trim() ? 628 : 652,
    size: 12,
    font: regular,
    color: rgb(0.2, 0.27, 0.37)
  });
  summaryPage.drawText("The original uploaded PDF remains preserved separately in TradeWorx.", {
    x: 48,
    y: input.signerName?.trim() ? 592 : 616,
    size: 11,
    font: regular,
    color: rgb(0.2, 0.27, 0.37)
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
    if (!isActiveOperationalInspectionStatus(inspection.status)) {
      throw new Error("Closed inspections are no longer available in the technician app.");
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
      annotatedStorageKey: document.annotatedStorageKey,
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
  signerName?: string;
  signatureDataUrl?: string;
  annotationData?: string;
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

  if (parsedActor.role === "technician" && !isActiveOperationalInspectionStatus(document.inspection.status)) {
    throw new Error("Closed inspections are no longer available in the technician app.");
  }

  const savedAt = new Date();
  const originalPdf = await decodeStoredFile(document.originalStorageKey);
  const annotations = input.annotationData
    ? documentAnnotationSchema.parse(JSON.parse(input.annotationData))
    : null;

  const hasAnnotations = Boolean(annotations && annotations.strokes.length > 0);
  const requiresSignature = document.requiresSignature;

  let outputBytes: Uint8Array;
  if (hasAnnotations) {
    const annotationPayload = annotations!;
    outputBytes = await buildAnnotatedInspectionDocumentPdf({
      originalBytes: originalPdf.bytes,
      signerName: requiresSignature ? input.signerName?.trim() : undefined,
      savedAt,
      label: document.label ?? document.fileName,
      annotations: annotationPayload
    });
  } else if (requiresSignature && input.signatureDataUrl) {
    const signatureImage = await decodeStoredFile(input.signatureDataUrl);
    outputBytes = await buildSignedInspectionDocumentPdf({
      originalBytes: originalPdf.bytes,
      signatureBytes: signatureImage.bytes,
      signerName: input.signerName?.trim(),
      signedAt: savedAt,
      label: document.label ?? document.fileName
    });
  } else {
    throw new Error(requiresSignature ? "Add markup or a signature before saving this document." : "Add markup before saving this document.");
  }

  const payload = await buildStoredFilePayload({
    tenantId: parsedActor.tenantId as string,
    category: requiresSignature ? "inspection-document-signed" : "inspection-document-signed",
    fileName: requiresSignature ? buildSignedFileName(document.fileName) : buildAnnotatedFileName(document.fileName),
    mimeType: "application/pdf",
    bytes: outputBytes
  });

  const previousAnnotatedKey = document.annotatedStorageKey;
  const previousSignedKey = document.signedStorageKey;
  const updated = await prisma.inspectionDocument.update({
    where: { id: document.id },
    data: {
      status: requiresSignature ? InspectionDocumentStatus.SIGNED : InspectionDocumentStatus.ANNOTATED,
      annotatedStorageKey: requiresSignature ? document.annotatedStorageKey : payload.storageKey,
      annotatedByUserId: requiresSignature ? document.annotatedByUserId : parsedActor.userId,
      annotatedAt: requiresSignature ? document.annotatedAt : savedAt,
      signedStorageKey: requiresSignature ? payload.storageKey : document.signedStorageKey,
      signedByUserId: requiresSignature ? parsedActor.userId : document.signedByUserId,
      signedAt: requiresSignature ? savedAt : document.signedAt
    }
  });

  await createInspectionDocumentAuditLog({
    tenantId: parsedActor.tenantId as string,
    actorUserId: parsedActor.userId,
    action: requiresSignature ? "inspection_document.signed" : "inspection_document.annotated",
    documentId: document.id,
    inspectionId: document.inspectionId,
    metadata: {
      savedAt: savedAt.toISOString(),
      signerName: input.signerName?.trim() || null,
      annotated: hasAnnotations
    }
  });

  if (!requiresSignature && previousAnnotatedKey) {
    await deleteStoredFile(previousAnnotatedKey);
  }
  if (previousSignedKey) {
    if (requiresSignature) {
      await deleteStoredFile(previousSignedKey);
    }
  }

  return updated;
}

export async function getAuthorizedInspectionDocumentDownload(actor: ActorContext, input: {
  documentId: string;
  variant?: "original" | "annotated" | "signed" | "preferred";
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
      annotatedStorageKey: document.annotatedStorageKey,
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

  if (parsedActor.role === "technician" && !isActiveOperationalInspectionStatus(document.inspection.status)) {
    throw new Error("Closed inspections are no longer available in the technician app.");
  }

  const variant = input.variant ?? "preferred";
  if (parsedActor.role === "customer_user" && document.requiresSignature && variant === "original") {
    throw new Error("Original document is not available in the customer portal.");
  }
  const useSigned = document.requiresSignature && (variant === "signed" || (variant === "preferred" && Boolean(document.signedStorageKey)));
  const useAnnotated = !document.requiresSignature && (variant === "annotated" || (variant === "preferred" && Boolean(document.annotatedStorageKey)));
  const storageKey = useSigned
    ? document.signedStorageKey
    : useAnnotated
      ? document.annotatedStorageKey
      : document.originalStorageKey;

  if (!storageKey) {
    throw new Error(document.requiresSignature ? "Signed inspection document is not available yet." : "Annotated inspection document is not available yet.");
  }

  assertStorageKeyBelongsToTenant(storageKey, document.tenantId);
  assertStorageKeyCategory(storageKey, [
    "inspection-document-original",
    "inspection-document-signed"
  ]);

  return buildFileDownloadResponse({
    storageKey,
    fileName: useSigned ? buildSignedFileName(document.fileName) : useAnnotated ? buildAnnotatedFileName(document.fileName) : document.fileName,
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
