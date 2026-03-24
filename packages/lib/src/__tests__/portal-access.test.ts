import { describe, expect, it } from "vitest";
import { reportStatuses } from "@testworx/types";

import { canActorAccessAttachmentDownload, canCustomerAccessReport } from "../report-service";

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
});
