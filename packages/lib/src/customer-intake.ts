import crypto from "node:crypto";

import {
  AttachmentKind,
  CustomerIntakeStatus,
  InspectionClassification,
  InspectionStatus,
  InspectionType,
  Prisma,
  RecurrenceFrequency
} from "@prisma/client";
import { prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { sendCustomerIntakeRequestEmail, sendCustomerIntakeSubmittedEmail } from "./account-email";
import { resolveTenantBranding } from "./branding";
import { getServerEnv } from "./env";
import { assertTenantContext } from "./permissions";
import { buildFileDownloadResponse, buildStoredFilePayload } from "./storage";

const customerIntakeTokenBytes = 32;
const customerIntakeExpirationDays = 14;

const serviceSystemTypes = [
  "fire_alarm",
  "kitchen_suppression",
  "fire_extinguishers",
  "emergency_service",
  "repair",
  "other"
] as const;

const serviceSystemTypeLabels: Record<(typeof serviceSystemTypes)[number], string> = {
  fire_alarm: "Fire alarm",
  kitchen_suppression: "Kitchen suppression",
  fire_extinguishers: "Fire extinguishers",
  emergency_service: "Emergency service",
  repair: "Repair",
  other: "Other"
};

function nullableTrimmed(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);
}

export const customerIntakeSendSchema = z.object({
  recipientEmail: z.string().trim().email("Enter a valid recipient email."),
  recipientName: nullableTrimmed(160),
  optionalMessage: nullableTrimmed(1000)
});

export const customerIntakeSubmissionSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required.").max(160),
  primaryContactName: z.string().trim().min(1, "Primary contact name is required.").max(160),
  primaryContactEmail: z.string().trim().email("Enter a valid primary contact email."),
  primaryContactPhone: z.string().trim().min(1, "Primary contact phone is required.").max(60),
  billingEmail: z.string().trim().email("Enter a valid billing email."),
  billingPhone: nullableTrimmed(60),
  billingAddressLine1: z.string().trim().min(1, "Billing address is required.").max(160),
  billingAddressLine2: nullableTrimmed(160),
  billingCity: z.string().trim().min(1, "Billing city is required.").max(120),
  billingState: z.string().trim().min(1, "Billing state is required.").max(120),
  billingPostalCode: z.string().trim().min(1, "Billing ZIP/postal code is required.").max(40),
  siteName: nullableTrimmed(160),
  siteAddressLine1: z.string().trim().min(1, "Service site address is required.").max(160),
  siteAddressLine2: nullableTrimmed(160),
  siteCity: z.string().trim().min(1, "Service site city is required.").max(120),
  siteState: z.string().trim().min(1, "Service site state is required.").max(120),
  sitePostalCode: z.string().trim().min(1, "Service site ZIP/postal code is required.").max(40),
  siteContactName: nullableTrimmed(160),
  siteContactPhone: nullableTrimmed(60),
  siteContactEmail: z.string().trim().email("Enter a valid site contact email.").or(z.literal("")).optional().transform((value) => value || null),
  requestedServiceType: z.string().trim().min(1, "Requested service type is required.").max(160),
  systemTypes: z.array(z.enum(serviceSystemTypes)).min(1, "Select at least one system type."),
  preferredServiceWindow: nullableTrimmed(160),
  serviceNotes: nullableTrimmed(3000)
});

export type CustomerIntakeSubmission = z.infer<typeof customerIntakeSubmissionSchema>;

type IntakeFileInput = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

type IntakeStoredAttachment = {
  fileName: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
};

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureOfficeActor(parsedActor: ReturnType<typeof parseActor>) {
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only office administrators can manage customer intake requests.");
  }
}

