import type { Prisma } from "@prisma/client";
import { InspectionStatus, QuoteStatus } from "@prisma/client";
import { prisma } from "@testworx/db";
import type { ActorContext, InspectionType } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { getCustomerPaymentTermsLabel } from "./customer-companies";
import { getQuickBooksCustomerInvoiceHistory } from "./quickbooks";
import { quoteStatusLabels } from "./quotes";
import { inspectionTypeRegistry } from "./report-config";
import { inspectionStatusLabels } from "./scheduling";
import { assertTenantContext } from "./permissions";
import { invoiceDeliverySettingsSchema, requiredBillingReferencesSchema } from "./third-party-billing";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can access client profiles.");
  }
}

function humanizeValue(value: string) {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function maxDate(values: Array<Date | null | undefined>) {
  const valid = values
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime());
  return valid[0] ?? null;
}

function buildAddressLines(input: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}) {
  return [
    [input.line1, input.line2].filter(Boolean).join(", "),
    [input.city, input.state, input.postalCode].filter(Boolean).join(" "),
    input.country
  ].filter(Boolean);
}

function formatAddress(input: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}) {
  return buildAddressLines(input).join(", ");
}

function buildInspectionTypeLabel(inspectionType: InspectionType) {
  return inspectionTypeRegistry[inspectionType]?.label ?? humanizeValue(inspectionType);
}

function buildQuoteStatusLabel(status: QuoteStatus) {
  return quoteStatusLabels[status] ?? humanizeValue(status);
}

function buildInspectionTaskHistoryLabel(task: { inspectionType: InspectionType; customDisplayLabel?: string | null }) {
  return task.customDisplayLabel?.trim() || buildInspectionTypeLabel(task.inspectionType);
}

