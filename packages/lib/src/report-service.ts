import "server-only";

import { AttachmentKind, InspectionDocumentStatus, InspectionStatus, Prisma, ReportCorrectionState, SignatureKind } from "@prisma/client";
import { prisma } from "@testworx/db";

import type { ActorContext, InspectionType, ReportStatus } from "@testworx/types";
import { actorContextSchema, reportStatuses } from "@testworx/types";

import { resolveTenantBranding } from "./branding";
import { assertTenantEntitlementForTenant } from "./billing";
import { syncInspectionArchiveStateTx } from "./inspection-archive";
import { syncInspectionBillingSummaryTx } from "./inspection-billing";
import type { JsonInputValue, JsonObject, JsonValue } from "./json-types";
import { assertTenantContext } from "./permissions";
import { resolveReportTemplate } from "./report-config";
import {
  formatCustomerFacingInspectionAddress,
  getCustomerFacingInspectionAddress,
  getCustomerFacingSiteLabel,
  getInspectionAssignedTechnicianIds,
  isActiveOperationalInspectionStatus,
  isTechnicianAssignedToInspection,
  withInspectionTaskDisplayLabels
} from "./scheduling";
import { createInspectionCorrectionReissuedNotificationTx } from "./technician-notifications";
import {
  type ReportAssetRecord,
  type ReportDetectedDeficiency,
  type ReportPrimitiveValue,
  buildInitialReportDraft,
  buildReportPreview,
  canEditReport,
  canFinalizeReport,
  normalizeSignaturePayload,
  reportDraftSchema,
  type ReportDraft,
  validateDraftForTemplate,
  validateFinalizationDraft
} from "./report-engine";
import {
  assertStorageKeyBelongsToTenant,
  assertStorageKeyCategory,
  buildBlobStorageKey,
  buildFileDownloadResponse,
  buildStoredFilePayload,
  decodeStoredFile,
  deleteStoredFile
} from "./storage";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function slugifyFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "inspection-report";
}

export type InspectionPacketDocumentCategory = "hosted_report" | "report_pdf" | "signed_document" | "inspection_pdf";

export type InspectionPacketDocument = {
  id: string;
  source: "attachment" | "inspection_document" | "report";
  category: InspectionPacketDocumentCategory;
  categoryLabel: string;
  title: string;
  fileName: string;
  customerVisible: boolean;
  happenedAt: Date;
  downloadPath: string | null;
  viewPath: string;
  viewLabel?: string;
  downloadLabel?: string;
};

export function buildInspectionPacketDocuments(input: {
  attachments?: Array<{
    id: string;
    fileName: string;
    source?: string | null;
    createdAt: Date;
    customerVisible?: boolean | null;
  }>;
  inspectionDocuments?: Array<{
    id: string;
    fileName: string;
    label?: string | null;
    requiresSignature?: boolean | null;
    status?: InspectionDocumentStatus | string | null;
    uploadedAt?: Date;
    annotatedAt?: Date | null;
    signedAt?: Date | null;
    annotatedStorageKey?: string | null;
    signedStorageKey?: string | null;
    customerVisible?: boolean | null;
  }>;
  reports?: Array<{
    id: string;
    title: string;
    happenedAt?: Date | null;
    customerVisible?: boolean | null;
    viewPath: string;
  }>;
}) {
  const packetDocuments: InspectionPacketDocument[] = [];

  for (const report of input.reports ?? []) {
    packetDocuments.push({
      id: report.id,
      source: "report",
      category: "hosted_report",
      categoryLabel: "Hosted reports",
      title: report.title,
      fileName: report.title,
      customerVisible: Boolean(report.customerVisible ?? true),
      happenedAt: report.happenedAt ?? new Date(0),
      downloadPath: null,
      viewPath: report.viewPath,
      viewLabel: "Open report"
    });
  }

  for (const attachment of input.attachments ?? []) {
    packetDocuments.push({
      id: attachment.id,
      source: "attachment",
      category: attachment.source === "generated" ? "report_pdf" : "inspection_pdf",
      categoryLabel: attachment.source === "generated" ? "Report PDFs" : "Other inspection PDFs",
      title: attachment.fileName,
      fileName: attachment.fileName,
      customerVisible: Boolean(attachment.customerVisible),
      happenedAt: attachment.createdAt,
      downloadPath: `/api/attachments/${attachment.id}`,
      viewPath: `/api/attachments/${attachment.id}?disposition=inline`,
      viewLabel: "View PDF",
      downloadLabel: "Download PDF"
    });
  }

  for (const document of input.inspectionDocuments ?? []) {
    const isSignedDocument = Boolean(
      document.requiresSignature &&
        document.signedStorageKey &&
        (document.status === InspectionDocumentStatus.SIGNED || document.status === InspectionDocumentStatus.EXPORTED)
    );
    const isAnnotatedReferenceDocument = Boolean(
      !document.requiresSignature &&
        document.annotatedStorageKey &&
        document.status === InspectionDocumentStatus.ANNOTATED
    );

    packetDocuments.push({
      id: document.id,
      source: "inspection_document",
      category: isSignedDocument ? "signed_document" : "inspection_pdf",
      categoryLabel: isSignedDocument ? "Signed inspection documents" : "Other inspection PDFs",
      title: document.label?.trim() || document.fileName,
      fileName: document.fileName,
      customerVisible: Boolean(document.customerVisible),
      happenedAt: isSignedDocument
        ? document.signedAt ?? document.uploadedAt ?? new Date(0)
        : isAnnotatedReferenceDocument
          ? document.annotatedAt ?? document.uploadedAt ?? new Date(0)
          : document.uploadedAt ?? new Date(0),
      downloadPath: `/api/inspection-documents/${document.id}`,
      viewPath: `/api/inspection-documents/${document.id}?disposition=inline`,
      viewLabel: "View PDF",
      downloadLabel: "Download PDF"
    });
  }

  return packetDocuments.sort((left, right) => right.happenedAt.getTime() - left.happenedAt.getTime());
}

async function createAuditLog(tx: Prisma.TransactionClient, input: { tenantId: string; actorUserId: string; action: string; entityId: string; metadata?: Record<string, unknown> }) {
  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.action.startsWith("attachment.") ? "Attachment" : "InspectionReport",
      entityId: input.entityId,
      metadata: input.metadata as JsonObject | undefined
    }
  });
}

const reportCorrectionActionTypes = {
  adminEditOpened: "ADMIN_EDIT_OPENED",
  reissuedToTechnician: "REISSUE_TO_TECHNICIAN",
  adminEdited: "ADMIN_EDITED",
  recompleted: "RECOMPLETED"
} as const;

function hasActiveCorrectionState(state: ReportCorrectionState | null | undefined) {
  return Boolean(state && state !== ReportCorrectionState.none);
}

function stripCorrectionSensitiveContent(contentJson: unknown) {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) {
    return contentJson === null ? undefined : contentJson as JsonInputValue | undefined;
  }

  const next = { ...(contentJson as JsonObject) };
  next.signatures = {};
  return next;
}

function buildCorrectionSnapshot(report: {
  id: string;
  status: ReportStatus;
  correctionState: ReportCorrectionState;
  finalizedAt: Date | null;
  contentJson: unknown;
  attachments: Array<{ id: string; kind: AttachmentKind; source: string; fileName: string; storageKey: string }>;
  signatures: Array<{ id: string; kind: SignatureKind; signerName: string; signedAt: Date }>;
}) {
  return {
    reportId: report.id,
    status: report.status,
    correctionState: report.correctionState,
    finalizedAt: report.finalizedAt?.toISOString() ?? null,
    contentJson: report.contentJson as JsonValue | null,
    generatedPdfAttachments: report.attachments
      .filter((attachment) => attachment.kind === AttachmentKind.pdf && attachment.source === "generated")
      .map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        storageKey: attachment.storageKey
      })),
    signatures: report.signatures.map((signature) => ({
      id: signature.id,
      kind: signature.kind,
      signerName: signature.signerName,
      signedAt: signature.signedAt.toISOString()
    }))
  } satisfies JsonObject;
}

