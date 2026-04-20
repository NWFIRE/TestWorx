import { InspectionStatus, Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";

import type { ActorContext, InspectionType } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { mapInspectionTypeToComplianceReportingDivision } from "./compliance-reporting-fees";
import { assertTenantContext } from "./permissions";
import { buildInspectionPacketDocuments } from "./report-service";
import { inspectionTypeRegistry } from "./report-config";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can access the inspection archive.");
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function formatSiteAddress(input: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) {
  return [
    [input.addressLine1, input.addressLine2].filter(Boolean).join(", "),
    [input.city, input.state, input.postalCode].filter(Boolean).join(" ")
  ].filter(Boolean).join(", ");
}

function buildArchiveResultStatus(input: {
  status: InspectionStatus;
  deficiencyCount: number;
}) {
  if (input.deficiencyCount > 0) {
    return "Deficiencies found";
  }

  if (input.status === InspectionStatus.invoiced) {
    return "Invoiced";
  }

  return "Completed";
}

function buildInspectionArchiveSnapshot(input: {
  status: InspectionStatus;
  completedAt: Date | null;
  archivedAt: Date | null;
  customerCompany: { name: string };
  site: { name: string; addressLine1: string; addressLine2: string | null; city: string; state: string; postalCode: string };
  assignedTechnician: { name: string } | null;
  technicianAssignments: Array<{ technician: { name: string } | null }>;
  tasks: Array<{ inspectionType: InspectionType }>;
  reports: Array<{ id: string }>;
  deficiencies: Array<{ id: string }>;
}) {
  const inspectionTypes = uniqueStrings(
    input.tasks.map((task) => task.inspectionType)
  );
  const divisions = uniqueStrings(
    input.tasks.map((task) => mapInspectionTypeToComplianceReportingDivision(task.inspectionType) ?? task.inspectionType.replaceAll("_", " "))
  );
  const technicianName = (
    input.assignedTechnician?.name
    ?? uniqueStrings(input.technicianAssignments.map((assignment) => assignment.technician?.name)).join(", ")
  ) || null;
  const deficiencyCount = input.deficiencies.length;

  return {
    completedAt: input.completedAt,
    archivedAt: input.archivedAt,
    archiveCustomerName: input.customerCompany.name,
    archiveSiteName: input.site.name,
    archiveSiteAddress: formatSiteAddress(input.site),
    archiveSiteCity: input.site.city,
    archiveTechnicianName: technicianName,
    archiveResultStatus: buildArchiveResultStatus({
      status: input.status,
      deficiencyCount
    }),
    archiveInspectionTypes: inspectionTypes,
    archiveDivisions: divisions,
    archiveHasDeficiencies: deficiencyCount > 0,
    archiveDeficiencyCount: deficiencyCount,
    archiveHasReport: input.reports.length > 0
  };
}

export async function syncInspectionArchiveStateTx(
  tx: Prisma.TransactionClient | typeof prisma,
  input: {
    tenantId: string;
    inspectionId: string;
    completedAtOverride?: Date | null;
    archivedAtOverride?: Date | null;
  }
) {
  const inspection = await tx.inspection.findFirst({
    where: { id: input.inspectionId, tenantId: input.tenantId },
    include: {
      customerCompany: { select: { name: true } },
      site: {
        select: {
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true
        }
      },
      assignedTechnician: { select: { name: true } },
      technicianAssignments: { include: { technician: { select: { name: true } } } },
      tasks: { select: { inspectionType: true } },
      reports: { select: { id: true } },
      deficiencies: { select: { id: true } }
    }
  });

  if (!inspection) {
    throw new Error("Inspection not found.");
  }

  const isArchived = inspection.status === InspectionStatus.completed || inspection.status === InspectionStatus.invoiced;
  if (!isArchived) {
    await tx.inspection.update({
      where: { id: inspection.id },
      data: {
        completedAt: null,
        archivedAt: null,
        archiveCustomerName: null,
        archiveSiteName: null,
        archiveSiteAddress: null,
        archiveSiteCity: null,
        archiveTechnicianName: null,
        archiveResultStatus: null,
        archiveInspectionTypes: [],
        archiveDivisions: [],
        archiveHasDeficiencies: false,
        archiveDeficiencyCount: 0,
        archiveHasReport: false
      }
    });
    return;
  }

  const completedAt = input.completedAtOverride ?? inspection.completedAt ?? new Date();
  const archivedAt = input.archivedAtOverride ?? inspection.archivedAt ?? completedAt;

  await tx.inspection.update({
    where: { id: inspection.id },
    data: buildInspectionArchiveSnapshot({
      status: inspection.status,
      completedAt,
      archivedAt,
      customerCompany: inspection.customerCompany,
      site: inspection.site,
      assignedTechnician: inspection.assignedTechnician,
      technicianAssignments: inspection.technicianAssignments,
      tasks: inspection.tasks,
      reports: inspection.reports,
      deficiencies: inspection.deficiencies
    })
  });
}

const archivePageSize = 20;

function buildArchiveTextSearch(query: string): Prisma.InspectionWhereInput | undefined {
  const trimmed = query.trim();
  if (!trimmed) {
    return undefined;
  }

  return {
    OR: [
      { id: { contains: trimmed, mode: "insensitive" } },
      { archiveCustomerName: { contains: trimmed, mode: "insensitive" } },
      { archiveSiteName: { contains: trimmed, mode: "insensitive" } },
      { archiveSiteAddress: { contains: trimmed, mode: "insensitive" } },
      { archiveSiteCity: { contains: trimmed, mode: "insensitive" } },
      { archiveTechnicianName: { contains: trimmed, mode: "insensitive" } },
      { archiveResultStatus: { contains: trimmed, mode: "insensitive" } },
      { customerCompany: { is: { name: { contains: trimmed, mode: "insensitive" } } } },
      { site: { is: { name: { contains: trimmed, mode: "insensitive" } } } },
      { site: { is: { city: { contains: trimmed, mode: "insensitive" } } } },
      { site: { is: { addressLine1: { contains: trimmed, mode: "insensitive" } } } },
      { assignedTechnician: { is: { name: { contains: trimmed, mode: "insensitive" } } } }
    ]
  };
}

function normalizeDateBoundary(value: string | undefined, boundary: "start" | "end") {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function getAdminInspectionArchiveData(
  actor: ActorContext,
  input?: {
    query?: string;
    page?: number;
    customerId?: string;
    siteId?: string;
    division?: string;
    inspectionType?: string;
    technicianId?: string;
    hasDeficiencies?: "all" | "yes" | "no";
    hasReport?: "all" | "yes" | "no";
    completedFrom?: string;
    completedTo?: string;
  }
) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);

  const tenantId = parsedActor.tenantId as string;
  const page = Number.isFinite(input?.page) && (input?.page ?? 1) > 0 ? Math.floor(input?.page ?? 1) : 1;
  const query = input?.query?.trim() ?? "";
  const completedFrom = normalizeDateBoundary(input?.completedFrom, "start");
  const completedTo = normalizeDateBoundary(input?.completedTo, "end");
  const andFilters: Prisma.InspectionWhereInput[] = [];

  if (input?.customerId) {
    andFilters.push({ customerCompanyId: input.customerId });
  }

  if (input?.siteId) {
    andFilters.push({ siteId: input.siteId });
  }

  if (input?.technicianId) {
    andFilters.push({
      OR: [
        { assignedTechnicianId: input.technicianId },
        { technicianAssignments: { some: { technicianId: input.technicianId } } }
      ]
    });
  }

  if (input?.hasDeficiencies === "yes") {
    andFilters.push({ archiveHasDeficiencies: true });
  } else if (input?.hasDeficiencies === "no") {
    andFilters.push({ archiveHasDeficiencies: false });
  }

  if (input?.hasReport === "yes") {
    andFilters.push({ archiveHasReport: true });
  } else if (input?.hasReport === "no") {
    andFilters.push({ archiveHasReport: false });
  }

  if (input?.inspectionType) {
    andFilters.push({
      OR: [
        { archiveInspectionTypes: { has: input.inspectionType } },
        { tasks: { some: { inspectionType: input.inspectionType as InspectionType } } }
      ]
    });
  }

  if (input?.division) {
    andFilters.push({
      OR: [
        { archiveDivisions: { has: input.division } },
        {
          tasks: {
            some: {
              inspectionType: {
                in: divisionToInspectionTypes(input.division)
              }
            }
          }
        }
      ]
    });
  }

  if (completedFrom || completedTo) {
    andFilters.push({
      completedAt: {
        ...(completedFrom ? { gte: completedFrom } : {}),
        ...(completedTo ? { lte: completedTo } : {})
      }
    });
  }

  const textSearch = buildArchiveTextSearch(query);
  if (textSearch) {
    andFilters.push(textSearch);
  }

  const where: Prisma.InspectionWhereInput = {
    tenantId,
    archivedAt: { not: null },
    ...(andFilters.length ? { AND: andFilters } : {})
  };

  const [rows, totalCount, customers, sites, technicians] = await Promise.all([
    prisma.inspection.findMany({
      where,
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * archivePageSize,
      take: archivePageSize,
      include: {
        customerCompany: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, city: true, addressLine1: true, state: true } },
        assignedTechnician: { select: { id: true, name: true } },
        technicianAssignments: { include: { technician: { select: { id: true, name: true } } } },
        tasks: { select: { id: true, inspectionType: true, customDisplayLabel: true } },
        reports: { select: { id: true, status: true, finalizedAt: true } },
        convertedFromQuotes: { select: { id: true, quoteNumber: true } }
      }
    }),
    prisma.inspection.count({ where }),
    prisma.customerCompany.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.site.findMany({ where: { tenantId }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId, role: "technician" }, select: { id: true, name: true }, orderBy: { name: "asc" } })
  ]);

  const divisionOptions = [
    { value: "fire_extinguishers", label: "Fire Extinguishers" },
    { value: "fire_alarm", label: "Fire Alarm" },
    { value: "fire_sprinkler", label: "Fire Sprinkler" },
    { value: "kitchen_suppression", label: "Kitchen Suppression" },
    { value: "work_order", label: "Work Order" }
  ];

  return {
    filters: {
      query,
      customerId: input?.customerId ?? "",
      siteId: input?.siteId ?? "",
      division: input?.division ?? "",
      inspectionType: input?.inspectionType ?? "",
      technicianId: input?.technicianId ?? "",
      hasDeficiencies: input?.hasDeficiencies ?? "all",
      hasReport: input?.hasReport ?? "all",
      completedFrom: input?.completedFrom ?? "",
      completedTo: input?.completedTo ?? ""
    },
    pagination: {
      page,
      limit: archivePageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / archivePageSize))
    },
    options: {
      customers,
      sites,
      technicians,
      divisions: divisionOptions,
      inspectionTypes: (Object.entries(inspectionTypeRegistry) as Array<[InspectionType, { label: string }]>).map(([value, definition]) => ({
        value,
        label: definition.label
      }))
    },
    summary: {
      archivedCount: totalCount,
      withDeficiencies: rows.filter((row) => row.archiveHasDeficiencies).length,
      withReports: rows.filter((row) => row.archiveHasReport).length,
      thisMonth: rows.filter((row) => {
        const completedAt = row.completedAt ?? row.archivedAt;
        if (!completedAt) {
          return false;
        }

        const now = new Date();
        return completedAt.getUTCFullYear() === now.getUTCFullYear() && completedAt.getUTCMonth() === now.getUTCMonth();
      }).length
    },
    inspections: rows.map((row) => ({
      id: row.id,
      inspectionNumber: row.id.slice(-8).toUpperCase(),
      completedAt: row.completedAt ?? row.archivedAt ?? row.updatedAt,
      customerName: row.archiveCustomerName ?? row.customerCompany.name,
      siteName: row.archiveSiteName ?? row.site.name,
      siteAddress: row.archiveSiteAddress ?? formatSiteAddress(row.site),
      city: row.archiveSiteCity ?? row.site.city,
      technicianName: (
        row.archiveTechnicianName
        ?? row.assignedTechnician?.name
        ?? uniqueStrings(row.technicianAssignments.map((assignment) => assignment.technician?.name)).join(", ")
      ) || "Unassigned",
      inspectionTypes: row.archiveInspectionTypes.length
        ? row.archiveInspectionTypes
        : row.tasks.map((task) => task.inspectionType),
      inspectionTypeLabels: row.archiveInspectionTypes.length
        ? row.archiveInspectionTypes
            .map((inspectionType) => inspectionTypeRegistry[inspectionType as InspectionType]?.label ?? inspectionType.replaceAll("_", " "))
        : row.tasks.map((task) => task.customDisplayLabel?.trim() || (inspectionTypeRegistry[task.inspectionType]?.label ?? task.inspectionType.replaceAll("_", " "))),
      divisions: row.archiveDivisions.length
        ? row.archiveDivisions
        : uniqueStrings(row.tasks.map((task) => mapInspectionTypeToComplianceReportingDivision(task.inspectionType) ?? task.inspectionType.replaceAll("_", " "))),
      resultStatus: row.archiveResultStatus ?? buildArchiveResultStatus({ status: row.status, deficiencyCount: row.archiveDeficiencyCount }),
      deficiencyCount: row.archiveDeficiencyCount,
      hasDeficiencies: row.archiveHasDeficiencies,
      hasReport: row.archiveHasReport,
      reportCount: row.reports.length,
      quoteNumber: row.convertedFromQuotes[0]?.quoteNumber ?? null
    }))
  };
}