function createRawToken() {
  return crypto.randomBytes(customerIntakeTokenBytes).toString("base64url");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildIntakeUrl(token: string) {
  return `${getServerEnv().APP_URL.replace(/\/$/, "")}/intake/customer/${encodeURIComponent(token)}`;
}

function formatSystemTypes(values: string[]) {
  return values
    .map((value) => serviceSystemTypeLabels[value as keyof typeof serviceSystemTypeLabels] ?? value)
    .join(", ");
}

function toSubmittedData(value: unknown): CustomerIntakeSubmission {
  return customerIntakeSubmissionSchema.parse(value);
}

async function findDuplicateWarnings(tenantId: string, data: CustomerIntakeSubmission) {
  const [nameMatches, emailMatches, phoneMatches, siteMatches] = await Promise.all([
    prisma.customerCompany.findMany({
      where: {
        tenantId,
        name: { equals: data.companyName, mode: "insensitive" }
      },
      select: { id: true, name: true }
    }),
    prisma.customerCompany.findMany({
      where: {
        tenantId,
        OR: [
          { billingEmail: { equals: data.primaryContactEmail, mode: "insensitive" } },
          { billingEmail: { equals: data.billingEmail, mode: "insensitive" } }
        ]
      },
      select: { id: true, name: true, billingEmail: true }
    }),
    prisma.customerCompany.findMany({
      where: {
        tenantId,
        phone: data.primaryContactPhone
      },
      select: { id: true, name: true, phone: true }
    }),
    prisma.site.findMany({
      where: {
        tenantId,
        addressLine1: { equals: data.siteAddressLine1, mode: "insensitive" },
        postalCode: { equals: data.sitePostalCode, mode: "insensitive" }
      },
      include: {
        customerCompany: { select: { id: true, name: true } }
      },
      take: 5
    })
  ]);

  return [
    ...nameMatches.map((match) => ({
      type: "company_name",
      label: `Company name already exists: ${match.name}`,
      relatedId: match.id
    })),
    ...emailMatches.map((match) => ({
      type: "email",
      label: `Email already exists on ${match.name}: ${match.billingEmail}`,
      relatedId: match.id
    })),
    ...phoneMatches.map((match) => ({
      type: "phone",
      label: `Phone already exists on ${match.name}: ${match.phone}`,
      relatedId: match.id
    })),
    ...siteMatches.map((match) => ({
      type: "site_address",
      label: `Site address matches ${match.customerCompany.name}: ${match.name}`,
      relatedId: match.id
    }))
  ];
}

function buildSiteNotes(data: CustomerIntakeSubmission) {
  const notes = [
    data.siteContactName ? `Site contact: ${data.siteContactName}` : null,
    data.siteContactPhone ? `Site phone: ${data.siteContactPhone}` : null,
    data.siteContactEmail ? `Site email: ${data.siteContactEmail}` : null,
    `Requested service: ${data.requestedServiceType}`,
    `Systems: ${formatSystemTypes(data.systemTypes)}`,
    data.preferredServiceWindow ? `Preferred service window: ${data.preferredServiceWindow}` : null,
    data.serviceNotes ? `Notes: ${data.serviceNotes}` : null
  ].filter(Boolean);

  return notes.join("\n");
}

function buildCustomerNotes(data: CustomerIntakeSubmission) {
  return [
    "Created from customer intake request.",
    data.billingPhone ? `Billing phone: ${data.billingPhone}` : null,
    `Requested service: ${data.requestedServiceType}`,
    `Systems: ${formatSystemTypes(data.systemTypes)}`,
    data.preferredServiceWindow ? `Preferred service window: ${data.preferredServiceWindow}` : null,
    data.serviceNotes ? `Service notes: ${data.serviceNotes}` : null
  ].filter(Boolean).join("\n");
}

async function createCustomerRecordsFromIntake(input: {
  tenantId: string;
  actorUserId: string;
  intakeId: string;
  data: CustomerIntakeSubmission;
  createWorkOrderDraft: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customerCompany.create({
      data: {
        tenantId: input.tenantId,
        name: input.data.companyName,
        contactName: input.data.primaryContactName,
        billingEmail: input.data.billingEmail,
        phone: input.data.primaryContactPhone,
        serviceAddressLine1: input.data.siteAddressLine1,
        serviceAddressLine2: input.data.siteAddressLine2,
        serviceCity: input.data.siteCity,
        serviceState: input.data.siteState,
        servicePostalCode: input.data.sitePostalCode,
        serviceCountry: "USA",
        billingAddressSameAsService: false,
        billingAddressLine1: input.data.billingAddressLine1,
        billingAddressLine2: input.data.billingAddressLine2,
        billingCity: input.data.billingCity,
        billingState: input.data.billingState,
        billingPostalCode: input.data.billingPostalCode,
        billingCountry: "USA",
        notes: buildCustomerNotes(input.data),
        paymentTermsCode: "net_30",
        invoiceDeliverySettings: { method: "payer_email", recipientEmail: input.data.billingEmail },
        requiredBillingReferences: {}
      }
    });

    const site = await tx.site.create({
      data: {
        tenantId: input.tenantId,
        customerCompanyId: customer.id,
        name: input.data.siteName || input.data.companyName,
        addressLine1: input.data.siteAddressLine1,
        addressLine2: input.data.siteAddressLine2,
        city: input.data.siteCity,
        state: input.data.siteState,
        postalCode: input.data.sitePostalCode,
        notes: buildSiteNotes(input.data)
      }
    });

    let workOrderId: string | null = null;
    if (input.createWorkOrderDraft) {
      const scheduledStart = new Date();
      const inspection = await tx.inspection.create({
        data: {
          tenantId: input.tenantId,
          customerCompanyId: customer.id,
          siteId: site.id,
          createdByUserId: input.actorUserId,
          inspectionClassification: InspectionClassification.call_in,
          scheduledStart,
          status: InspectionStatus.to_be_completed,
          claimable: true,
          notes: buildSiteNotes(input.data)
        }
      });
      await tx.inspectionTask.create({
        data: {
          tenantId: input.tenantId,
          inspectionId: inspection.id,
          inspectionType: InspectionType.work_order,
          addedByUserId: input.actorUserId,
          dueDate: scheduledStart,
          dueMonth: `${scheduledStart.getFullYear()}-${String(scheduledStart.getMonth() + 1).padStart(2, "0")}`,
          schedulingStatus: "scheduled_now",
          status: InspectionStatus.to_be_completed,
          notes: input.data.serviceNotes
        }
      });
      const task = await tx.inspectionTask.findFirstOrThrow({
        where: { inspectionId: inspection.id, tenantId: input.tenantId },
        select: { id: true }
      });
      await tx.inspectionRecurrence.create({
        data: {
          tenantId: input.tenantId,
          inspectionTaskId: task.id,
          frequency: RecurrenceFrequency.ONCE,
          intervalCount: 1,
          seriesId: `intake-${input.intakeId}`,
          anchorScheduledStart: scheduledStart,
          nextDueAt: scheduledStart
        }
      });
      workOrderId = inspection.id;
    }

    await tx.customerIntakeRequest.update({
      where: { id: input.intakeId },
      data: {
        status: CustomerIntakeStatus.approved,
        approvedAt: new Date(),
        approvedByUserId: input.actorUserId,
        createdCustomerId: customer.id,
        createdSiteId: site.id,
        createdWorkOrderId: workOrderId
      }
    });

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "customer_intake.approved",
        entityType: "CustomerIntakeRequest",
        entityId: input.intakeId,
        metadata: {
          customerCompanyId: customer.id,
          siteId: site.id,
          workOrderId
        } as Prisma.InputJsonValue
      }
    });

    return { customerId: customer.id, siteId: site.id, workOrderId };
  });
}