async function createReportCorrectionEvent(tx: Prisma.TransactionClient, input: {
  tenantId: string;
  reportId: string;
  actionType: string;
  reason?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  snapshotJson?: JsonInputValue;
  actedByUserId: string;
}) {
  await tx.reportCorrectionEvent.create({
    data: {
      tenantId: input.tenantId,
      reportId: input.reportId,
      actionType: input.actionType,
      reason: input.reason ?? null,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.newStatus ?? null,
      snapshotJson: input.snapshotJson,
      actedByUserId: input.actedByUserId
    }
  });
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

export function canCustomerAccessReport(input: {
  actorTenantId: string | null;
  reportTenantId: string;
  actorCustomerCompanyId: string | null;
  reportCustomerCompanyId: string;
  reportStatus: ReportStatus;
}) {
  return Boolean(
    input.actorTenantId &&
      input.actorTenantId === input.reportTenantId &&
      input.actorCustomerCompanyId &&
      input.actorCustomerCompanyId === input.reportCustomerCompanyId &&
      input.reportStatus === reportStatuses.finalized
  );
}

export function canActorAccessAttachmentDownload(input: {
  actorRole: string;
  actorTenantId: string | null;
  actorUserId: string;
  actorCustomerCompanyId?: string | null;
  attachmentTenantId: string;
  inspectionCustomerCompanyId: string | null;
  inspectionAssignedTechnicianId: string | null;
  inspectionAssignedTechnicianIds?: string[];
  attachmentCustomerVisible: boolean;
  reportStatus?: ReportStatus | null;
}) {
  if (input.actorRole === "platform_admin") {
    return true;
  }

  if (!input.actorTenantId || input.actorTenantId !== input.attachmentTenantId) {
    return false;
  }

  if (["tenant_admin", "office_admin"].includes(input.actorRole)) {
    return true;
  }

  if (input.actorRole === "technician") {
    return (
      input.inspectionAssignedTechnicianId === input.actorUserId ||
      (input.inspectionAssignedTechnicianIds ?? []).includes(input.actorUserId)
    );
  }

  if (input.actorRole === "customer_user") {
    return Boolean(
      input.attachmentCustomerVisible &&
        input.actorCustomerCompanyId &&
        input.inspectionCustomerCompanyId &&
        input.actorCustomerCompanyId === input.inspectionCustomerCompanyId &&
        (!input.reportStatus || input.reportStatus === reportStatuses.finalized)
    );
  }

  return false;
}

async function getAuthorizedReport(actor: ActorContext, inspectionId: string, taskId: string) {
  const parsedActor = parseActor(actor);
  const report = await prisma.inspectionReport.findFirst({
    where: {
      inspectionId,
      inspectionTaskId: taskId,
      tenantId: parsedActor.tenantId as string
    },
    include: {
        inspection: {
          include: {
            site: true,
            customerCompany: true,
            tenant: true,
            assignedTechnician: true,
            technicianAssignments: { select: { technicianId: true } },
            tasks: {
              include: {
                report: {
                  select: {
                    id: true,
                    status: true,
                    finalizedAt: true,
                    contentJson: true
                  }
                }
              }
            }
          }
        },
      task: {
        include: {
          assignedTechnician: true
        }
      },
      technician: true,
      attachments: true,
      signatures: true,
      deficiencies: true
    }
  });

  if (!report) {
    return null;
  }

  if (
    parsedActor.role === "technician" &&
    !(
      report.task.assignedTechnicianId === parsedActor.userId ||
      (
        !report.task.assignedTechnicianId &&
        isTechnicianAssignedToInspection({
          userId: parsedActor.userId,
          assignedTechnicianId: report.inspection.assignedTechnicianId,
          technicianAssignments: readTechnicianAssignments(report.inspection)
        })
      )
    )
  ) {
    throw new Error("Technician does not have access to this report.");
  }

  if (
    parsedActor.role === "technician" &&
    report.task.schedulingStatus &&
    !["due_now", "scheduled_now", "completed", "deferred"].includes(report.task.schedulingStatus)
  ) {
    throw new Error("This service line is being tracked for a future visit and is not available in the technician app yet.");
  }

  if (
    parsedActor.role === "technician" &&
    !isActiveOperationalInspectionStatus(report.inspection.status) &&
    !hasActiveCorrectionState(report.correctionState)
  ) {
    throw new Error("Closed inspections are no longer available in the technician app.");
  }

  if (parsedActor.role === "customer_user") {
    throw new Error("Customer users cannot edit technician reports.");
  }

  return { parsedActor, report };
}

function buildTaskProgressSummary(draft: ReportDraft) {
  const preview = buildReportPreview(draft);
  const completedCount = preview.sectionSummaries.reduce((sum, section) => sum + section.completedRows, 0);
  const totalCount = preview.sectionSummaries.reduce((sum, section) => sum + section.totalRows, 0);

  if (totalCount <= 0 || completedCount < 0 || completedCount > totalCount) {
    return {
      hasMeaningfulProgress:
        preview.deficiencyCount > 0 ||
        preview.manualDeficiencyCount > 0 ||
        preview.attachmentCount > 0 ||
        Object.values(draft.signatures).some((signature) => Boolean(signature?.signerName && signature?.imageDataUrl)) ||
        draft.overallNotes.trim().length > 0 ||
        preview.sectionSummaries.some((section) => section.status !== "pending" || section.notes.trim().length > 0),
      completedCount: null,
      totalCount: null,
      percent: null
    };
  }

  return {
    hasMeaningfulProgress: completedCount > 0 || totalCount > 0,
    completedCount,
    totalCount,
    percent: Math.round((completedCount / totalCount) * 100)
  };
}

function hydrateDraftFromReport(report: any) {
  const photoAttachments = (report.attachments as any[]).filter((attachment: any) => attachment.kind === AttachmentKind.photo);
  return report.contentJson ?? {
    deficiencies: (report.deficiencies as any[]).filter((deficiency: any) => deficiency.source !== "detected").map((deficiency: any) => ({
      id: deficiency.id,
      title: deficiency.title,
      description: deficiency.description,
      severity: deficiency.severity,
      status: deficiency.status,
      assetId: deficiency.assetId,
      assetTag: deficiency.assetTag,
      location: deficiency.location,
      deviceType: deficiency.deviceType,
      section: deficiency.section,
      source: deficiency.source,
      sourceRowKey: deficiency.sourceRowKey,
      notes: deficiency.notes,
      photoStorageKey: deficiency.photoStorageKey
    })),
    attachments: photoAttachments.map((attachment: any) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      storageKey: attachment.storageKey
    })),
    signatures: Object.fromEntries(
      (report.signatures as any[]).map((signature: any) => [
        signature.kind,
        {
          signerName: signature.signerName,
          imageDataUrl: signature.imageDataUrl,
          signedAt: signature.signedAt.toISOString()
        }
      ])
    )
  };
}

function readTechnicianAssignments(value: unknown): Array<{ technicianId: string }> {
  const assignments = (value as { technicianAssignments?: Array<{ technicianId: string }> } | null | undefined)?.technicianAssignments;
  return Array.isArray(assignments) ? assignments : [];
}

type DraftMediaPersistenceResult = {
  draft: ReportDraft;
  staleStorageKeys: string[];
};

type AuthorizedEditableReport = {
  parsedActor: ReturnType<typeof parseActor>;
  report: Awaited<ReturnType<typeof prisma.inspectionReport.findFirst>> & NonNullable<unknown>;
};

type PersistableReportRecord = NonNullable<Awaited<ReturnType<typeof prisma.inspectionReport.findFirst>>> & {
  inspection: {
    siteId: string;
  };
  task: {
    inspectionType: InspectionType;
  };
};

type PersistedDeficiencyRecordInput = {
  source: "manual" | "detected";
  sourceRowKey: string;
  section: string;
  assetId: string | null;
  assetTag: string | null;
  location: string | null;
  deviceType: string | null;
  title: string;
  description: string;
  severity: string;
  status: string;
  notes: string | null;
  photoStorageKey: string | null;
};

function buildDetectedDeficiencyTitle(deficiency: ReportDetectedDeficiency) {
  if (deficiency.deviceType) {
    return String(deficiency.deviceType).replaceAll("_", " ");
  }

  return deficiency.rowLabel;
}

function buildPersistedDeficienciesFromDraft(input: {
  draft: ReportDraft;
}): PersistedDeficiencyRecordInput[] {
  const preview = buildReportPreview(input.draft);

  const manual = input.draft.deficiencies.map((deficiency) => ({
    source: "manual" as const,
    sourceRowKey: deficiency.sourceRowKey ?? deficiency.id,
    section: deficiency.section ?? "manual",
    assetId: deficiency.assetId ?? null,
    assetTag: deficiency.assetTag ?? null,
    location: deficiency.location ?? null,
    deviceType: deficiency.deviceType ?? null,
    title: deficiency.title,
    description: deficiency.description,
    severity: deficiency.severity,
    status: deficiency.status,
    notes: deficiency.notes ?? null,
    photoStorageKey: deficiency.photoStorageKey ?? null
  }));

  const detected = preview.detectedDeficiencies.map((deficiency) => ({
    source: "detected" as const,
    sourceRowKey: deficiency.rowKey,
    section: deficiency.sectionId,
    assetId: deficiency.assetId,
    assetTag: deficiency.assetTag,
    location: deficiency.location,
    deviceType: deficiency.deviceType,
    title: buildDetectedDeficiencyTitle(deficiency),
    description: deficiency.description,
    severity: deficiency.severity,
    status: "open",
    notes: deficiency.notes || null,
    photoStorageKey: deficiency.photoStorageKey
  }));

  return [...manual, ...detected];
}

