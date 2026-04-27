import { prisma, type Prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema, reportStatuses } from "@testworx/types";

import { assertTenantContext } from "./permissions";
import { isTechnicianAssignedToInspection } from "./scheduling";
import { buildFileDownloadResponse } from "./storage";

type DeficiencyDashboardSite = {
  id: string;
  name: string;
};

type DeficiencyDashboardDeficiency = Prisma.DeficiencyGetPayload<{
  include: {
    inspection: {
      select: {
        id: true;
        scheduledStart: true;
        customerCompany: { select: { name: true } };
      };
    };
  };
}>;

function readTechnicianAssignments(value: unknown): Array<{ technicianId: string }> {
  const assignments = (value as { technicianAssignments?: Array<{ technicianId: string }> } | null | undefined)?.technicianAssignments;
  return Array.isArray(assignments) ? assignments : [];
}

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
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

const deficiencyFilterSchema = z.object({
  siteId: z.string().optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

export async function getAdminDeficiencyDashboardData(actor: ActorContext, filters?: z.input<typeof deficiencyFilterSchema>) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can access the deficiency dashboard.");
  }

  const parsedFilters = deficiencyFilterSchema.parse(filters ?? {});
  const tenantId = parsedActor.tenantId as string;
  const where = {
    tenantId,
    ...(parsedFilters.siteId ? { siteId: parsedFilters.siteId } : {}),
    ...(parsedFilters.status ? { status: parsedFilters.status } : {}),
    ...(parsedFilters.severity ? { severity: parsedFilters.severity } : {}),
    ...(parsedFilters.dateFrom || parsedFilters.dateTo
      ? {
          createdAt: {
            ...(parsedFilters.dateFrom ? { gte: new Date(parsedFilters.dateFrom) } : {}),
            ...(parsedFilters.dateTo ? { lte: new Date(parsedFilters.dateTo) } : {})
          }
        }
      : {})
  };

  const siteQuery = prisma.site.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });
  const deficiencyQuery = prisma.deficiency.findMany({
    where,
    include: {
      inspection: {
        select: {
          id: true,
          scheduledStart: true,
          customerCompany: { select: { name: true } }
        }
      }
    },
    orderBy: [{ createdAt: "desc" }]
  });

  const [sites, deficiencies] = await Promise.all([siteQuery, deficiencyQuery] as const);
  const typedSites = sites as DeficiencyDashboardSite[];
  const typedDeficiencies = deficiencies as DeficiencyDashboardDeficiency[];
  const siteNames = new Map(typedSites.map((site: DeficiencyDashboardSite) => [site.id, site.name] as const));

  return {
    filters: parsedFilters,
    sites: typedSites,
    counts: {
      open: typedDeficiencies.filter((item: DeficiencyDashboardDeficiency) => item.status === "open").length,
      quoted: typedDeficiencies.filter((item: DeficiencyDashboardDeficiency) => item.status === "quoted").length,
      approved: typedDeficiencies.filter((item: DeficiencyDashboardDeficiency) => item.status === "approved").length,
      scheduled: typedDeficiencies.filter((item: DeficiencyDashboardDeficiency) => item.status === "scheduled").length,
      resolved: typedDeficiencies.filter((item: DeficiencyDashboardDeficiency) => item.status === "resolved").length,
      ignored: typedDeficiencies.filter((item: DeficiencyDashboardDeficiency) => item.status === "ignored").length
    },
    deficiencies: typedDeficiencies.map((deficiency: DeficiencyDashboardDeficiency) => ({
      ...deficiency,
      customerName: deficiency.inspection.customerCompany.name,
      siteName: siteNames.get(deficiency.siteId) ?? "Unknown site"
    }))
  };
}

export async function updateDeficiencyStatus(actor: ActorContext, deficiencyId: string, status: string) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can update deficiencies.");
  }

  const deficiency = await prisma.deficiency.findFirst({
    where: { id: deficiencyId, tenantId: parsedActor.tenantId as string }
  });

  if (!deficiency) {
    throw new Error("Deficiency not found.");
  }

  const updated = await prisma.deficiency.update({
    where: { id: deficiencyId },
    data: { status }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "deficiency.status_updated",
      entityType: "Deficiency",
      entityId: deficiencyId,
      metadata: { previousStatus: deficiency.status, nextStatus: status }
    }
  });

  return updated;
}

export async function getAuthorizedDeficiencyPhotoDownload(actor: ActorContext, deficiencyId: string) {
  const parsedActor = parseActor(actor);
  const actorCustomerCompanyId = await getAuthorizedCustomerCompanyId(parsedActor);
  const deficiency = await prisma.deficiency.findFirst({
    where: { id: deficiencyId },
    include: {
      inspectionReport: {
        include: {
          inspection: {
            include: {
              technicianAssignments: { select: { technicianId: true } }
            }
          }
        }
      }
    }
  });

  if (!deficiency?.photoStorageKey) {
    throw new Error("Deficiency photo not found.");
  }

  const sameTenant = parsedActor.tenantId && parsedActor.tenantId === deficiency.tenantId;
  const adminAllowed = sameTenant && ["platform_admin", "tenant_admin", "office_admin"].includes(parsedActor.role);
  const technicianAllowed =
    sameTenant &&
    parsedActor.role === "technician" &&
    isTechnicianAssignedToInspection({
      userId: parsedActor.userId,
      assignedTechnicianId: deficiency.inspectionReport.inspection.assignedTechnicianId,
      technicianAssignments: readTechnicianAssignments(deficiency.inspectionReport.inspection)
    });
  const customerAllowed = sameTenant &&
    parsedActor.role === "customer_user" &&
    actorCustomerCompanyId === deficiency.inspectionReport.inspection.customerCompanyId &&
    deficiency.inspectionReport.status === reportStatuses.finalized;

  if (!adminAllowed && !technicianAllowed && !customerAllowed) {
    throw new Error("You do not have access to this deficiency photo.");
  }

  return buildFileDownloadResponse({
    storageKey: deficiency.photoStorageKey,
    fileName: `deficiency-${deficiency.id}.png`,
    fallbackMimeType: "image/png"
  });
}