function divisionToInspectionTypes(division: string): InspectionType[] {
  switch (division) {
    case "fire_extinguishers":
      return ["fire_extinguisher"];
    case "fire_alarm":
      return ["fire_alarm"];
    case "fire_sprinkler":
      return ["wet_fire_sprinkler", "dry_fire_sprinkler", "joint_commission_fire_sprinkler"];
    case "kitchen_suppression":
      return ["kitchen_suppression"];
    case "work_order":
      return ["work_order"];
    default:
      return [] as InspectionType[];
  }
}

export async function getAdminInspectionArchiveDetail(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);

  const tenantId = parsedActor.tenantId as string;
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, tenantId, archivedAt: { not: null } },
    include: {
      customerCompany: true,
      site: true,
      assignedTechnician: true,
      technicianAssignments: { include: { technician: true } },
      tasks: {
        include: {
          report: true,
          recurrence: true
        }
      },
      attachments: true,
      documents: true,
      deficiencies: {
        orderBy: [{ createdAt: "desc" }]
      },
      billingSummary: {
        select: {
          id: true,
          status: true,
          quickbooksInvoiceId: true,
          quickbooksInvoiceNumber: true
        }
      },
      convertedFromQuotes: {
        select: { id: true, quoteNumber: true, status: true }
      }
    }
  });

  if (!inspection) {
    return null;
  }

  const packetDocuments = buildInspectionPacketDocuments({
    reports: inspection.tasks
      .filter((task) => task.report?.id && task.report.finalizedAt)
      .map((task) => ({
        id: task.report!.id,
        title: task.customDisplayLabel?.trim() || inspectionTypeRegistry[task.inspectionType].label,
        happenedAt: task.report!.finalizedAt,
        customerVisible: true,
        viewPath: `/app/admin/reports/${inspection.id}/${task.id}`
      })),
    attachments: inspection.attachments.map((attachment) => ({
      ...attachment,
      source: attachment.source
    })),
    inspectionDocuments: inspection.documents.map((document) => ({
      ...document,
      uploadedAt: document.uploadedAt
    }))
  });

  return {
    id: inspection.id,
    inspectionNumber: inspection.id.slice(-8).toUpperCase(),
    status: inspection.status,
    completedAt: inspection.completedAt ?? inspection.archivedAt ?? inspection.updatedAt,
    archivedAt: inspection.archivedAt ?? inspection.updatedAt,
    resultStatus: inspection.archiveResultStatus ?? buildArchiveResultStatus({ status: inspection.status, deficiencyCount: inspection.archiveDeficiencyCount }),
    snapshot: {
      customerName: inspection.archiveCustomerName ?? inspection.customerCompany.name,
      siteName: inspection.archiveSiteName ?? inspection.site.name,
      siteAddress: inspection.archiveSiteAddress ?? formatSiteAddress(inspection.site),
      city: inspection.archiveSiteCity ?? inspection.site.city,
      technicianName: (
        inspection.archiveTechnicianName
        ?? inspection.assignedTechnician?.name
        ?? uniqueStrings(inspection.technicianAssignments.map((assignment) => assignment.technician?.name)).join(", ")
      ) || "Unassigned"
    },
    customerCompany: {
      id: inspection.customerCompany.id,
      name: inspection.customerCompany.name,
      contactName: inspection.customerCompany.contactName,
      billingEmail: inspection.customerCompany.billingEmail,
      phone: inspection.customerCompany.phone
    },
    site: {
      id: inspection.site.id,
      name: inspection.site.name,
      address: formatSiteAddress(inspection.site),
      city: inspection.site.city,
      state: inspection.site.state,
      postalCode: inspection.site.postalCode
    },
    quote: inspection.convertedFromQuotes[0] ?? null,
    billingSummary: inspection.billingSummary,
    packetDocuments,
    deficiencies: inspection.deficiencies,
    tasks: inspection.tasks.map((task) => ({
      id: task.id,
      inspectionType: task.inspectionType,
      inspectionTypeLabel: task.customDisplayLabel?.trim() || inspectionTypeRegistry[task.inspectionType].label,
      reportId: task.report?.id ?? null,
      reportStatus: task.report?.status ?? null,
      finalizedAt: task.report?.finalizedAt ?? null
    }))
  };
}