async function syncPersistedDeficiencies(input: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  report: PersistableReportRecord;
  draft: ReportDraft;
}) {
  const nextRecords = buildPersistedDeficienciesFromDraft({ draft: input.draft });
  const existing = await input.tx.deficiency.findMany({
    where: { tenantId: input.tenantId, inspectionReportId: input.report.id }
  });
  const existingByKey = new Map(existing.map((record) => [`${record.source}:${record.section}:${record.sourceRowKey}`, record] as const));
  const keepKeys = new Set(nextRecords.map((record) => `${record.source}:${record.section}:${record.sourceRowKey}`));

  for (const record of nextRecords) {
    const existingRecord = existingByKey.get(`${record.source}:${record.section}:${record.sourceRowKey}`);
    await input.tx.deficiency.upsert({
      where: {
        inspectionReportId_source_section_sourceRowKey: {
          inspectionReportId: input.report.id,
          source: record.source,
          section: record.section,
          sourceRowKey: record.sourceRowKey
        }
      },
      create: {
        tenantId: input.tenantId,
        siteId: input.report.inspection.siteId,
        inspectionId: input.report.inspectionId,
        inspectionReportId: input.report.id,
        reportType: input.report.task.inspectionType,
        section: record.section,
        source: record.source,
        sourceRowKey: record.sourceRowKey,
        assetId: record.assetId,
        assetTag: record.assetTag,
        location: record.location,
        deviceType: record.deviceType,
        title: record.title,
        description: record.description,
        severity: record.severity,
        status: record.status,
        photoStorageKey: record.photoStorageKey,
        notes: record.notes
      },
      update: {
        siteId: input.report.inspection.siteId,
        inspectionId: input.report.inspectionId,
        reportType: input.report.task.inspectionType,
        assetId: record.assetId,
        assetTag: record.assetTag,
        location: record.location,
        deviceType: record.deviceType,
        title: record.title,
        description: record.description,
        severity: record.severity,
        status: record.source === "detected" ? existingRecord?.status ?? "open" : record.status,
        photoStorageKey: record.photoStorageKey,
        notes: record.notes
      }
    });
  }

  const staleIds = existing.filter((record) => !keepKeys.has(`${record.source}:${record.section}:${record.sourceRowKey}`)).map((record) => record.id);
  if (staleIds.length > 0) {
    await input.tx.deficiency.deleteMany({
      where: { tenantId: input.tenantId, id: { in: staleIds } }
    });
  }
}

function collectDraftStorageKeys(draft: ReportDraft) {
  const storageKeys = new Set([
    ...draft.attachments.map((attachment) => attachment.storageKey),
    ...Object.values(draft.signatures).flatMap((signature) => (signature?.imageDataUrl ? [signature.imageDataUrl] : []))
  ]);

  const template = resolveReportTemplate({ inspectionType: draft.inspectionType as InspectionType });
  for (const section of template.sections) {
    const sectionState = draft.sections[section.id];
    if (!sectionState) {
      continue;
    }

    for (const field of section.fields) {
      if (field.type === "photo" && typeof sectionState.fields[field.id] === "string" && String(sectionState.fields[field.id])) {
        storageKeys.add(String(sectionState.fields[field.id]));
      }

      if (field.type !== "repeater") {
        continue;
      }

      const rows = Array.isArray(sectionState.fields[field.id]) ? sectionState.fields[field.id] as Array<Record<string, unknown>> : [];
      for (const row of rows) {
        for (const rowField of field.rowFields) {
          if (rowField.type === "photo" && typeof row[rowField.id] === "string" && String(row[rowField.id])) {
            storageKeys.add(String(row[rowField.id]));
          }
        }
      }
    }
  }

  for (const deficiency of draft.deficiencies) {
    if (deficiency.photoStorageKey) {
      storageKeys.add(deficiency.photoStorageKey);
    }
  }

  return storageKeys;
}

async function persistDraftFieldPhotos(input: { tenantId: string; draft: ReportDraft }) {
  const template = resolveReportTemplate({ inspectionType: input.draft.inspectionType as InspectionType });
  const sections = structuredClone(input.draft.sections) as ReportDraft["sections"];

  for (const section of template.sections) {
    const sectionState = sections[section.id];
    if (!sectionState) {
      continue;
    }

    for (const field of section.fields) {
      if (field.type === "photo" && typeof sectionState.fields[field.id] === "string" && String(sectionState.fields[field.id]).startsWith("data:")) {
        const decoded = await decodeStoredFile(String(sectionState.fields[field.id]));
        const stored = await buildStoredFilePayload({
          tenantId: input.tenantId,
          category: "photo",
          fileName: `${field.id}.png`,
          mimeType: decoded.mimeType || "image/png",
          bytes: decoded.bytes
        });
        sectionState.fields[field.id] = stored.storageKey;
      }

      if (field.type !== "repeater") {
        continue;
      }

      const rows = Array.isArray(sectionState.fields[field.id]) ? sectionState.fields[field.id] as Array<Record<string, unknown>> : [];
      for (const row of rows) {
        for (const rowField of field.rowFields) {
          if (rowField.type !== "photo" || typeof row[rowField.id] !== "string" || !String(row[rowField.id]).startsWith("data:")) {
            continue;
          }

          const decoded = await decodeStoredFile(String(row[rowField.id]));
          const stored = await buildStoredFilePayload({
            tenantId: input.tenantId,
            category: "photo",
            fileName: `${field.id}-${rowField.id}.png`,
            mimeType: decoded.mimeType || "image/png",
            bytes: decoded.bytes
          });
          row[rowField.id] = stored.storageKey;
        }
      }
    }
  }

  const deficiencies = await Promise.all(
    input.draft.deficiencies.map(async (deficiency) => {
      if (!deficiency.photoStorageKey || !deficiency.photoStorageKey.startsWith("data:")) {
        return deficiency;
      }

      const decoded = await decodeStoredFile(deficiency.photoStorageKey);
      const stored = await buildStoredFilePayload({
        tenantId: input.tenantId,
        category: "photo",
        fileName: `deficiency-${deficiency.id}.png`,
        mimeType: decoded.mimeType || "image/png",
        bytes: decoded.bytes
      });

      return {
        ...deficiency,
        photoStorageKey: stored.storageKey
      };
    })
  );

  return {
    ...input.draft,
    sections,
    deficiencies
  };
}

async function persistDraftMedia(input: { tenantId: string; draft: ReportDraft; existingAttachmentKeys: string[]; existingSignatureKeys: string[] }): Promise<DraftMediaPersistenceResult> {
  const persistedAttachments = await Promise.all(
    input.draft.attachments.map(async (attachment) => {
      if (!attachment.storageKey.startsWith("data:")) {
        return attachment;
      }

      const decoded = await decodeStoredFile(attachment.storageKey);
      const stored = await buildStoredFilePayload({
        tenantId: input.tenantId,
        category: "photo",
        fileName: attachment.fileName,
        mimeType: decoded.mimeType || attachment.mimeType,
        bytes: decoded.bytes
      });

      return {
        ...attachment,
        mimeType: stored.mimeType,
        storageKey: stored.storageKey
      };
    })
  );

  const persistedSignatures = Object.fromEntries(
    await Promise.all(
      Object.entries(input.draft.signatures).map(async ([kind, signature]) => {
        if (!signature?.imageDataUrl || !signature.imageDataUrl.startsWith("data:")) {
          return [kind, signature] as const;
        }

        const decoded = await decodeStoredFile(signature.imageDataUrl);
        const stored = await buildStoredFilePayload({
          tenantId: input.tenantId,
          category: "signature",
          fileName: `${kind}-signature.png`,
          mimeType: decoded.mimeType || "image/png",
          bytes: decoded.bytes
        });

        return [
          kind,
          {
            ...signature,
            imageDataUrl: stored.storageKey
          }
        ] as const;
      })
    )
  ) as ReportDraft["signatures"];

  const withFieldPhotos = await persistDraftFieldPhotos({
    tenantId: input.tenantId,
    draft: {
      ...input.draft,
      attachments: persistedAttachments,
      signatures: persistedSignatures
    }
  });

  const draft = {
    ...withFieldPhotos,
    attachments: persistedAttachments,
    signatures: persistedSignatures
  };

  const nextStorageKeys = collectDraftStorageKeys(draft);
  const staleStorageKeys = [...new Set([...input.existingAttachmentKeys, ...input.existingSignatureKeys])].filter((storageKey) => !nextStorageKeys.has(storageKey));

  return { draft, staleStorageKeys };
}

async function getAuthorizedEditableReport(actor: ActorContext, inspectionReportId: string) {
  const parsedActor = parseActor(actor);

  const report = await prisma.inspectionReport.findFirst({
    where: { id: inspectionReportId, tenantId: parsedActor.tenantId as string },
    include: {
      inspection: { include: { technicianAssignments: { select: { technicianId: true } } } },
      task: {
        include: {
          assignedTechnician: true
        }
      },
      attachments: true,
      signatures: true,
      deficiencies: true
    }
  });

  if (!report) {
    throw new Error("Report not found.");
  }

  if (
    parsedActor.role === "technician" &&
    !isTechnicianAssignedToInspection({
      userId: parsedActor.userId,
      assignedTechnicianId: report.inspection.assignedTechnicianId,
      technicianAssignments: readTechnicianAssignments(report.inspection)
    })
  ) {
    throw new Error("Technician does not have access to this report.");
  }

  if (
    parsedActor.role === "technician" &&
    !isActiveOperationalInspectionStatus(report.inspection.status) &&
    !hasActiveCorrectionState(report.correctionState)
  ) {
    throw new Error("Closed inspections are no longer editable in the technician app.");
  }

  return { parsedActor, report };
}