export async function createCustomerIntakeRequest(actor: ActorContext, input: z.infer<typeof customerIntakeSendSchema>) {
  const parsedActor = parseActor(actor);
  ensureOfficeActor(parsedActor);
  const tenantId = parsedActor.tenantId as string;
  const parsedInput = customerIntakeSendSchema.parse(input);
  const token = createRawToken();
  const expiresAt = addDays(new Date(), customerIntakeExpirationDays);

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { id: true, name: true, billingEmail: true, branding: true }
  });
  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  const sender = await prisma.user.findFirst({
    where: { id: parsedActor.userId, tenantId },
    select: { name: true }
  });
  const branding = resolveTenantBranding({ tenantName: tenant.name, branding: tenant.branding, billingEmail: tenant.billingEmail });
  const request = await prisma.customerIntakeRequest.create({
    data: {
      organizationId: tenantId,
      tokenHash: hashToken(token),
      recipientEmail: parsedInput.recipientEmail,
      recipientName: parsedInput.recipientName,
      status: CustomerIntakeStatus.sent,
      sentAt: new Date(),
      expiresAt,
      createdByUserId: parsedActor.userId,
      optionalMessage: parsedInput.optionalMessage
    }
  });

  const delivery = await sendCustomerIntakeRequestEmail({
    recipientEmail: parsedInput.recipientEmail,
    recipientName: parsedInput.recipientName || "there",
    tenantName: tenant.name,
    intakeUrl: buildIntakeUrl(token),
    senderName: sender?.name ?? "TradeWorx",
    optionalMessage: parsedInput.optionalMessage,
    expiresAt,
    branding: {
      companyName: branding.legalBusinessName,
      phone: branding.phone,
      email: branding.email,
      website: branding.website,
      logoDataUrl: branding.logoDataUrl,
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "customer_intake.sent",
      entityType: "CustomerIntakeRequest",
      entityId: request.id,
      metadata: {
        recipientEmail: parsedInput.recipientEmail,
        deliveryReason: delivery.reason,
        deliveryError: delivery.error
      } as Prisma.InputJsonValue
    }
  });

  return { request, delivery };
}

