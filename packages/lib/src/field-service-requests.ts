import {
  FieldServiceRequestPriority,
  FieldServiceRequestStatus,
  FieldServiceRequestType,
  Prisma
} from "@prisma/client";
import { prisma } from "@testworx/db";
import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";
import { z } from "zod";

import { assertTenantContext } from "./permissions";

const officeRoles = new Set(["tenant_admin", "office_admin", "platform_admin"]);

function optionalText(max: number) {
  return z.string().trim().max(max).nullish().transform((value) => value || null);
}

export const fieldServiceRequestSchema = z.object({
  submissionId: z.string().uuid().optional(),
  customerCompanyId: z.string().trim().min(1, "Select a customer."),
  siteId: optionalText(191),
  requestType: z.nativeEnum(FieldServiceRequestType),
  priority: z.nativeEnum(FieldServiceRequestPriority),
  title: z.string().trim().min(3, "Add a short request title.").max(160),
  description: z.string().trim().min(10, "Describe what the office team needs to know.").max(4000),
  equipmentContext: optionalText(1000),
  preferredTiming: optionalText(500)
});

export const fieldServiceRequestReviewSchema = z.object({
  requestId: z.string().trim().min(1),
  status: z.enum([FieldServiceRequestStatus.acknowledged, FieldServiceRequestStatus.resolved, FieldServiceRequestStatus.declined]),
  adminNote: optionalText(2000)
});

export const fieldServiceRequestTypeLabels: Record<FieldServiceRequestType, string> = {
  service_ticket: "Service ticket",
  work_order: "Work order",
  follow_up: "Follow-up visit",
  quote_request: "Quote request",
  other: "Other request"
};

export const fieldServiceRequestStatusLabels: Record<FieldServiceRequestStatus, string> = {
  pending: "Needs review",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  declined: "Declined"
};

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  if (!parsed.tenantId) throw new Error("Tenant context is required.");
  return { ...parsed, tenantId: parsed.tenantId };
}

export async function getFieldServiceRequestFormData(actor: ActorContext) {
  const parsed = parseActor(actor);
  if (parsed.role !== "technician") throw new Error("Only technicians can submit field requests.");

  const [tenant, customers, requests] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: parsed.tenantId }, select: { timezone: true } }),
    prisma.customerCompany.findMany({
      where: { tenantId: parsed.tenantId, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sites: { orderBy: { name: "asc" }, select: { id: true, name: true, addressLine1: true, city: true, state: true } }
      }
    }),
    prisma.fieldServiceRequest.findMany({
      where: { tenantId: parsed.tenantId, requestedByUserId: parsed.userId },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { customerCompany: { select: { name: true } }, site: { select: { name: true } } }
    })
  ]);
  return { customers, requests, timezone: tenant?.timezone ?? "America/Chicago" };
}

export async function createFieldServiceRequest(actor: ActorContext, input: unknown) {
  const parsed = parseActor(actor);
  if (parsed.role !== "technician") throw new Error("Only technicians can submit field requests.");
  const { submissionId, ...values } = fieldServiceRequestSchema.parse(input);

  const customer = await prisma.customerCompany.findFirst({
    where: { id: values.customerCompanyId, tenantId: parsed.tenantId, isActive: true },
    select: { id: true, name: true, sites: { where: { id: values.siteId ?? "__no_site__" }, select: { id: true } } }
  });
  if (!customer) throw new Error("That customer is not available in this workspace.");
  if (values.siteId && customer.sites.length === 0) throw new Error("That site does not belong to the selected customer.");

  try {
    return await prisma.$transaction(async (tx) => {
    const request = await tx.fieldServiceRequest.create({
      data: { ...(submissionId ? { id: submissionId } : {}), tenantId: parsed.tenantId, requestedByUserId: parsed.userId, ...values }
    });
    await tx.auditLog.create({
      data: {
        tenantId: parsed.tenantId,
        actorUserId: parsed.userId,
        action: "field_service_request.created",
        entityType: "FieldServiceRequest",
        entityId: request.id,
        metadata: { requestType: values.requestType, priority: values.priority, customerCompanyId: customer.id } satisfies Prisma.InputJsonValue
      }
    });
    return request;
    });
  } catch (error) {
    // A retry after a lost response must return the saved request, not create another.
    if (submissionId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const saved = await prisma.fieldServiceRequest.findFirst({
        where: { id: submissionId, tenantId: parsed.tenantId, requestedByUserId: parsed.userId }
      });
      if (saved) return saved;
    }
    throw error;
  }
}

export async function getPendingFieldServiceRequestCount(actor: ActorContext) {
  const parsed = parseActor(actor);
  if (!officeRoles.has(parsed.role)) throw new Error("Only office users can review field requests.");
  return prisma.fieldServiceRequest.count({ where: { tenantId: parsed.tenantId, status: "pending" } });
}

export async function getAdminFieldServiceRequests(actor: ActorContext) {
  const parsed = parseActor(actor);
  if (!officeRoles.has(parsed.role)) throw new Error("Only office users can review field requests.");
  const [tenant, requests] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: parsed.tenantId }, select: { timezone: true } }),
    prisma.fieldServiceRequest.findMany({
      where: { tenantId: parsed.tenantId },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      include: {
        requestedBy: { select: { name: true, email: true } },
        customerCompany: { select: { name: true } },
        site: { select: { name: true, addressLine1: true, city: true, state: true } },
        reviewedBy: { select: { name: true } }
      }
    })
  ]);
  return {
    requests,
    timezone: tenant?.timezone ?? "America/Chicago",
    counts: {
      pending: requests.filter((request) => request.status === FieldServiceRequestStatus.pending).length,
      urgent: requests.filter((request) => request.status === FieldServiceRequestStatus.pending && request.priority === FieldServiceRequestPriority.urgent).length
    }
  };
}

export async function reviewFieldServiceRequest(actor: ActorContext, input: unknown) {
  const parsed = parseActor(actor);
  if (!officeRoles.has(parsed.role)) throw new Error("Only office users can review field requests.");
  const values = fieldServiceRequestReviewSchema.parse(input);
  const existing = await prisma.fieldServiceRequest.findFirst({ where: { id: values.requestId, tenantId: parsed.tenantId }, select: { id: true, status: true, adminNote: true, updatedAt: true } });
  if (!existing) throw new Error("Field request not found.");
  if (existing.status === values.status && existing.adminNote === values.adminNote) return existing;
  if (existing.status === "resolved" || existing.status === "declined") throw new Error("This request has already been closed. Refresh to see the latest office update.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.fieldServiceRequest.updateMany({
      where: { id: existing.id, tenantId: parsed.tenantId, updatedAt: existing.updatedAt, status: existing.status },
      data: { status: values.status, adminNote: values.adminNote, reviewedByUserId: parsed.userId, reviewedAt: new Date() }
    });
    if (updated.count !== 1) throw new Error("This request changed while you were reviewing it. Refresh before trying again.");
    await tx.auditLog.create({
      data: {
        tenantId: parsed.tenantId,
        actorUserId: parsed.userId,
        action: "field_service_request.reviewed",
        entityType: "FieldServiceRequest",
        entityId: existing.id,
        metadata: { previousStatus: existing.status, status: values.status } satisfies Prisma.InputJsonValue
      }
    });
    return { id: existing.id, status: values.status };
  });
}