async function persistReportDraftTransaction(input: {
  tx: Prisma.TransactionClient;
  parsedActor: ReturnType<typeof parseActor>;
  report: PersistableReportRecord;
  draft: ReportDraft;
  taskDisplayLabel?: string | null;
  nextStatus?: ReportStatus;
}) {
  const tenantId = input.parsedActor.tenantId as string;

  await input.tx.inspectionReport.update({
    where: { id: input.report.id },
    data: {
      contentJson: input.draft as JsonInputValue,
      autosaveVersion: { increment: 1 },
      status: input.nextStatus ?? reportStatuses.draft
    }
  });

  await input.tx.inspectionTask.update({
    where: { id: input.report.inspectionTaskId },
    data: { customDisplayLabel: input.taskDisplayLabel ?? null }
  });

  await input.tx.attachment.deleteMany({ where: { inspectionReportId: input.report.id, tenantId, kind: AttachmentKind.photo } });
  await input.tx.signature.deleteMany({ where: { inspectionReportId: input.report.id, tenantId } });
  await syncPersistedDeficiencies({
    tx: input.tx,
    tenantId,
    report: input.report,
    draft: input.draft
  });

  if (input.draft.attachments.length > 0) {
    await input.tx.attachment.createMany({
      data: input.draft.attachments.map((attachment) => ({
        tenantId,
        inspectionId: input.report.inspectionId,
        inspectionReportId: input.report.id,
        kind: AttachmentKind.photo,
        source: "uploaded",
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        storageKey: attachment.storageKey,
        customerVisible: false
      })) as any
    });
  }

  const signatures = [
    input.draft.signatures.technician?.imageDataUrl && input.draft.signatures.technician?.signerName
      ? normalizeSignaturePayload(SignatureKind.technician, input.draft.signatures.technician)
      : null,
    input.draft.signatures.customer?.imageDataUrl && input.draft.signatures.customer?.signerName
      ? normalizeSignaturePayload(SignatureKind.customer, input.draft.signatures.customer)
      : null
  ].filter(Boolean);

  if (signatures.length > 0) {
    await input.tx.signature.createMany({
      data: signatures.map((signature) => ({
        tenantId,
        inspectionReportId: input.report.id,
        signerName: signature!.signerName,
        kind: signature!.kind,
        imageDataUrl: signature!.imageDataUrl,
        signedAt: new Date(signature!.signedAt)
      }))
    });
  }

  await createAuditLog(input.tx, {
    tenantId,
    actorUserId: input.parsedActor.userId,
    action: "report.autosaved",
    entityId: input.report.id,
    metadata: {
      status: input.nextStatus ?? "draft",
      deficiencyCount: buildPersistedDeficienciesFromDraft({ draft: input.draft }).length,
      attachmentCount: input.draft.attachments.length
    }
  });

  return input.tx.inspectionReport.findUniqueOrThrow({ where: { id: input.report.id } });
}

export async function getInspectionReportDraft(actor: ActorContext, inspectionId: string, taskId: string) {
  const authorized = await getAuthorizedReport(actor, inspectionId, taskId);
  if (!authorized) {
    return null;
  }

  const { parsedActor, report } = authorized;
  const labeledTasks = withInspectionTaskDisplayLabels(report.inspection.tasks);
  const reportTask = labeledTasks.find((task) => task.id === report.task.id);
  const relatedTasks = labeledTasks.map((task, index) => {
    const siblingDraftResult = task.report?.contentJson ? reportDraftSchema.safeParse(task.report.contentJson) : null;
    const siblingDraft = siblingDraftResult?.success ? siblingDraftResult.data : null;
    const progress = siblingDraft ? buildTaskProgressSummary(siblingDraft) : {
      hasMeaningfulProgress: false,
      completedCount: null,
      totalCount: null,
      percent: null
    };

    return {
      id: task.id,
      inspectionType: task.inspectionType,
      customDisplayLabel: task.customDisplayLabel ?? null,
      displayLabel: task.displayLabel,
      reportStatus: task.report?.status ?? null,
      finalizedAt: task.report?.finalizedAt?.toISOString() ?? null,
      currentTaskIndex: index + 1,
      isCurrent: task.id === report.task.id,
      hasMeaningfulProgress: progress.hasMeaningfulProgress,
      progressCompletedCount: progress.completedCount,
      progressTotalCount: progress.totalCount,
      progressPercent: progress.percent
    };
  });
  const priorReport = await prisma.inspectionReport.findFirst({
    where: {
      tenantId: parsedActor.tenantId as string,
      id: { not: report.id },
      task: { inspectionType: report.task.inspectionType },
      inspection: { siteId: report.inspection.siteId },
      status: reportStatuses.finalized
    },
    orderBy: { finalizedAt: "desc" }
  });

  const assetCount = await prisma.asset.count({
    where: {
      tenantId: parsedActor.tenantId as string,
      siteId: report.inspection.siteId,
      inspectionTypes: { has: report.task.inspectionType }
    }
  });

  const assets = await prisma.asset.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      siteId: report.inspection.siteId,
      inspectionTypes: { has: report.task.inspectionType }
    },
    select: {
      id: true,
      name: true,
      assetTag: true,
      metadata: true
    }
  }) as ReportAssetRecord[];

  const resolvedTemplate = resolveReportTemplate({
    inspectionType: report.task.inspectionType,
    assets
  });
  const tenantBranding = resolveTenantBranding({
    tenantName: report.inspection.tenant.name,
    branding: report.inspection.tenant.branding,
    billingEmail: report.inspection.tenant.billingEmail
  });
  const rawTenantBranding = report.inspection.tenant.branding && typeof report.inspection.tenant.branding === "object"
    ? report.inspection.tenant.branding as Record<string, unknown>
    : {};
  const cityStateZip = [tenantBranding.city, tenantBranding.state, tenantBranding.postalCode]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(", ");
  const userFacingSiteName = getCustomerFacingSiteLabel(report.inspection.site.name) ?? report.inspection.customerCompany.name;

  const draft = buildInitialReportDraft({
    inspectionType: report.task.inspectionType,
    siteName: userFacingSiteName,
    customerName: report.inspection.customerCompany.name,
    scheduledDate: report.inspection.scheduledStart.toISOString(),
    assetCount,
    assets,
    previousDraft: hydrateDraftFromReport(report),
    priorCompletedDraft: priorReport?.contentJson ?? undefined,
    priorReportContext: priorReport
      ? {
          reportId: priorReport.id,
          finalizedAt: priorReport.finalizedAt?.toISOString() ?? priorReport.updatedAt.toISOString()
        }
      : undefined,
    siteDefaults: {
      siteName: userFacingSiteName,
      customerName: report.inspection.customerCompany.name,
      siteAddress: formatCustomerFacingInspectionAddress({
        siteName: report.inspection.site.name,
        siteAddressLine1: report.inspection.site.addressLine1,
        siteAddressLine2: report.inspection.site.addressLine2,
        siteCity: report.inspection.site.city,
        siteState: report.inspection.site.state,
        sitePostalCode: report.inspection.site.postalCode,
        customerServiceAddressLine1: report.inspection.customerCompany.serviceAddressLine1,
        customerServiceAddressLine2: report.inspection.customerCompany.serviceAddressLine2,
        customerServiceCity: report.inspection.customerCompany.serviceCity,
        customerServiceState: report.inspection.customerCompany.serviceState,
        customerServicePostalCode: report.inspection.customerCompany.servicePostalCode,
        customerBillingAddressLine1: report.inspection.customerCompany.billingAddressLine1,
        customerBillingAddressLine2: report.inspection.customerCompany.billingAddressLine2,
        customerBillingCity: report.inspection.customerCompany.billingCity,
        customerBillingState: report.inspection.customerCompany.billingState,
        customerBillingPostalCode: report.inspection.customerCompany.billingPostalCode
      })
    } satisfies Record<string, ReportPrimitiveValue>,
    tenantBrandingDefaults: {
      legalBusinessName: tenantBranding.legalBusinessName,
      phone: tenantBranding.phone,
      email: tenantBranding.email,
      website: tenantBranding.website,
      addressLine1: tenantBranding.addressLine1,
      cityStateZip,
      licenseNumber: typeof rawTenantBranding.licenseNumber === "string" ? rawTenantBranding.licenseNumber : null
    } satisfies Record<string, ReportPrimitiveValue>,
    priorReportSummary: priorReport ? `Previous finalized report completed ${priorReport.finalizedAt?.toISOString() ?? priorReport.updatedAt.toISOString()}.` : ""
  });

  return {
    id: report.id,
    status: report.status,
    correctionState: report.correctionState,
    correctionReason: report.correctionReason,
    correctionRequestedAt: report.correctionRequestedAt?.toISOString() ?? null,
    correctionRequestedByUserId: report.correctionRequestedByUserId ?? null,
    correctionResolvedAt: report.correctionResolvedAt?.toISOString() ?? null,
    updatedAt: report.updatedAt.toISOString(),
    finalizedAt: report.finalizedAt?.toISOString() ?? null,
    inspection: report.inspection,
    task: {
      ...report.task,
      customDisplayLabel: report.task.customDisplayLabel ?? null,
      displayLabel: reportTask?.displayLabel ?? resolvedTemplate.label
    },
    relatedTasks,
    template: resolvedTemplate,
    draft,
    preview: buildReportPreview(draft),
    permissions: {
      canEdit: canEditReport(parsedActor.role, report.status),
      canFinalize: canFinalizeReport(parsedActor.role, report.status)
    }
  };
}