export async function getClientProfileData(actor: ActorContext, customerCompanyId: string) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);

  const tenantId = parsedActor.tenantId as string;
  const customer = await prisma.customerCompany.findFirst({
    where: {
      id: customerCompanyId,
      tenantId
    },
    include: {
      sites: {
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: {
              inspections: true,
              assets: true
            }
          }
        }
      }
    }
  });

  if (!customer) {
    return null;
  }

  const [inspections, quotes, documents, attachments, quickBooksBilling] = await Promise.all([
    prisma.inspection.findMany({
      where: { tenantId, customerCompanyId },
      orderBy: [{ scheduledStart: "desc" }],
      take: 50,
      include: {
        site: { select: { id: true, name: true, city: true } },
        assignedTechnician: { select: { id: true, name: true } },
        technicianAssignments: { include: { technician: { select: { id: true, name: true } } } },
        tasks: { select: { id: true, inspectionType: true, customDisplayLabel: true } },
        reports: { select: { id: true, finalizedAt: true, status: true } },
        deficiencies: { select: { id: true } },
        billingSummary: {
          select: {
            id: true,
            status: true,
            quickbooksInvoiceId: true,
            quickbooksInvoiceNumber: true,
            quickbooksSendStatus: true,
            subtotal: true,
            createdAt: true,
            updatedAt: true
          }
        },
        convertedFromQuotes: { select: { id: true, quoteNumber: true } }
      }
    }),
    prisma.quote.findMany({
      where: { tenantId, customerCompanyId },
      orderBy: [{ issuedAt: "desc" }],
      take: 50,
      include: {
        site: { select: { id: true, name: true } }
      }
    }),
    prisma.inspectionDocument.findMany({
      where: {
        tenantId,
        inspection: { customerCompanyId }
      },
      orderBy: { uploadedAt: "desc" },
      take: 30,
      include: {
        inspection: {
          select: {
            id: true,
            scheduledStart: true,
            site: { select: { name: true } }
          }
        }
      }
    }),
    prisma.attachment.findMany({
      where: {
        tenantId,
        inspectionReport: { inspection: { customerCompanyId } }
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        inspectionReport: {
          select: {
            inspection: {
              select: {
                id: true,
                scheduledStart: true,
                site: { select: { name: true } }
              }
            }
          }
        }
      }
    }),
    getQuickBooksCustomerInvoiceHistory(actor, customerCompanyId)
  ]);

  const inspectionIds = inspections.map((inspection) => inspection.id);
  const quoteIds = quotes.map((quote) => quote.id);
  const billingSummaryIds = inspections
    .map((inspection) => inspection.billingSummary?.id ?? null)
    .filter((id): id is string => Boolean(id));

  const auditLogFilters: Prisma.AuditLogWhereInput[] = [
    { entityType: "CustomerCompany", entityId: customerCompanyId }
  ];
  if (quoteIds.length) {
    auditLogFilters.push({ entityType: "Quote", entityId: { in: quoteIds } });
  }
  if (inspectionIds.length) {
    auditLogFilters.push({ entityType: "Inspection", entityId: { in: inspectionIds } });
  }
  if (billingSummaryIds.length) {
    auditLogFilters.push({ entityType: "InspectionBillingSummary", entityId: { in: billingSummaryIds } });
  }

  const relatedAuditLogs = await prisma.auditLog.findMany({
    where: {
      tenantId,
      OR: auditLogFilters
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      actor: { select: { name: true } }
    }
  });

  const invoiceSummary = {
    unpaidCount: quickBooksBilling.invoices.filter((invoice) => invoice.balanceDue > 0).length,
    overdueCount: quickBooksBilling.invoices.filter((invoice) => invoice.paymentStatus === "overdue").length,
    totalInvoiced: quickBooksBilling.invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    totalPaid: quickBooksBilling.invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
    overdueTotal: quickBooksBilling.invoices
      .filter((invoice) => invoice.paymentStatus === "overdue")
      .reduce((sum, invoice) => sum + invoice.balanceDue, 0),
    lastInvoiceAt: maxDate(quickBooksBilling.invoices.map((invoice) => invoice.invoiceDate))
  };

  const openQuoteStatuses: QuoteStatus[] = [QuoteStatus.draft, QuoteStatus.sent, QuoteStatus.viewed];
  const upcomingInspectionStatuses: InspectionStatus[] = [
    InspectionStatus.to_be_completed,
    InspectionStatus.scheduled,
    InspectionStatus.in_progress,
    InspectionStatus.follow_up_required
  ];
  const now = new Date();

  const inspectionHistory = inspections
    .filter((inspection) => inspection.tasks.some((task) => task.inspectionType !== "work_order"))
    .map((inspection) => ({
      id: inspection.id,
      inspectionNumber: inspection.id.slice(-8).toUpperCase(),
      scheduledStart: inspection.scheduledStart,
      siteName: inspection.site.name,
      status: inspection.status,
      statusLabel: inspectionStatusLabels[inspection.status],
      resultLabel:
        inspection.deficiencies.length > 0
          ? `${inspection.deficiencies.length} deficiencies`
          : inspection.status === InspectionStatus.completed || inspection.status === InspectionStatus.invoiced
            ? "Completed"
            : "In progress",
      technicianName:
        inspection.assignedTechnician?.name
        ?? inspection.technicianAssignments.map((assignment) => assignment.technician?.name).filter(Boolean).join(", ")
        ?? "Unassigned",
      inspectionTypes: inspection.tasks.map((task) => ({
        value: task.inspectionType,
        label: buildInspectionTaskHistoryLabel(task)
      })),
      reportLink: inspection.tasks[0] ? `/app/admin/reports/${inspection.id}/${inspection.tasks[0].id}` : null,
      inspectionLink: `/app/admin/inspections/${inspection.id}`,
      archiveLink:
        inspection.status === InspectionStatus.completed || inspection.status === InspectionStatus.invoiced
          ? `/app/admin/archive/${inspection.id}`
          : null
    }));

  const workHistory = inspections
    .filter((inspection) => inspection.tasks.some((task) => task.inspectionType === "work_order"))
    .map((inspection) => ({
      id: inspection.id,
      inspectionNumber: inspection.id.slice(-8).toUpperCase(),
      scheduledStart: inspection.scheduledStart,
      siteName: inspection.site.name,
      statusLabel: inspectionStatusLabels[inspection.status],
      technicianName:
        inspection.assignedTechnician?.name
        ?? inspection.technicianAssignments.map((assignment) => assignment.technician?.name).filter(Boolean).join(", ")
        ?? "Unassigned",
      summary: inspection.tasks.map((task) => buildInspectionTaskHistoryLabel(task)).join(", "),
      inspectionLink: `/app/admin/inspections/${inspection.id}`
    }));

  const quoteHistory = quotes.map((quote) => ({
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    issuedAt: quote.issuedAt,
    expiresAt: quote.expiresAt,
    total: quote.total,
    status: quote.status,
    statusLabel: buildQuoteStatusLabel(quote.status),
    siteName: quote.site?.name ?? "No site linked",
    hostedQuoteUrl: quote.quoteAccessToken ? `/quote/${quote.quoteAccessToken}` : null,
    quickbooksEstimateNumber: quote.quickbooksEstimateNumber,
    detailLink: `/app/admin/quotes/${quote.id}`
  }));

  const documentEntries = [
    ...documents.map((document) => ({
      id: `inspection-document-${document.id}`,
      title: document.label || document.fileName,
      type: "Inspection document",
      uploadedAt: document.uploadedAt,
      siteName: document.inspection.site.name,
      href: `/api/inspection-documents/${document.id}?variant=preferred`,
      relatedLink: `/app/admin/inspections/${document.inspection.id}`
    })),
    ...attachments.map((attachment) => ({
      id: `attachment-${attachment.id}`,
      title: attachment.fileName,
      type: "Inspection attachment",
      uploadedAt: attachment.createdAt,
      siteName: attachment.inspectionReport?.inspection.site.name ?? "No site linked",
      href: `/api/attachments/${attachment.id}`,
      relatedLink: attachment.inspectionReport?.inspection.id
        ? `/app/admin/inspections/${attachment.inspectionReport.inspection.id}`
        : "/app/admin/clients"
    })),
    ...quotes.map((quote) => ({
      id: `quote-${quote.id}`,
      title: `${quote.quoteNumber} PDF`,
      type: "Proposal PDF",
      uploadedAt: quote.updatedAt,
      siteName: quote.site?.name ?? "No site linked",
      href: `/api/quotes/${quote.id}/pdf`,
      relatedLink: `/app/admin/quotes/${quote.id}`
    }))
  ]
    .sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime())
    .slice(0, 30);

  const activity = [
    ...inspectionHistory.map((inspection) => ({
      id: `inspection-${inspection.id}`,
      type: "Inspection",
      title: `${inspection.statusLabel} inspection ${inspection.inspectionNumber}`,
      detail: `${inspection.siteName} • ${inspection.inspectionTypes.map((type) => type.label).join(", ")}`,
      timestamp: inspection.scheduledStart,
      href: inspection.inspectionLink
    })),
    ...quoteHistory.map((quote) => ({
      id: `quote-${quote.id}`,
      type: "Quote",
      title: `${quote.statusLabel} quote ${quote.quoteNumber}`,
      detail: `${quote.siteName} • $${quote.total.toFixed(2)}`,
      timestamp: quote.issuedAt,
      href: quote.detailLink
    })),
    ...quickBooksBilling.invoices.map((invoice) => ({
      id: `invoice-${invoice.invoiceId}`,
      type: "Invoice",
      title: `${invoice.statusLabel} invoice ${invoice.invoiceNumber ?? invoice.invoiceId}`,
      detail: `$${invoice.totalAmount.toFixed(2)} total • $${invoice.balanceDue.toFixed(2)} balance`,
      timestamp: invoice.invoiceDate ?? invoice.lastUpdatedAt ?? now,
      href: invoice.invoiceUrl
    })),
    ...relatedAuditLogs.map((entry) => ({
      id: `audit-${entry.id}`,
      type: "Activity",
      title: humanizeValue(entry.action.replaceAll(".", "_")),
      detail: entry.actor?.name ? `By ${entry.actor.name}` : "System event",
      timestamp: entry.createdAt,
      href: null
    }))
  ]
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, 30);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      contactName: customer.contactName,
      billingEmail: customer.billingEmail,
      phone: customer.phone,
      isActive: customer.isActive,
      isTaxExempt: customer.isTaxExempt,
      billingAddressSameAsService: customer.billingAddressSameAsService,
      paymentTermsCode: customer.paymentTermsCode,
      customPaymentTermsLabel: customer.customPaymentTermsLabel,
      customPaymentTermsDays: customer.customPaymentTermsDays,
      billingType: customer.billingType,
      billToAccountId: customer.billToAccountId,
      contractProfileId: customer.contractProfileId,
      invoiceDeliverySettings: invoiceDeliverySettingsSchema.parse(customer.invoiceDeliverySettings ?? { method: "payer_email" }),
      autoBillingEnabled: customer.autoBillingEnabled,
      requiredBillingReferences: requiredBillingReferencesSchema.parse(customer.requiredBillingReferences ?? {}),
      paymentTermsLabel: getCustomerPaymentTermsLabel({
        paymentTermsCode: customer.paymentTermsCode,
        customPaymentTermsLabel: customer.customPaymentTermsLabel,
        customPaymentTermsDays: customer.customPaymentTermsDays
      }),
      quickbooksCustomerId: customer.quickbooksCustomerId,
      notes: customer.notes,
      billingAddressLine1: customer.billingAddressLine1,
      billingAddressLine2: customer.billingAddressLine2,
      billingCity: customer.billingCity,
      billingState: customer.billingState,
      billingPostalCode: customer.billingPostalCode,
      billingCountry: customer.billingCountry,
      serviceAddressLine1: customer.serviceAddressLine1,
      serviceAddressLine2: customer.serviceAddressLine2,
      serviceCity: customer.serviceCity,
      serviceState: customer.serviceState,
      servicePostalCode: customer.servicePostalCode,
      serviceCountry: customer.serviceCountry,
      billingAddress: formatAddress({
        line1: customer.billingAddressLine1,
        line2: customer.billingAddressLine2,
        city: customer.billingCity,
        state: customer.billingState,
        postalCode: customer.billingPostalCode,
        country: customer.billingCountry
      }),
      serviceAddress: formatAddress({
        line1: customer.serviceAddressLine1,
        line2: customer.serviceAddressLine2,
        city: customer.serviceCity,
        state: customer.serviceState,
        postalCode: customer.servicePostalCode,
        country: customer.serviceCountry
      }),
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    },
    overview: {
      siteCount: customer.sites.length,
      openQuoteCount: quotes.filter((quote) => openQuoteStatuses.includes(quote.status)).length,
      upcomingInspectionCount: inspections.filter((inspection) => upcomingInspectionStatuses.includes(inspection.status)).length,
      unpaidInvoiceCount: invoiceSummary.unpaidCount,
      overdueInvoiceCount: invoiceSummary.overdueCount,
      totalInvoiced: invoiceSummary.totalInvoiced,
      totalPaid: invoiceSummary.totalPaid,
      overdueTotal: invoiceSummary.overdueTotal,
      totalHistoricalRevenue: invoiceSummary.totalInvoiced,
      lastInspectionAt: maxDate(inspections.map((inspection) => inspection.scheduledStart)),
      lastInvoiceAt: invoiceSummary.lastInvoiceAt,
      lastActivityAt: maxDate([
        maxDate(inspections.map((inspection) => inspection.updatedAt)),
        maxDate(quotes.map((quote) => quote.updatedAt)),
        invoiceSummary.lastInvoiceAt
      ])
    },
    sites: customer.sites.map((site) => ({
      id: site.id,
      name: site.name,
      address: formatAddress(site),
      city: site.city,
      assetCount: site._count.assets,
      inspectionCount: site._count.inspections
    })),
    inspectionHistory,
    workHistory,
    quoteHistory,
    billing: quickBooksBilling,
    documents: documentEntries,
    notes: {
      customerNotes: customer.notes,
      recentActivity: relatedAuditLogs.slice(0, 10).map((entry) => ({
        id: entry.id,
        action: humanizeValue(entry.action.replaceAll(".", "_")),
        actorName: entry.actor?.name ?? "System",
        createdAt: entry.createdAt
      }))
    },
    activity
  };
}
