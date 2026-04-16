import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, RecurrenceFrequency } from "@prisma/client";
import { reportStatuses } from "@testworx/types";
import { hash } from "bcryptjs";

import { buildInitialReportDraft, createInspectionAmendment, finalizeInspectionReport, claimInspection, reopenCompletedReportForCorrection } from "..";
import { inspectionTypeRegistry } from "../report-config";

const prisma = new PrismaClient();
const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDatabase = hasDatabase ? describe : describe.skip;
const createdTenantIds = new Set<string>();

function uniqueValue(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10_000)}`;
}

async function cleanupTenant(tenantId: string) {
  await prisma.stripeWebhookEvent.deleteMany({ where: { tenantId } });
  await prisma.inspectionAmendment.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.reportCorrectionEvent.deleteMany({ where: { tenantId } });
  await prisma.deficiency.deleteMany({ where: { tenantId } });
  await prisma.signature.deleteMany({ where: { tenantId } });
  await prisma.attachment.deleteMany({ where: { tenantId } });
  await prisma.inspectionReport.deleteMany({ where: { tenantId } });
  await prisma.inspectionRecurrence.deleteMany({ where: { tenantId } });
  await prisma.inspectionTask.deleteMany({ where: { tenantId } });
  await prisma.inspection.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.site.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.customerCompany.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

async function getOrCreateProfessionalPlan() {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { code: "professional" } });
  if (existing) {
    return existing;
  }

  return prisma.subscriptionPlan.create({
    data: {
      code: "professional",
      name: "Professional",
      monthlyPriceCents: 49900,
      maxUsers: 50,
      featureFlags: { customerPortal: true, reportDrafts: true, brandedPdf: true, advancedRecurrence: true, uploadedInspectionPdfs: true }
    }
  });
}

async function createTenantFixture() {
  const plan = await getOrCreateProfessionalPlan();
  const passwordHash = await hash("Password123!", 10);
  const tenant = await prisma.tenant.create({
    data: {
      slug: uniqueValue("integration-tenant"),
      name: "Integration Fire Protection",
      subscriptionPlanId: plan.id,
      stripeSubscriptionStatus: "active",
      billingEmail: "billing@integrationfire.test",
      branding: {
        legalBusinessName: "Integration Fire Protection, LLC",
        primaryColor: "#1E3A5F",
        phone: "312-555-0119",
        email: "dispatch@integrationfire.test"
      }
    }
  });
  createdTenantIds.add(tenant.id);

  const customer = await prisma.customerCompany.create({
    data: {
      tenantId: tenant.id,
      name: "Integration Customer",
      contactName: "Casey Customer",
      billingEmail: "ap@integrationcustomer.test"
    }
  });

  const site = await prisma.site.create({
    data: {
      tenantId: tenant.id,
      customerCompanyId: customer.id,
      name: "Integration Site",
      addressLine1: "100 Main St",
      city: "Chicago",
      state: "IL",
      postalCode: "60601"
    }
  });

  const [officeAdmin, technicianA, technicianB] = await Promise.all([
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `${uniqueValue("office")}@integration.test`,
        name: "Office Admin",
        passwordHash,
        role: "office_admin"
      }
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `${uniqueValue("techa")}@integration.test`,
        name: "Tech A",
        passwordHash,
        role: "technician"
      }
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `${uniqueValue("techb")}@integration.test`,
        name: "Tech B",
        passwordHash,
        role: "technician"
      }
    })
  ]);

  return { tenant, customer, site, officeAdmin, technicianA, technicianB };
}

async function createInspectionFixture(input: {
  tenantId: string;
  customerCompanyId: string;
  siteId: string;
  createdByUserId: string;
  assignedTechnicianId?: string | null;
  status?: "to_be_completed" | "scheduled" | "in_progress";
  inspectionType?: keyof typeof inspectionTypeRegistry;
  scheduledStart?: Date;
}) {
  const inspectionType = input.inspectionType ?? "fire_extinguisher";
  const scheduledStart = input.scheduledStart ?? new Date(Date.now() + 86_400_000);

  const inspection = await prisma.inspection.create({
    data: {
      tenantId: input.tenantId,
      customerCompanyId: input.customerCompanyId,
      siteId: input.siteId,
      assignedTechnicianId: input.assignedTechnicianId ?? null,
      createdByUserId: input.createdByUserId,
      status: input.status ?? "to_be_completed",
      scheduledStart,
      scheduledEnd: new Date(scheduledStart.getTime() + 60 * 60 * 1000),
      notes: "Integration test visit",
      claimable: !input.assignedTechnicianId,
      tasks: {
        create: [
          {
            tenantId: input.tenantId,
            inspectionType,
            sortOrder: 0,
            recurrence: {
              create: {
                tenantId: input.tenantId,
                seriesId: `series_${inspectionType}`,
                frequency: RecurrenceFrequency.ANNUAL,
                anchorScheduledStart: scheduledStart,
                nextDueAt: new Date(scheduledStart.getTime() + 365 * 24 * 60 * 60 * 1000)
              }
            },
            report: {
              create: {
                tenantId: input.tenantId,
                technicianId: input.assignedTechnicianId ?? null,
                status: reportStatuses.draft,
                contentJson: { narrative: "" }
              }
            }
          }
        ]
      }
    },
    include: {
      tasks: { include: { report: true } }
    }
  });

  return {
    inspection,
    task: inspection.tasks[0]!,
    report: inspection.tasks[0]!.report!
  };
}

function buildFinalizableDraft(input: { inspectionType: keyof typeof inspectionTypeRegistry; siteName: string; customerName: string; scheduledDate: string }) {
  const draft = buildInitialReportDraft({
    inspectionType: input.inspectionType,
    siteName: input.siteName,
    customerName: input.customerName,
    scheduledDate: input.scheduledDate,
    assetCount: 1,
    priorReportSummary: ""
  });

  return {
    ...draft,
    overallNotes: "Integration finalization draft",
    sections: Object.fromEntries(
      draft.sectionOrder.map((sectionId) => [
        sectionId,
        {
          ...draft.sections[sectionId],
          status: "pass",
          notes: `Verified ${sectionId}`
        }
      ])
    ),
    signatures: {
      technician: {
        signerName: "Tech A",
        imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
        signedAt: new Date().toISOString()
      },
      customer: {
        signerName: "Casey Customer",
        imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
        signedAt: new Date().toISOString()
      }
    }
  };
}

describeIfDatabase("postgres-backed integration flows", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    createdTenantIds.clear();
    await prisma.$disconnect();
  });

  it("verifies seed assumptions after migrations and seed", async () => {
    const [planCount, evergreenAdmin, platformAdmin] = await Promise.all([
      prisma.subscriptionPlan.count(),
      prisma.user.findUnique({ where: { email: "tenantadmin@evergreenfire.com" } }),
      prisma.user.findUnique({ where: { email: "platform@nwfiredemo.com" } })
    ]);

    expect(planCount).toBeGreaterThanOrEqual(3);
    expect(evergreenAdmin?.role).toBe("tenant_admin");
    expect(platformAdmin?.role).toBe("platform_admin");
  });

  it("allows only one technician to win a claim race", async () => {
    const fixture = await createTenantFixture();
    const { inspection } = await createInspectionFixture({
      tenantId: fixture.tenant.id,
      customerCompanyId: fixture.customer.id,
      siteId: fixture.site.id,
      createdByUserId: fixture.officeAdmin.id
    });

    const results = await Promise.allSettled([
      claimInspection({ userId: fixture.technicianA.id, role: "technician", tenantId: fixture.tenant.id }, inspection.id),
      claimInspection({ userId: fixture.technicianB.id, role: "technician", tenantId: fixture.tenant.id }, inspection.id)
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const claimedInspection = await prisma.inspection.findUniqueOrThrow({ where: { id: inspection.id } });
    expect([fixture.technicianA.id, fixture.technicianB.id]).toContain(claimedInspection.assignedTechnicianId);
    expect(claimedInspection.claimable).toBe(false);

    await cleanupTenant(fixture.tenant.id);
    createdTenantIds.delete(fixture.tenant.id);
  }, 20000);

  it("persists finalized reports, generated PDFs, and completed statuses", async () => {
    const fixture = await createTenantFixture();
    const { inspection, report } = await createInspectionFixture({
      tenantId: fixture.tenant.id,
      customerCompanyId: fixture.customer.id,
      siteId: fixture.site.id,
      createdByUserId: fixture.officeAdmin.id,
      assignedTechnicianId: fixture.technicianA.id,
      inspectionType: "fire_extinguisher"
    });

    const draft = buildFinalizableDraft({
      inspectionType: "fire_extinguisher",
      siteName: fixture.site.name,
      customerName: fixture.customer.name,
      scheduledDate: inspection.scheduledStart.toISOString()
    });

    await finalizeInspectionReport(
      { userId: fixture.technicianA.id, role: "technician", tenantId: fixture.tenant.id },
      { inspectionReportId: report.id, contentJson: draft }
    );

    const finalizedReport = await prisma.inspectionReport.findUniqueOrThrow({
      where: { id: report.id },
      include: { attachments: true, task: true, inspection: true }
    });

    expect(finalizedReport.status).toBe("finalized");
    expect(finalizedReport.finalizedAt).not.toBeNull();
    expect(finalizedReport.attachments.some((attachment) => attachment.kind === "pdf" && attachment.source === "generated")).toBe(true);
    expect(finalizedReport.task.status).toBe("completed");
    expect(finalizedReport.inspection.status).toBe("completed");
    expect(finalizedReport.inspection.completedAt).not.toBeNull();
    expect(finalizedReport.inspection.archivedAt).not.toBeNull();

    await cleanupTenant(fixture.tenant.id);
    createdTenantIds.delete(fixture.tenant.id);
  }, 25000);

  it("keeps an inspection open after report finalization when a required external PDF is still unsigned", async () => {
    const fixture = await createTenantFixture();
    const { inspection, report } = await createInspectionFixture({
      tenantId: fixture.tenant.id,
      customerCompanyId: fixture.customer.id,
      siteId: fixture.site.id,
      createdByUserId: fixture.officeAdmin.id,
      assignedTechnicianId: fixture.technicianA.id,
      inspectionType: "fire_extinguisher"
    });

    await prisma.inspectionDocument.create({
      data: {
        tenantId: fixture.tenant.id,
        inspectionId: inspection.id,
        fileName: "customer-form.pdf",
        mimeType: "application/pdf",
        fileSize: 128,
        documentType: "EXTERNAL_CUSTOMER_FORM",
        label: "Customer form",
        requiresSignature: true,
        status: "READY_FOR_SIGNATURE",
        originalStorageKey: `blob:${fixture.tenant.id}/inspection-document-original/customer-form.pdf`,
        uploadedByUserId: fixture.officeAdmin.id
      }
    });

    const draft = buildFinalizableDraft({
      inspectionType: "fire_extinguisher",
      siteName: fixture.site.name,
      customerName: fixture.customer.name,
      scheduledDate: inspection.scheduledStart.toISOString()
    });

    await finalizeInspectionReport(
      { userId: fixture.technicianA.id, role: "technician", tenantId: fixture.tenant.id },
      { inspectionReportId: report.id, contentJson: draft }
    );

    const refreshedInspection = await prisma.inspection.findUniqueOrThrow({
      where: { id: inspection.id }
    });

    expect(refreshedInspection.status).toBe("scheduled");

    await cleanupTenant(fixture.tenant.id);
    createdTenantIds.delete(fixture.tenant.id);
  }, 25000);

  it("allows admins to reopen completed reports for correction and records audited history", async () => {
    const fixture = await createTenantFixture();
    const { inspection, report } = await createInspectionFixture({
      tenantId: fixture.tenant.id,
      customerCompanyId: fixture.customer.id,
      siteId: fixture.site.id,
      createdByUserId: fixture.officeAdmin.id,
      assignedTechnicianId: fixture.technicianA.id,
      inspectionType: "kitchen_suppression"
    });

    const draft = buildFinalizableDraft({
      inspectionType: "kitchen_suppression",
      siteName: fixture.site.name,
      customerName: fixture.customer.name,
      scheduledDate: inspection.scheduledStart.toISOString()
    });

    await finalizeInspectionReport(
      { userId: fixture.technicianA.id, role: "technician", tenantId: fixture.tenant.id },
      { inspectionReportId: report.id, contentJson: draft }
    );

    await reopenCompletedReportForCorrection(
      { userId: fixture.officeAdmin.id, role: "office_admin", tenantId: fixture.tenant.id },
      {
        inspectionReportId: report.id,
        correctionMode: "reissue_to_technician",
        reason: "Add omitted fusible links before invoicing."
      }
    );

    const reopenedReport = await prisma.inspectionReport.findUniqueOrThrow({
      where: { id: report.id },
      include: {
        signatures: true,
        attachments: true,
        task: true,
        inspection: true,
        correctionEvents: { orderBy: { createdAt: "asc" } }
      }
    });

    expect(reopenedReport.status).toBe("draft");
    expect(reopenedReport.finalizedAt).toBeNull();
    expect(reopenedReport.correctionState).toBe("reissued_to_technician");
    expect(reopenedReport.correctionReason).toMatch(/fusible links/i);
    expect(reopenedReport.signatures).toHaveLength(0);
    expect(reopenedReport.attachments.some((attachment) => attachment.kind === "pdf" && attachment.source === "generated")).toBe(false);
    expect(reopenedReport.task.status).toBe("in_progress");
    expect(reopenedReport.inspection.status).toBe("in_progress");
    expect(reopenedReport.correctionEvents.some((event) => event.actionType === "REISSUE_TO_TECHNICIAN")).toBe(true);

    await finalizeInspectionReport(
      { userId: fixture.technicianA.id, role: "technician", tenantId: fixture.tenant.id },
      { inspectionReportId: report.id, contentJson: draft }
    );

    const correctedReport = await prisma.inspectionReport.findUniqueOrThrow({
      where: { id: report.id },
      include: {
        correctionEvents: true,
        attachments: true
      }
    });

    expect(correctedReport.status).toBe("finalized");
    expect(correctedReport.correctionState).toBe("none");
    expect(correctedReport.correctionResolvedAt).not.toBeNull();
    expect(correctedReport.correctionResolvedByUserId).toBe(fixture.technicianA.id);
    expect(correctedReport.correctionEvents.some((event) => event.actionType === "RECOMPLETED")).toBe(true);
    expect(correctedReport.attachments.some((attachment) => attachment.kind === "pdf" && attachment.source === "generated")).toBe(true);

    const billingSummary = await prisma.inspectionBillingSummary.findUnique({
      where: { inspectionId: inspection.id }
    });
    expect(billingSummary).not.toBeNull();

    const auditActions = await prisma.auditLog.findMany({
      where: { tenantId: fixture.tenant.id, entityId: report.id },
      select: { action: true }
    });
    expect(auditActions.map((entry) => entry.action)).toContain("report.reissued_to_technician");
    expect(auditActions.map((entry) => entry.action)).toContain("report.recompleted");

    await cleanupTenant(fixture.tenant.id);
    createdTenantIds.delete(fixture.tenant.id);
  }, 30000);

  it("persists audited replacement visits for started-inspection amendments", async () => {
    const fixture = await createTenantFixture();
    const { inspection } = await createInspectionFixture({
      tenantId: fixture.tenant.id,
      customerCompanyId: fixture.customer.id,
      siteId: fixture.site.id,
      createdByUserId: fixture.officeAdmin.id,
      assignedTechnicianId: fixture.technicianA.id,
      status: "in_progress",
      inspectionType: "fire_alarm",
      scheduledStart: new Date(Date.now() - 60 * 60 * 1000)
    });

    const replacement = await createInspectionAmendment(
      { userId: fixture.officeAdmin.id, role: "office_admin", tenantId: fixture.tenant.id },
      inspection.id,
      {
        customerCompanyId: fixture.customer.id,
        siteId: fixture.site.id,
        scheduledStart: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        scheduledEnd: new Date(Date.now() + (2 * 24 + 1) * 60 * 60 * 1000),
        assignedTechnicianId: fixture.technicianB.id,
        status: "scheduled",
        notes: "Rescheduled after started visit required a return trip.",
        reason: "Site contact requested the remaining devices be handled on a dedicated return trip.",
        tasks: [{ inspectionType: "fire_alarm", frequency: RecurrenceFrequency.ANNUAL }]
      }
    );

    const amendment = await prisma.inspectionAmendment.findFirstOrThrow({
      where: { tenantId: fixture.tenant.id, inspectionId: inspection.id }
    });

    expect(replacement.id).toBe(amendment.replacementInspectionId);
    expect(amendment.reason).toMatch(/return trip/i);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: fixture.tenant.id,
        action: { in: ["inspection.amendment_created", "inspection.amendment_replacement_created"] }
      }
    });
    expect(auditLogs).toHaveLength(2);

    await expect(
      createInspectionAmendment(
        { userId: fixture.officeAdmin.id, role: "office_admin", tenantId: fixture.tenant.id },
        inspection.id,
        {
          customerCompanyId: fixture.customer.id,
          siteId: fixture.site.id,
          scheduledStart: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          scheduledEnd: new Date(Date.now() + (3 * 24 + 1) * 60 * 60 * 1000),
          assignedTechnicianId: fixture.technicianA.id,
          status: "scheduled",
          notes: "Should not create a second amendment",
          reason: "Trying to amend again.",
          tasks: [{ inspectionType: "fire_alarm", frequency: RecurrenceFrequency.ANNUAL }]
        }
      )
    ).rejects.toThrow(/already has an amendment/i);

    await cleanupTenant(fixture.tenant.id);
    createdTenantIds.delete(fixture.tenant.id);
  }, 20000);
});