export async function reopenCompletedReportForCorrection(actor: ActorContext, input: {
  inspectionReportId: string;
  correctionMode: "admin_edit" | "reissue_to_technician";
  reason: string;
}) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can correct completed reports.");
  }

  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Add a correction reason before reopening the report.");
  }

  const tenantId = parsedActor.tenantId as string;
  const staleStorageKeys = new Set<string>();

  const reopened = await prisma.$transaction(async (tx) => {
    const report = await tx.inspectionReport.findFirst({
      where: { id: input.inspectionReportId, tenantId },
      include: {
        inspection: { include: { site: { select: { name: true } }, technicianAssignments: { select: { technicianId: true } } } },
        task: true,
        attachments: true,
        signatures: true
      }
    });

    if (!report) {
      throw new Error("Report not found.");
    }

    if (report.status !== reportStatuses.finalized) {
      throw new Error(hasActiveCorrectionState(report.correctionState) ? "This report is already open for correction." : "Only completed reports can be corrected.");
    }

    if (
      input.correctionMode === "reissue_to_technician" &&
      !getInspectionAssignedTechnicianIds({
        assignedTechnicianId: report.inspection.assignedTechnicianId,
        technicianAssignments: readTechnicianAssignments(report.inspection)
      }).length
    ) {
      throw new Error("Assign a technician before re-issuing this report.");
    }

    const priorGeneratedAttachments = report.attachments.filter((attachment) => attachment.kind === AttachmentKind.pdf && attachment.source === "generated");
    priorGeneratedAttachments.forEach((attachment) => staleStorageKeys.add(attachment.storageKey));

    await createReportCorrectionEvent(tx, {
      tenantId,
      reportId: report.id,
      actionType: input.correctionMode === "admin_edit" ? reportCorrectionActionTypes.adminEditOpened : reportCorrectionActionTypes.reissuedToTechnician,
      reason,
      previousStatus: report.status,
      newStatus: reportStatuses.draft,
      snapshotJson: buildCorrectionSnapshot(report),
      actedByUserId: parsedActor.userId
    });

    await tx.inspectionReport.update({
      where: { id: report.id },
      data: {
        status: reportStatuses.draft,
        finalizedAt: null,
        correctionState: input.correctionMode === "admin_edit" ? ReportCorrectionState.admin_edit_in_progress : ReportCorrectionState.reissued_to_technician,
        correctionReason: reason,
        correctionRequestedAt: new Date(),
        correctionRequestedByUserId: parsedActor.userId,
        correctionResolvedAt: null,
        correctionResolvedByUserId: null,
        autosaveVersion: { increment: 1 },
        contentJson: stripCorrectionSensitiveContent(report.contentJson)
      }
    });

    await tx.signature.deleteMany({
      where: { tenantId, inspectionReportId: report.id }
    });

    await tx.attachment.deleteMany({
      where: {
        tenantId,
        inspectionReportId: report.id,
        kind: AttachmentKind.pdf,
        source: "generated"
      } as any
    });

    await tx.inspectionTask.update({
      where: { id: report.inspectionTaskId },
      data: { status: InspectionStatus.in_progress }
    });

    await tx.inspection.update({
      where: { id: report.inspectionId },
      data: { status: InspectionStatus.in_progress }
    });

    await syncInspectionArchiveStateTx(tx, {
      tenantId,
      inspectionId: report.inspectionId,
      completedAtOverride: null,
      archivedAtOverride: null
    });

    await syncInspectionBillingSummaryTx(tx, {
      tenantId,
      inspectionId: report.inspectionId
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: input.correctionMode === "admin_edit" ? "report.admin_edit_opened" : "report.reissued_to_technician",
      entityId: report.id,
      metadata: {
        inspectionId: report.inspectionId,
        inspectionTaskId: report.inspectionTaskId,
        reason
      }
    });

    if (input.correctionMode === "reissue_to_technician") {
      const technicianIds = Array.from(new Set([
        report.task.assignedTechnicianId,
        ...getInspectionAssignedTechnicianIds({
          assignedTechnicianId: report.inspection.assignedTechnicianId,
          technicianAssignments: readTechnicianAssignments(report.inspection)
        })
      ].filter((value): value is string => Boolean(value))));

      for (const userId of technicianIds) {
        await createInspectionCorrectionReissuedNotificationTx(tx, {
          tenantId,
          userId,
          inspectionId: report.inspectionId,
          taskId: report.inspectionTaskId,
          reportId: report.id,
          siteName: report.inspection.site.name
        });
      }
    }

    return {
      reportId: report.id,
      inspectionId: report.inspectionId,
      inspectionTaskId: report.inspectionTaskId,
      correctionState: input.correctionMode === "admin_edit" ? ReportCorrectionState.admin_edit_in_progress : ReportCorrectionState.reissued_to_technician
    };
  });

  await Promise.all([...staleStorageKeys].map((storageKey) => deleteStoredFile(storageKey)));

  return reopened;
}

export async function saveReportDraft(actor: ActorContext, input: {
  inspectionReportId: string;
  contentJson: unknown;
  taskDisplayLabel?: string | null;
}) {
  const { parsedActor, report } = await getAuthorizedEditableReport(actor, input.inspectionReportId);

  if (!canEditReport(parsedActor.role, report.status)) {
    throw new Error("This report is locked.");
  }

  const assets = await prisma.asset.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      siteId: report.inspection.siteId,
      inspectionTypes: { has: report.task.inspectionType }
    },
    select: {
      id: true,
      name: true,
      assetTag: true,
      metadata: true
    }
  }) as ReportAssetRecord[];

  const validatedDraft = validateDraftForTemplate(input.contentJson, report.task.inspectionType, assets);
  const persisted = await persistDraftMedia({
    tenantId: parsedActor.tenantId as string,
    draft: validatedDraft,
    existingAttachmentKeys: report.attachments.filter((attachment) => attachment.kind === AttachmentKind.photo).map((attachment) => attachment.storageKey),
    existingSignatureKeys: report.signatures.map((signature) => signature.imageDataUrl)
  });
  const parsedDraft = persisted.draft;
  const nextTaskDisplayLabel = input.taskDisplayLabel?.trim() || null;

  const updatedReport = await prisma.$transaction((tx) =>
    persistReportDraftTransaction({
      tx,
      parsedActor,
      report,
      draft: parsedDraft,
      taskDisplayLabel: nextTaskDisplayLabel,
      nextStatus: reportStatuses.draft
    })
  );

  await Promise.all(persisted.staleStorageKeys.map((storageKey) => deleteStoredFile(storageKey)));

  return updatedReport;
}

function buildGeneratedPdfName(report: { inspection: { customerCompany: { name: string }; site: { name: string } }; task: { inspectionType: string } }) {
  const customerFacingSiteName = getCustomerFacingSiteLabel(report.inspection.site.name);
  return [
    slugifyFileName(report.inspection.customerCompany.name),
    customerFacingSiteName ? slugifyFileName(customerFacingSiteName) : null,
    slugifyFileName(report.task.inspectionType),
    "report.pdf"
  ].filter(Boolean).join("-");
}

type GeneratedPdfAttachmentRecord = {
  kind: AttachmentKind;
  source: string;
  storageKey: string;
};

type GeneratedPdfSignatureRecord = {
  kind: SignatureKind;
};

