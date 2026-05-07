import { prisma, type Prisma } from "@testworx/db";
import { QuoteDeliveryStatus, QuoteStatus, QuoteSyncStatus } from "@prisma/client";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema, reportStatuses } from "@testworx/types";

import { assertTenantContext } from "./permissions";
import { getDefaultQuoteExpirationDate } from "./quote-terms";
import { inspectionTypeRegistry } from "./report-config";
import { getCustomerFacingSiteLabel, isTechnicianAssignedToInspection } from "./scheduling";
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

type QuoteDeficiencyRecord = Prisma.DeficiencyGetPayload<{
  include: {
    inspection: {
      select: {
        id: true;
        scheduledStart: true;
        customerCompanyId: true;
        customerCompany: {
          select: {
            id: true;
            name: true;
            contactName: true;
            billingEmail: true;
          };
        };
      };
    };
    site: {
      select: {
        id: true;
        name: true;
        addressLine1: true;
        city: true;
        state: true;
        postalCode: true;
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

function assertDeficiencyAdminAccess(parsedActor: ReturnType<typeof parseActor>) {
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can update deficiencies.");
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildNextQuoteNumberFromCount(count: number) {
  return `Q-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function mapReportTypeToQuoteProposalType(reportType: string | null | undefined) {
  switch (reportType) {
    case "fire_alarm":
      return "fire_alarm";
    case "wet_fire_sprinkler":
    case "dry_fire_sprinkler":
    case "fire_pump":
    case "backflow":
      return "fire_sprinkler";
    case "kitchen_suppression":
      return "kitchen_suppression";
    case "fire_extinguisher":
      return "fire_extinguisher";
    case "industrial_suppression":
      return "industrial_suppression";
    case "emergency_exit_lighting":
      return "emergency_exit_lighting";
    default:
      return "general_fire_protection";
  }
}

function buildQuoteLineDescription(deficiency: QuoteDeficiencyRecord) {
  const parts = [
    `Deficiency: ${deficiency.title}`,
    `Summary: ${deficiency.description}`,
    `System: ${String(deficiency.reportType).replaceAll("_", " ")}`,
    `Severity: ${deficiency.severity}`,
    deficiency.deviceType ? `Device: ${deficiency.deviceType}` : null,
    deficiency.location ? `Location: ${deficiency.location}` : null,
    deficiency.assetTag ? `Asset tag: ${deficiency.assetTag}` : null,
    deficiency.notes ? `Notes: ${deficiency.notes}` : null,
    "Recommended correction: Review, price, and add the needed repair/service line items before sending."
  ];

  return parts.filter(Boolean).join("\n");
}

function buildQuoteInternalNotes(deficiencies: QuoteDeficiencyRecord[]) {
  return [
    "Generated from deficiency records. Confirm selected deficiencies and add priced correction line items before sending.",
    "",
    ...deficiencies.flatMap((deficiency, index) => [
      `${index + 1}. ${deficiency.title}`,
      `Inspection: ${deficiency.inspectionId} on ${deficiency.inspection.scheduledStart.toISOString()}`,
      `System: ${String(deficiency.reportType).replaceAll("_", " ")} | Severity: ${deficiency.severity}`,
      deficiency.location ? `Location: ${deficiency.location}` : null,
      deficiency.notes ? `Notes: ${deficiency.notes}` : null,
      deficiency.photoStorageKey ? `Photo evidence attached to deficiency ${deficiency.id}.` : null,
      ""
    ].filter((line): line is string => Boolean(line)))
  ].join("\n").trim();
}

function ensureSameQuoteContext(deficiencies: QuoteDeficiencyRecord[]) {
  const first = deficiencies[0];
  if (!first) {
    throw new Error("Select at least one deficiency before generating a quote.");
  }

  const mismatched = deficiencies.find((deficiency) =>
    deficiency.inspection.customerCompanyId !== first.inspection.customerCompanyId ||
    deficiency.siteId !== first.siteId
  );

  if (mismatched) {
    throw new Error("Selected deficiencies must belong to the same customer and service site.");
  }

  return first;
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
  const typedSites = (sites as DeficiencyDashboardSite[]).filter((site) => getCustomerFacingSiteLabel(site.name));
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
      siteName: getCustomerFacingSiteLabel(siteNames.get(deficiency.siteId)) ?? null
    }))
  };
}

export async function updateDeficiencyStatus(actor: ActorContext, deficiencyId: string, status: string) {
  const parsedActor = parseActor(actor);
  assertDeficiencyAdminAccess(parsedActor);

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

export async function generateQuoteFromDeficiencies(actor: ActorContext, deficiencyIds: string[]) {
  const parsedActor = parseActor(actor);
  assertDeficiencyAdminAccess(parsedActor);
  const tenantId = parsedActor.tenantId as string;
  const uniqueDeficiencyIds = [...new Set(deficiencyIds.map((id) => id.trim()).filter(Boolean))];

  if (uniqueDeficiencyIds.length === 0) {
    throw new Error("Select at least one deficiency before generating a quote.");
  }

  const deficiencies = await prisma.deficiency.findMany({
    where: {
      tenantId,
      id: { in: uniqueDeficiencyIds }
    },
    include: {
      inspection: {
        select: {
          id: true,
          scheduledStart: true,
          customerCompanyId: true,
          customerCompany: {
            select: {
              id: true,
              name: true,
              contactName: true,
              billingEmail: true
            }
          }
        }
      },
      site: {
        select: {
          id: true,
          name: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true
        }
      }
    },
    orderBy: [{ severity: "desc" }, { createdAt: "asc" }]
  });

  if (deficiencies.length !== uniqueDeficiencyIds.length) {
    throw new Error("One or more selected deficiencies could not be found.");
  }

  const quoteContext = ensureSameQuoteContext(deficiencies);
  const now = new Date();
  const lineItems = deficiencies.map((deficiency, index) => ({
    tenantId,
    sortOrder: index,
    internalCode: "DEFICIENCY_REPAIR",
    title: truncateText(`Deficiency correction - ${deficiency.title}`, 160),
    description: buildQuoteLineDescription(deficiency),
    quantity: 1,
    unitPrice: 0,
    discountAmount: 0,
    taxable: false,
    total: 0,
    qbItemId: null,
    inspectionType: deficiency.reportType in inspectionTypeRegistry ? deficiency.reportType : null,
    category: "repair"
  }));
  const subtotal = roundMoney(lineItems.reduce((sum, line) => sum + line.total, 0));
  const proposalType = mapReportTypeToQuoteProposalType(String(quoteContext.reportType));

  return prisma.$transaction(async (tx) => {
    const quoteNumber = buildNextQuoteNumberFromCount(await tx.quote.count({ where: { tenantId } }));
    const quote = await tx.quote.create({
      data: {
        tenantId,
        quoteNumber,
        customerCompanyId: quoteContext.inspection.customerCompanyId,
        siteId: quoteContext.siteId,
        customSiteName: null,
        contactName: quoteContext.inspection.customerCompany.contactName,
        recipientEmail: quoteContext.inspection.customerCompany.billingEmail,
        proposalType,
        includeDepositRequirement: false,
        issuedAt: now,
        expiresAt: getDefaultQuoteExpirationDate(now),
        status: QuoteStatus.draft,
        syncStatus: QuoteSyncStatus.not_synced,
        deliveryStatus: QuoteDeliveryStatus.not_sent,
        subtotal,
        taxAmount: 0,
        total: subtotal,
        internalNotes: buildQuoteInternalNotes(deficiencies),
        customerNotes: "Deficiency correction proposal prepared for review.",
        createdByUserId: parsedActor.userId,
        updatedByUserId: parsedActor.userId,
        lineItems: {
          create: lineItems
        }
      },
      select: {
        id: true,
        quoteNumber: true
      }
    });

    await tx.deficiency.updateMany({
      where: {
        tenantId,
        id: { in: uniqueDeficiencyIds }
      },
      data: {
        status: "quoted",
        quoteId: quote.id
      }
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "quote.created_from_deficiencies",
        entityType: "Quote",
        entityId: quote.id,
        metadata: {
          quoteNumber: quote.quoteNumber,
          deficiencyIds: uniqueDeficiencyIds,
          inspectionId: quoteContext.inspectionId,
          siteId: quoteContext.siteId
        }
      }
    });

    await Promise.all(uniqueDeficiencyIds.map((deficiencyId) => tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: parsedActor.userId,
        action: "deficiency.quoted",
        entityType: "Deficiency",
        entityId: deficiencyId,
        metadata: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber
        }
      }
    })));

    return quote;
  });
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
