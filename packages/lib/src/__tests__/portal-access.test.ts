import { describe, expect, it } from "vitest";
import { reportStatuses } from "@testworx/types";
import { InspectionDocumentStatus } from "@prisma/client";

import { buildInspectionPacketDocuments, canActorAccessAttachmentDownload, canCustomerAccessReport } from "../report-service";

describe("customer portal access controls", () => {
  it("allows finalized reports only for the matching customer company", () => {
    expect(
      canCustomerAccessReport({
        actorTenantId: "tenant_1",
        reportTenantId: "tenant_1",
        actorCustomerCompanyId: "customer_1",
        reportCustomerCompanyId: "customer_1",
        reportStatus: reportStatuses.finalized
      })
    ).toBe(true);

    expect(
      canCustomerAccessReport({
        actorTenantId: "tenant_1",
        reportTenantId: "tenant_1",
        actorCustomerCompanyId: "customer_2",
        reportCustomerCompanyId: "customer_1",
        reportStatus: reportStatuses.finalized
      })
    ).toBe(false);

    expect(
      canCustomerAccessReport({
        actorTenantId: "tenant_1",
        reportTenantId: "tenant_1",
        actorCustomerCompanyId: "customer_1",
        reportCustomerCompanyId: "customer_1",
        reportStatus: reportStatuses.draft
      })
    ).toBe(false);
  });

  it("keeps attachment downloads scoped by role, tenant, and customer visibility", () => {
    expect(
      canActorAccessAttachmentDownload({
        actorRole: "office_admin",
        actorTenantId: "tenant_1",
        actorUserId: "user_1",
        attachmentTenantId: "tenant_1",
        inspectionCustomerCompanyId: "customer_1",
        inspectionAssignedTechnicianId: "tech_1",
        attachmentCustomerVisible: false,
        reportStatus: reportStatuses.draft
      })
    ).toBe(true);

    expect(
      canActorAccessAttachmentDownload({
        actorRole: "technician",
        actorTenantId: "tenant_1",
        actorUserId: "tech_1",
        attachmentTenantId: "tenant_1",
        inspectionCustomerCompanyId: "customer_1",
        inspectionAssignedTechnicianId: "tech_1",
        attachmentCustomerVisible: false,
        reportStatus: reportStatuses.draft
      })
    ).toBe(true);

    expect(
      canActorAccessAttachmentDownload({
        actorRole: "technician",
        actorTenantId: "tenant_1",
        actorUserId: "tech_2",
        attachmentTenantId: "tenant_1",
        inspectionCustomerCompanyId: "customer_1",
        inspectionAssignedTechnicianId: "tech_1",
        attachmentCustomerVisible: false,
        reportStatus: reportStatuses.draft
      })
    ).toBe(false);

    expect(
      canActorAccessAttachmentDownload({
        actorRole: "customer_user",
        actorTenantId: "tenant_1",
        actorUserId: "customer_user_1",
        actorCustomerCompanyId: "customer_1",
        attachmentTenantId: "tenant_1",
        inspectionCustomerCompanyId: "customer_1",
        inspectionAssignedTechnicianId: "tech_1",
        attachmentCustomerVisible: true,
        reportStatus: reportStatuses.finalized
      })
    ).toBe(true);

    expect(
      canActorAccessAttachmentDownload({
        actorRole: "customer_user",
        actorTenantId: "tenant_1",
        actorUserId: "customer_user_1",
        actorCustomerCompanyId: "customer_1",
        attachmentTenantId: "tenant_1",
        inspectionCustomerCompanyId: "customer_2",
        inspectionAssignedTechnicianId: "tech_1",
        attachmentCustomerVisible: true,
        reportStatus: reportStatuses.finalized
      })
    ).toBe(false);
  });

  it("builds a completed inspection packet with report PDFs, signed documents, and other PDFs", () => {
    const documents = buildInspectionPacketDocuments({
      attachments: [
        {
          id: "attachment_report",
          fileName: "kitchen-hood-report.pdf",
          source: "generated",
          createdAt: new Date("2026-04-02T15:00:00.000Z"),
          customerVisible: true
        },
        {
          id: "attachment_uploaded",
          fileName: "inspection-summary.pdf",
          source: "uploaded",
          createdAt: new Date("2026-04-02T14:00:00.000Z"),
          customerVisible: true
        }
      ],
      inspectionDocuments: [
        {
          id: "document_signed",
          fileName: "customer-authorization.pdf",
          label: "Signed customer authorization",
          requiresSignature: true,
          status: InspectionDocumentStatus.SIGNED,
          uploadedAt: new Date("2026-04-02T13:00:00.000Z"),
          signedAt: new Date("2026-04-02T16:00:00.000Z"),
          signedStorageKey: "blob:tenant_1/inspection-document-signed/customer-authorization-signed.pdf",
          customerVisible: true
        }
      ]
    });

    expect(documents.map((document) => document.category)).toEqual([
      "signed_document",
      "report_pdf",
      "inspection_pdf"
    ]);
    expect(documents.map((document) => document.categoryLabel)).toEqual([
      "Signed inspection documents",
      "Report PDFs",
      "Other inspection PDFs"
    ]);
    expect(documents.map((document) => document.downloadPath)).toEqual([
      "/api/inspection-documents/document_signed",
      "/api/attachments/attachment_report",
      "/api/attachments/attachment_uploaded"
    ]);
  });
});