async function replaceGeneratedReportPdfTx(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    report: any;
  }
) {
  const { generateInspectionReportPdf } = await import("./pdf-report");
  const draft = reportDraftSchema.parse(input.report.contentJson ?? {});
  const priorGeneratedAttachments = input.report.attachments.filter(
    (attachment: GeneratedPdfAttachmentRecord) => attachment.kind === AttachmentKind.pdf && attachment.source === "generated"
  );
  const technicianSignature = input.report.signatures.find(
    (signature: GeneratedPdfSignatureRecord) => signature.kind === SignatureKind.technician
  ) ?? null;
  const customerSignature = input.report.signatures.find(
    (signature: GeneratedPdfSignatureRecord) => signature.kind === SignatureKind.customer
  ) ?? null;
  const photoAttachments = input.report.attachments.filter(
    (attachment: GeneratedPdfAttachmentRecord) => attachment.kind === AttachmentKind.photo
  );
  const customerFacingSiteName = getCustomerFacingSiteLabel(input.report.inspection.site.name);
  const customerFacingAddress = getCustomerFacingInspectionAddress({
    siteName: input.report.inspection.site.name,
    siteAddressLine1: input.report.inspection.site.addressLine1,
    siteAddressLine2: input.report.inspection.site.addressLine2,
    siteCity: input.report.inspection.site.city,
    siteState: input.report.inspection.site.state,
    sitePostalCode: input.report.inspection.site.postalCode,
    customerServiceAddressLine1: input.report.inspection.customerCompany.serviceAddressLine1,
    customerServiceAddressLine2: input.report.inspection.customerCompany.serviceAddressLine2,
    customerServiceCity: input.report.inspection.customerCompany.serviceCity,
    customerServiceState: input.report.inspection.customerCompany.serviceState,
    customerServicePostalCode: input.report.inspection.customerCompany.servicePostalCode,
    customerBillingAddressLine1: input.report.inspection.customerCompany.billingAddressLine1,
    customerBillingAddressLine2: input.report.inspection.customerCompany.billingAddressLine2,
    customerBillingCity: input.report.inspection.customerCompany.billingCity,
    customerBillingState: input.report.inspection.customerCompany.billingState,
    customerBillingPostalCode: input.report.inspection.customerCompany.billingPostalCode
  });
  const pdfBytes = await generateInspectionReportPdf({
    tenant: { name: input.report.tenant.name, branding: input.report.tenant.branding },
    customerCompany: input.report.inspection.customerCompany as any,
    site: {
      ...input.report.inspection.site,
      name: customerFacingSiteName ?? "",
      addressLine1: customerFacingAddress.addressLine1,
      addressLine2: customerFacingAddress.addressLine2,
      city: customerFacingAddress.city,
      state: customerFacingAddress.state,
      postalCode: customerFacingAddress.postalCode
    },
    inspection: input.report.inspection as any,
    task: input.report.task as any,
    report: {
      id: input.report.id,
      finalizedAt: input.report.finalizedAt,
      technicianName: input.report.technician?.name ?? null
    },
    draft,
    deficiencies: input.report.deficiencies as any,
    photos: photoAttachments,
    technicianSignature,
    customerSignature
  });

  const pdfPayload = await buildStoredFilePayload({
    tenantId: input.tenantId,
    category: "generated-pdf",
    fileName: buildGeneratedPdfName(input.report as any),
    mimeType: "application/pdf",
    bytes: pdfBytes
  });

  await tx.attachment.deleteMany({
    where: {
      tenantId: input.tenantId,
      inspectionReportId: input.report.id,
      kind: AttachmentKind.pdf,
      source: "generated"
    } as any
  });

  const generatedAttachment = await tx.attachment.create({
    data: {
      tenantId: input.tenantId,
      inspectionId: input.report.inspectionId,
      inspectionReportId: input.report.id,
      kind: AttachmentKind.pdf,
      source: "generated",
      fileName: pdfPayload.fileName,
      mimeType: pdfPayload.mimeType,
      storageKey: pdfPayload.storageKey,
      customerVisible: true
    } as any
  });

  return {
    generatedAttachment,
    priorGeneratedKeys: priorGeneratedAttachments.map((attachment: GeneratedPdfAttachmentRecord) => attachment.storageKey)
  };
}

export async function finalizeInspectionReport(actor: ActorContext, input: {
  inspectionReportId: string;
  contentJson: unknown;
  taskDisplayLabel?: string | null;
}) {
  const { parsedActor, report } = await getAuthorizedEditableReport(actor, input.inspectionReportId);

  if (!canFinalizeReport(parsedActor.role, report.status)) {
    throw new Error("This report cannot be finalized.");
  }

  const assets = await prisma.asset.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      siteId: report.inspection.siteId,
      inspectionTypes: { has: report.task.inspectionType }
    },
    select: {
      id: true,
      name: true,
      assetTag: true,
      metadata: true
    }
  }) as ReportAssetRecord[];

  const validatedDraft = validateDraftForTemplate(input.contentJson, report.task.inspectionType, assets);
  validateFinalizationDraft(validatedDraft, assets);
  const nextTaskDisplayLabel = input.taskDisplayLabel?.trim() || null;
  const staleStorageKeys = new Set<string>();
  let priorGeneratedKeys: string[] = [];

  const finalized = await prisma.$transaction(async (tx) => {
    const transactionalReport = await tx.inspectionReport.findFirst({
      where: { id: report.id, tenantId: parsedActor.tenantId as string },
      include: { inspection: true, task: true, attachments: true, signatures: true }
    });

    if (!transactionalReport) {
      throw new Error("Report not found.");
    }

    if (!canFinalizeReport(parsedActor.role, transactionalReport.status)) {
      throw new Error("This report cannot be finalized.");
    }

    const priorCorrectionState = transactionalReport.correctionState;
    const priorCorrectionReason = transactionalReport.correctionReason;

    const persisted = await persistDraftMedia({
      tenantId: parsedActor.tenantId as string,
      draft: validatedDraft,
      existingAttachmentKeys: transactionalReport.attachments.filter((attachment) => attachment.kind === AttachmentKind.photo).map((attachment) => attachment.storageKey),
      existingSignatureKeys: transactionalReport.signatures.map((signature) => signature.imageDataUrl)
    });
    persisted.staleStorageKeys.forEach((storageKey) => staleStorageKeys.add(storageKey));

    await persistReportDraftTransaction({
      tx,
      parsedActor,
      report: transactionalReport,
      draft: persisted.draft,
      taskDisplayLabel: nextTaskDisplayLabel,
      nextStatus: reportStatuses.draft
    });

    const finalizedAt = new Date();
    const finalizeResult = await tx.inspectionReport.updateMany({
      where: { id: report.id, tenantId: parsedActor.tenantId as string, status: { not: reportStatuses.finalized } },
      data: {
        status: reportStatuses.finalized,
        finalizedAt
      }
    });

    if (finalizeResult.count !== 1) {
      throw new Error("This report was already finalized by another action.");
    }

    const finalized = await tx.inspectionReport.findUniqueOrThrow({
      where: { id: report.id },
      include: {
        tenant: true,
        inspection: {
          include: {
            site: true,
            customerCompany: true
          }
        },
        task: true,
        technician: true,
        attachments: true,
        signatures: true,
        deficiencies: true
      }
    });

    const pdfResult = await replaceGeneratedReportPdfTx(tx, {
      tenantId: parsedActor.tenantId as string,
      report: finalized as any
    });
    priorGeneratedKeys = pdfResult.priorGeneratedKeys;
    const generatedAttachment = pdfResult.generatedAttachment;

    await tx.inspectionTask.update({
      where: { id: report.inspectionTaskId },
      data: { status: "completed" }
    });

    const remainingDrafts = await tx.inspectionReport.count({
      where: {
        tenantId: parsedActor.tenantId as string,
        inspectionId: report.inspectionId,
        status: { not: reportStatuses.finalized }
      }
    });

    const pendingRequiredInspectionDocuments = await tx.inspectionDocument.count({
      where: {
        tenantId: parsedActor.tenantId as string,
        inspectionId: report.inspectionId,
        requiresSignature: true,
        status: {
          notIn: [InspectionDocumentStatus.SIGNED, InspectionDocumentStatus.EXPORTED]
        }
      }
    });

    if (remainingDrafts === 0 && pendingRequiredInspectionDocuments === 0) {
      await tx.inspection.update({
        where: { id: report.inspectionId },
        data: {
          status: "completed",
          isPriority: false,
          priorityClearedAt: new Date()
        }
      });

      await syncInspectionArchiveStateTx(tx, {
        tenantId: parsedActor.tenantId as string,
        inspectionId: report.inspectionId,
        completedAtOverride: finalizedAt,
        archivedAtOverride: finalizedAt
      });
    }

    await syncInspectionBillingSummaryTx(tx, {
      tenantId: parsedActor.tenantId as string,
      inspectionId: report.inspectionId
    });

    await createAuditLog(tx, {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "report.finalized",
      entityId: report.id,
      metadata: {
        inspectionId: report.inspectionId,
        inspectionTaskId: report.inspectionTaskId,
        generatedAttachmentId: generatedAttachment.id
      }
    });

    if (remainingDrafts === 0 && pendingRequiredInspectionDocuments === 0 && finalized.inspection.isPriority) {
      await createAuditLog(tx, {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "inspection.priority_cleared_automatically",
        entityId: report.inspectionId,
        metadata: {
          previousPriority: true,
          nextPriority: false,
          reason: "Priority cleared automatically when inspection was marked Completed."
        }
      });
    }

    if (hasActiveCorrectionState(priorCorrectionState)) {
      await tx.inspectionReport.update({
        where: { id: report.id },
        data: {
          correctionState: ReportCorrectionState.none,
          correctionResolvedAt: finalizedAt,
          correctionResolvedByUserId: parsedActor.userId
        }
      });

      await createReportCorrectionEvent(tx, {
        tenantId: parsedActor.tenantId as string,
        reportId: report.id,
        actionType: priorCorrectionState === ReportCorrectionState.reissued_to_technician ? reportCorrectionActionTypes.recompleted : reportCorrectionActionTypes.adminEdited,
        reason: priorCorrectionReason,
        previousStatus: reportStatuses.draft,
        newStatus: reportStatuses.finalized,
        actedByUserId: parsedActor.userId
      });

      await createAuditLog(tx, {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: priorCorrectionState === ReportCorrectionState.reissued_to_technician ? "report.recompleted" : "report.admin_correction_completed",
        entityId: report.id,
        metadata: {
          inspectionId: report.inspectionId,
          inspectionTaskId: report.inspectionTaskId,
          correctionState: priorCorrectionState,
          reason: priorCorrectionReason
        }
      });
    }

    return finalized;
  }, { timeout: 20_000 });

  await Promise.all([
    ...[...staleStorageKeys].map((storageKey) => deleteStoredFile(storageKey)),
    ...priorGeneratedKeys.map((storageKey) => deleteStoredFile(storageKey))
  ]);

  return finalized;
}