export async function getCustomerIntakeWorkspace(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  ensureOfficeActor(parsedActor);
  const tenantId = parsedActor.tenantId as string;
  const requests = await prisma.customerIntakeRequest.findMany({
    where: { organizationId: tenantId },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      attachments: true,
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } }
    }
  });

  return {
    requests,
    counts: {
      pending: requests.filter((request) => request.status === CustomerIntakeStatus.submitted).length,
      sent: requests.filter((request) => request.status === CustomerIntakeStatus.sent).length,
      approved: requests.filter((request) => request.status === CustomerIntakeStatus.approved).length
    }
  };
}

export async function getCustomerIntakeReview(actor: ActorContext, intakeRequestId: string) {
  const parsedActor = parseActor(actor);
  ensureOfficeActor(parsedActor);
  const tenantId = parsedActor.tenantId as string;
  const request = await prisma.customerIntakeRequest.findFirst({
    where: { id: intakeRequestId, organizationId: tenantId },
    include: {
      attachments: true,
      createdBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true, email: true } }
    }
  });
  if (!request) {
    return null;
  }

  const submittedData = request.submittedDataJson ? toSubmittedData(request.submittedDataJson) : null;
  const duplicateWarnings = submittedData ? await findDuplicateWarnings(tenantId, submittedData) : [];
  return { request, submittedData, duplicateWarnings };
}

export async function getPublicCustomerIntakeRequest(token: string) {
  const tokenHash = hashToken(token);
  const request = await prisma.customerIntakeRequest.findUnique({
    where: { tokenHash },
    include: {
      organization: {
        select: { name: true, billingEmail: true, branding: true }
      }
    }
  });
  if (!request) {
    return null;
  }

  const now = new Date();
  if (request.expiresAt <= now && request.status !== CustomerIntakeStatus.expired) {
    await prisma.customerIntakeRequest.update({
      where: { id: request.id },
      data: { status: CustomerIntakeStatus.expired }
    });
    request.status = CustomerIntakeStatus.expired;
  }

  return {
    id: request.id,
    status: request.status,
    expiresAt: request.expiresAt,
    recipientEmail: request.recipientEmail,
    recipientName: request.recipientName,
    branding: resolveTenantBranding({
      tenantName: request.organization.name,
      branding: request.organization.branding,
      billingEmail: request.organization.billingEmail
    })
  };
}

export async function submitCustomerIntakeRequest(input: {
  token: string;
  submission: unknown;
  files?: IntakeFileInput[];
}) {
  const tokenHash = hashToken(input.token);
  const request = await prisma.customerIntakeRequest.findUnique({
    where: { tokenHash },
    include: {
      organization: { select: { id: true, name: true, billingEmail: true, branding: true, customerIntakeAutoCreateEnabled: true } }
    }
  });
  if (!request) {
    throw new Error("This intake link is not valid.");
  }
  if (request.expiresAt <= new Date()) {
    await prisma.customerIntakeRequest.update({ where: { id: request.id }, data: { status: CustomerIntakeStatus.expired } });
    throw new Error("This intake link has expired.");
  }
  if (request.status !== CustomerIntakeStatus.sent) {
    throw new Error("This intake request has already been submitted or is no longer active.");
  }

  const submission = customerIntakeSubmissionSchema.parse(input.submission);
  const attachments: IntakeStoredAttachment[] = [];
  for (const file of input.files ?? []) {
    if (!file.size || file.size <= 0) {
      continue;
    }
    const payload = await buildStoredFilePayload({
      tenantId: request.organizationId,
      category: "customer-intake",
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: new Uint8Array(await file.arrayBuffer())
    });
    attachments.push(payload);
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerIntakeRequest.update({
      where: { id: request.id },
      data: {
        status: CustomerIntakeStatus.submitted,
        submittedAt: new Date(),
        submittedDataJson: submission as Prisma.InputJsonValue
      }
    });
    if (attachments.length) {
      await tx.customerIntakeAttachment.createMany({
        data: attachments.map((attachment) => ({
          intakeRequestId: request.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          storageKey: attachment.storageKey,
          fileSizeBytes: attachment.sizeBytes
        }))
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: request.organizationId,
        actorUserId: null,
        action: "customer_intake.submitted",
        entityType: "CustomerIntakeRequest",
        entityId: request.id,
        metadata: {
          companyName: submission.companyName,
          attachmentCount: attachments.length
        } as Prisma.InputJsonValue
      }
    });
  });

  const branding = resolveTenantBranding({
    tenantName: request.organization.name,
    branding: request.organization.branding,
    billingEmail: request.organization.billingEmail
  });
  if (request.organization.billingEmail) {
    await sendCustomerIntakeSubmittedEmail({
      recipientEmail: request.organization.billingEmail,
      recipientName: "Office team",
      tenantName: request.organization.name,
      companyName: submission.companyName,
      contactName: submission.primaryContactName,
      reviewUrl: `${getServerEnv().APP_URL.replace(/\/$/, "")}/app/admin/customer-intakes/${request.id}`,
      branding: {
        companyName: branding.legalBusinessName,
        phone: branding.phone,
        email: branding.email,
        website: branding.website,
        logoDataUrl: branding.logoDataUrl,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor
      }
    });
  }

  if (request.organization.customerIntakeAutoCreateEnabled) {
    const warnings = await findDuplicateWarnings(request.organizationId, submission);
    if (!warnings.length) {
      await createCustomerRecordsFromIntake({
        tenantId: request.organizationId,
        actorUserId: request.createdByUserId,
        intakeId: request.id,
        data: submission,
        createWorkOrderDraft: false
      });
    }
  }

  return { id: request.id };
}