export async function regenerateFinalizedReportPdf(actor: ActorContext, input: {
  inspectionReportId: string;
}) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can regenerate completed report PDFs.");
  }

  let priorGeneratedKeys: string[] = [];

  const regenerated = await prisma.$transaction(async (tx) => {
    const report = await tx.inspectionReport.findFirst({
      where: {
        id: input.inspectionReportId,
        tenantId: parsedActor.tenantId as string
      },
      include: {
        tenant: true,
        inspection: {
          include: {
            site: true,
            customerCompany: true
          }
        },
        task: true,
        technician: true,
        attachments: true,
        signatures: true,
        deficiencies: true
      }
    });

    if (!report) {
      throw new Error("Report not found.");
    }

    if (report.status !== reportStatuses.finalized || !report.finalizedAt) {
      throw new Error("Only finalized reports can be regenerated.");
    }

    const pdfResult = await replaceGeneratedReportPdfTx(tx, {
      tenantId: parsedActor.tenantId as string,
      report: report as any
    });
    priorGeneratedKeys = pdfResult.priorGeneratedKeys;

    await createAuditLog(tx, {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "report.pdf_regenerated",
      entityId: report.id,
      metadata: {
        inspectionId: report.inspectionId,
        inspectionTaskId: report.inspectionTaskId,
        generatedAttachmentId: pdfResult.generatedAttachment.id,
        pdfVersion: "v2"
      }
    });

    return {
      reportId: report.id,
      inspectionId: report.inspectionId,
      inspectionTaskId: report.inspectionTaskId,
      generatedAttachmentId: pdfResult.generatedAttachment.id
    };
  }, { timeout: 20_000 });

  await Promise.all(priorGeneratedKeys.map((storageKey) => deleteStoredFile(storageKey)));

  return regenerated;
}

const MAX_UPLOADED_PDF_BYTES = 12 * 1024 * 1024;

export async function uploadInspectionPdfAttachment(actor: ActorContext, input: {
  inspectionId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  customerVisible?: boolean;
}) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can upload inspection PDFs.");
  }

  await assertTenantEntitlementForTenant(parsedActor.tenantId as string, "uploadedInspectionPdfs", "Uploaded inspection PDFs require a Professional or Enterprise subscription.");

  if (input.mimeType !== "application/pdf") {
    throw new Error("Only PDF files are supported.");
  }

  if (!input.fileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Uploaded inspection packets must use a .pdf file name.");
  }

  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_UPLOADED_PDF_BYTES) {
    throw new Error("PDF uploads must be between 1 byte and 12 MB.");
  }

  const inspection = await prisma.inspection.findFirst({
    where: { id: input.inspectionId, tenantId: parsedActor.tenantId as string }
  });

  if (!inspection) {
    throw new Error("Inspection not found.");
  }

  const payload = await buildStoredFilePayload({
    tenantId: parsedActor.tenantId as string,
    category: "uploaded-pdf",
    fileName: input.fileName,
    mimeType: input.mimeType,
    bytes: input.bytes
  });

  return prisma.$transaction(async (tx) => {
    const attachment = await tx.attachment.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        inspectionId: input.inspectionId,
        kind: AttachmentKind.pdf,
        source: "uploaded",
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        storageKey: payload.storageKey,
        customerVisible: input.customerVisible ?? true
      } as any
    });

    await createAuditLog(tx, {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "attachment.uploaded",
      entityId: attachment.id,
      metadata: {
        inspectionId: input.inspectionId,
        customerVisible: input.customerVisible ?? true
      }
    });

    return attachment;
  });
}

export async function registerInspectionPdfAttachmentUpload(actor: ActorContext, input: {
  inspectionId: string;
  fileName: string;
  mimeType: string;
  blobPathname: string;
  customerVisible?: boolean;
}) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can upload inspection PDFs.");
  }

  await assertTenantEntitlementForTenant(parsedActor.tenantId as string, "uploadedInspectionPdfs", "Uploaded inspection PDFs require a Professional or Enterprise subscription.");

  if (input.mimeType !== "application/pdf") {
    throw new Error("Only PDF files are supported.");
  }

  if (!input.fileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Uploaded inspection packets must use a .pdf file name.");
  }

  const storageKey = buildBlobStorageKey(input.blobPathname);
  assertStorageKeyBelongsToTenant(storageKey, parsedActor.tenantId as string);
  assertStorageKeyCategory(storageKey, ["uploaded-pdf"]);

  const inspection = await prisma.inspection.findFirst({
    where: { id: input.inspectionId, tenantId: parsedActor.tenantId as string }
  });

  if (!inspection) {
    throw new Error("Inspection not found.");
  }

  return prisma.$transaction(async (tx) => {
    const attachment = await tx.attachment.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        inspectionId: input.inspectionId,
        kind: AttachmentKind.pdf,
        source: "uploaded",
        fileName: input.fileName,
        mimeType: input.mimeType,
        storageKey,
        customerVisible: input.customerVisible ?? true
      } as any
    });

    await createAuditLog(tx, {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "attachment.uploaded",
      entityId: attachment.id,
      metadata: {
        inspectionId: input.inspectionId,
        customerVisible: input.customerVisible ?? true,
        transport: "direct_blob_upload"
      }
    });

    return attachment;
  });
}

export async function getInspectionPdfAttachments(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  await prisma.inspection.findFirstOrThrow({
    where: { id: inspectionId, tenantId: parsedActor.tenantId as string }
  });

  return prisma.attachment.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      inspectionId,
      kind: AttachmentKind.pdf
    } as any,
    orderBy: { createdAt: "desc" }
  });
}

export async function getCustomerPortalData(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  const customerCompanyId = await getAuthorizedCustomerCompanyId(parsedActor);

  const tenant = await prisma.tenant.findFirst({ where: { id: parsedActor.tenantId as string } });

  const [customerCompany, customerSites, reportCount, openDeficiencyCount, recentInspections] = await Promise.all([
    prisma.customerCompany.findFirst({ where: { id: customerCompanyId as string, tenantId: parsedActor.tenantId as string }, select: { name: true } }),
    prisma.site.findMany({ where: { tenantId: parsedActor.tenantId as string, customerCompanyId: customerCompanyId as string }, select: { name: true } }),
    prisma.inspectionReport.count({ where: { tenantId: parsedActor.tenantId as string, status: reportStatuses.finalized, inspection: { customerCompanyId: customerCompanyId as string } } }),
    prisma.deficiency.count({ where: { tenantId: parsedActor.tenantId as string, status: "open", inspectionReport: { status: reportStatuses.finalized, inspection: { customerCompanyId: customerCompanyId as string } } } }),
    prisma.inspection.findMany({
      where: {
        tenantId: parsedActor.tenantId as string,
        customerCompanyId: customerCompanyId as string,
        reports: { some: { status: reportStatuses.finalized } }
      },
      include: {
        site: true,
        tasks: {
          include: {
            report: {
              select: {
                id: true,
                status: true,
                finalizedAt: true
              }
            }
          }
        },
        attachments: { where: { kind: AttachmentKind.pdf, customerVisible: true } as any, orderBy: { createdAt: "desc" } },
        documents: {
          where: {
            customerVisible: true,
            OR: [
              { requiresSignature: false },
              { requiresSignature: true, signedStorageKey: { not: null }, status: { in: [InspectionDocumentStatus.SIGNED, InspectionDocumentStatus.EXPORTED] } }
            ]
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { scheduledStart: "desc" },
      take: 12
    })
  ]);

  const inspectionPackets = recentInspections.map((inspection) => {
    const finalizedReports = inspection.tasks
      .map((task) => task.report)
      .filter((report): report is NonNullable<(typeof inspection.tasks)[number]["report"]> => Boolean(report && report.status === reportStatuses.finalized));
    const latestFinalizedAt = finalizedReports
      .map((report) => report.finalizedAt ?? null)
      .filter((value): value is Date => value instanceof Date)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? inspection.scheduledStart;

    return {
      id: inspection.id,
      scheduledStart: inspection.scheduledStart,
      latestFinalizedAt,
      site: inspection.site,
      taskTypes: withInspectionTaskDisplayLabels(inspection.tasks)
        .filter((task) => task.report?.status === reportStatuses.finalized)
        .map((task) => ({
          id: task.id,
          inspectionType: task.inspectionType,
          displayLabel: task.displayLabel
        })),
      packetDocuments: buildInspectionPacketDocuments({
        attachments: inspection.attachments,
        inspectionDocuments: inspection.documents.map((document) => ({
          ...document,
          uploadedAt: document.createdAt
        }))
      })
    };
  });

  return {
    tenantName: tenant?.name ?? "",
    customerName: customerCompany?.name ?? "",
    branding: resolveTenantBranding({ tenantName: tenant?.name ?? "", branding: tenant?.branding ?? {}, billingEmail: tenant?.billingEmail ?? null }),
    siteCount: customerSites.filter((site) => getCustomerFacingSiteLabel(site.name)).length,
    reportCount,
    openDeficiencyCount,
    inspectionPackets
  };
}

export async function getCustomerReportDetail(actor: ActorContext, reportId: string) {
  const parsedActor = parseActor(actor);
  const customerCompanyId = await getAuthorizedCustomerCompanyId(parsedActor);
  const report = await prisma.inspectionReport.findFirst({
    where: {
      id: reportId,
      tenantId: parsedActor.tenantId as string,
      status: reportStatuses.finalized,
      inspection: { customerCompanyId: customerCompanyId as string }
    },
    include: {
      inspection: {
        include: {
          site: true,
          customerCompany: true,
          tenant: true
        }
      },
      task: true,
      technician: true,
      attachments: {
        where: { kind: AttachmentKind.pdf, customerVisible: true } as any,
        orderBy: { createdAt: "desc" }
      },
      deficiencies: true,
      signatures: true
    }
  });

  if (!report) {
    return null;
  }

  const inspectionAttachments = await prisma.attachment.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      inspectionId: report.inspectionId,
      kind: AttachmentKind.pdf,
      customerVisible: true
    } as any,
    orderBy: { createdAt: "desc" }
  });
  const inspectionDocuments = await prisma.inspectionDocument.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      inspectionId: report.inspectionId,
      customerVisible: true,
      OR: [
        { requiresSignature: false },
        { requiresSignature: true, signedStorageKey: { not: null }, status: { in: [InspectionDocumentStatus.SIGNED, InspectionDocumentStatus.EXPORTED] } }
      ]
    },
    orderBy: { createdAt: "desc" }
  });

  const draft = reportDraftSchema.parse(report.contentJson ?? {});
  const packetDocuments = buildInspectionPacketDocuments({
    reports: [
      {
        id: report.id,
        title: resolveReportTemplate({ inspectionType: report.task.inspectionType }).label,
        happenedAt: report.finalizedAt,
        customerVisible: true,
        viewPath: `/app/customer/reports/${report.id}`
      }
    ],
    attachments: [...report.attachments, ...inspectionAttachments],
    inspectionDocuments: inspectionDocuments.map((document) => ({
      ...document,
      uploadedAt: document.createdAt
    }))
  });
  return {
    report,
    template: resolveReportTemplate({ inspectionType: report.task.inspectionType }),
    draft,
    inspectionAttachments,
    inspectionDocuments,
    packetDocuments
  };
}