export async function approveCustomerIntakeRequest(actor: ActorContext, input: {
  intakeRequestId: string;
  createWorkOrderDraft?: boolean;
  confirmDuplicateWarnings?: boolean;
}) {
  const parsedActor = parseActor(actor);
  ensureOfficeActor(parsedActor);
  const tenantId = parsedActor.tenantId as string;
  const request = await prisma.customerIntakeRequest.findFirst({
    where: { id: input.intakeRequestId, organizationId: tenantId }
  });
  if (!request || request.status !== CustomerIntakeStatus.submitted || !request.submittedDataJson) {
    throw new Error("Only submitted intake requests can be approved.");
  }
  const submittedData = toSubmittedData(request.submittedDataJson);
  const warnings = await findDuplicateWarnings(tenantId, submittedData);
  if (warnings.length && !input.confirmDuplicateWarnings) {
    throw new Error("Possible duplicate customer records were found. Review the warnings and confirm approval before creating a new customer.");
  }

  return createCustomerRecordsFromIntake({
    tenantId,
    actorUserId: parsedActor.userId,
    intakeId: request.id,
    data: submittedData,
    createWorkOrderDraft: input.createWorkOrderDraft ?? false
  });
}

export async function rejectCustomerIntakeRequest(actor: ActorContext, intakeRequestId: string) {
  const parsedActor = parseActor(actor);
  ensureOfficeActor(parsedActor);
  const tenantId = parsedActor.tenantId as string;
  await prisma.customerIntakeRequest.updateMany({
    where: { id: intakeRequestId, organizationId: tenantId, status: { in: [CustomerIntakeStatus.sent, CustomerIntakeStatus.submitted] } },
    data: { status: CustomerIntakeStatus.rejected }
  });
}

export async function reopenCustomerIntakeRequest(actor: ActorContext, intakeRequestId: string) {
  const parsedActor = parseActor(actor);
  ensureOfficeActor(parsedActor);
  const tenantId = parsedActor.tenantId as string;
  await prisma.customerIntakeRequest.updateMany({
    where: { id: intakeRequestId, organizationId: tenantId, status: CustomerIntakeStatus.submitted },
    data: { status: CustomerIntakeStatus.sent, submittedAt: null }
  });
}

export async function getCustomerIntakeAttachmentDownload(actor: ActorContext, attachmentId: string) {
  const parsedActor = parseActor(actor);
  ensureOfficeActor(parsedActor);
  const attachment = await prisma.customerIntakeAttachment.findFirst({
    where: {
      id: attachmentId,
      intakeRequest: {
        organizationId: parsedActor.tenantId as string
      }
    },
    select: {
      fileName: true,
      mimeType: true,
      storageKey: true
    }
  });
  if (!attachment) {
    throw new Error("Attachment not found.");
  }

  return buildFileDownloadResponse({
    storageKey: attachment.storageKey,
    fileName: attachment.fileName,
    fallbackMimeType: attachment.mimeType
  });
}

export { serviceSystemTypes, serviceSystemTypeLabels };