export async function getCustomerInspectionPacketDetail(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  const customerCompanyId = await getAuthorizedCustomerCompanyId(parsedActor);

  const inspection = await prisma.inspection.findFirst({
    where: {
      id: inspectionId,
      tenantId: parsedActor.tenantId as string,
      customerCompanyId: customerCompanyId as string,
      reports: { some: { status: reportStatuses.finalized } }
    },
    include: {
      site: true,
      customerCompany: true,
      attachments: {
        where: { kind: AttachmentKind.pdf, customerVisible: true } as any,
        orderBy: { createdAt: "desc" }
      },
      documents: {
        where: {
          customerVisible: true,
          OR: [
            { requiresSignature: false },
            { requiresSignature: true, signedStorageKey: { not: null }, status: { in: [InspectionDocumentStatus.SIGNED, InspectionDocumentStatus.EXPORTED] } }
          ]
        },
        orderBy: { createdAt: "desc" }
      },
      tasks: {
        include: {
          report: {
            include: {
              attachments: {
                where: { kind: AttachmentKind.pdf, customerVisible: true } as any,
                orderBy: { createdAt: "desc" }
              }
            }
          }
        }
      }
    }
  });

  if (!inspection) {
    return null;
  }

  const reportSummaries = withInspectionTaskDisplayLabels(inspection.tasks)
    .filter((task) => task.report?.status === reportStatuses.finalized)
    .map((task) => ({
      id: task.report!.id,
      taskId: task.id,
      inspectionType: task.inspectionType,
      displayLabel: task.displayLabel,
      finalizedAt: task.report!.finalizedAt,
      href: `/app/customer/reports/${task.report!.id}`
    }));

  const reportAttachments = inspection.tasks
    .filter((task) => task.report?.status === reportStatuses.finalized)
    .flatMap((task) => task.report?.attachments ?? []);
  const packetDocuments = buildInspectionPacketDocuments({
    reports: reportSummaries.map((report) => ({
      id: report.id,
      title: report.displayLabel,
      happenedAt: report.finalizedAt,
      customerVisible: true,
      viewPath: report.href
    })),
    attachments: [...inspection.attachments, ...reportAttachments],
    inspectionDocuments: inspection.documents.map((document) => ({
      ...document,
      uploadedAt: document.createdAt
    }))
  });

  return {
    inspection,
    reportSummaries,
    packetDocuments
  };
}

export async function getAuthorizedReportMediaDownload(actor: ActorContext, input: { inspectionReportId: string; storageKey: string }) {
  const parsedActor = parseActor(actor);
  if (parsedActor.role === "customer_user") {
    throw new Error("Customer users cannot access raw report media.");
  }

  const report = await prisma.inspectionReport.findFirst({
    where: {
      id: input.inspectionReportId,
      tenantId: parsedActor.tenantId as string
    },
    include: {
      inspection: true
    }
  });

  if (!report) {
    throw new Error("Report not found.");
  }

  const content = reportDraftSchema.parse(report.contentJson ?? {});
  const allowedStorageKeys = new Set([
    ...content.attachments.map((attachment) => attachment.storageKey),
    ...Object.values(content.signatures).flatMap((signature) => (signature?.imageDataUrl ? [signature.imageDataUrl] : []))
  ]);

  if (!allowedStorageKeys.has(input.storageKey)) {
    throw new Error("Stored media not found on this report.");
  }

  assertStorageKeyBelongsToTenant(input.storageKey, report.tenantId);
  assertStorageKeyCategory(input.storageKey, ["photo", "signature"]);

  const allowed = canActorAccessAttachmentDownload({
    actorRole: parsedActor.role,
    actorTenantId: parsedActor.tenantId,
    actorUserId: parsedActor.userId,
    attachmentTenantId: report.tenantId,
    inspectionCustomerCompanyId: report.inspection.customerCompanyId,
    inspectionAssignedTechnicianId: report.inspection.assignedTechnicianId,
    inspectionAssignedTechnicianIds: getInspectionAssignedTechnicianIds({
      assignedTechnicianId: report.inspection.assignedTechnicianId,
      technicianAssignments: readTechnicianAssignments(report.inspection)
    }),
    attachmentCustomerVisible: false,
    reportStatus: report.status
  });

  if (!allowed) {
    throw new Error("You do not have access to this report media.");
  }

  return buildFileDownloadResponse({
    storageKey: input.storageKey,
    fileName: "report-media",
    fallbackMimeType: "image/png"
  });
}

export async function getAuthorizedAttachmentDownload(actor: ActorContext, attachmentId: string) {
  const parsedActor = parseActor(actor);
  const actorCustomerCompanyId = await getAuthorizedCustomerCompanyId(parsedActor);

  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId }
  });

  if (!attachment) {
    throw new Error("Attachment not found.");
  }

  const relatedReport = attachment.inspectionReportId
    ? await prisma.inspectionReport.findFirst({
        where: { id: attachment.inspectionReportId },
        include: { inspection: { include: { technicianAssignments: { select: { technicianId: true } } } } }
      })
    : null;
  const relatedInspection = (attachment as any).inspectionId
    ? await prisma.inspection.findFirst({ where: { id: (attachment as any).inspectionId }, include: { technicianAssignments: { select: { technicianId: true } } } })
    : null;
  const inspection = relatedReport?.inspection ?? relatedInspection;

  const allowed = canActorAccessAttachmentDownload({
    actorRole: parsedActor.role,
    actorTenantId: parsedActor.tenantId,
    actorUserId: parsedActor.userId,
    actorCustomerCompanyId,
    attachmentTenantId: attachment.tenantId,
    inspectionCustomerCompanyId: inspection?.customerCompanyId ?? null,
    inspectionAssignedTechnicianId: inspection?.assignedTechnicianId ?? null,
    inspectionAssignedTechnicianIds: inspection
      ? getInspectionAssignedTechnicianIds({
          assignedTechnicianId: inspection.assignedTechnicianId,
          technicianAssignments: readTechnicianAssignments(inspection)
        })
      : [],
    attachmentCustomerVisible: (attachment as any).customerVisible ?? false,
    reportStatus: relatedReport?.status ?? null
  });

  if (!allowed) {
    throw new Error("You do not have access to this attachment.");
  }

  assertStorageKeyBelongsToTenant(attachment.storageKey, attachment.tenantId);
  assertStorageKeyCategory(attachment.storageKey, ["generated-pdf", "uploaded-pdf"]);

  return buildFileDownloadResponse({
    storageKey: attachment.storageKey,
    fileName: attachment.fileName,
    fallbackMimeType: attachment.mimeType
  });
}

export async function getAdminInspectionPdfAttachments(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can view inspection attachments.");
  }

  return getInspectionPdfAttachments(actor, inspectionId);
}
