import { InspectionStatus, Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";
import type { ActorContext, InspectionType } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";
import { z } from "zod";

import { sendCustomerBrandedEmail } from "./account-email";
import { resolveTenantBranding } from "./branding";
import { mapInspectionTypeToComplianceReportingDivision } from "./compliance-reporting-fees";
import { assertTenantContext } from "./permissions";
import { inspectionTypeRegistry } from "./report-config";

const inspectionReminderTemplateKey = "inspection_due_this_month";
const customerWelcomeTemplateKey = "customer_welcome";
const emailReminderPageSize = 20;
const liveInspectionStatuses = [
  InspectionStatus.to_be_completed,
  InspectionStatus.scheduled,
  InspectionStatus.in_progress,
  InspectionStatus.follow_up_required
] as const;
const excludedTaskStatuses = [InspectionStatus.completed, InspectionStatus.invoiced, InspectionStatus.cancelled] as const;
const excludedTaskSchedulingStatuses = ["completed"] as const;

export type EmailReminderRecipientRow = {
  customerCompanyId: string;
  customerName: string;
  recipientEmail: string | null;
  hasValidEmail: boolean;
  dueMonth: string;
  siteSummary: string;
  siteNames: string[];
  inspectionTypes: InspectionType[];
  inspectionTypeLabels: string[];
  divisions: string[];
  lastSentAt: Date | null;
  taskCount: number;
};

export type EmailReminderTemplateDefinition = {
  key: string;
  label: string;
  subject: string;
  body: string;
  category: "reminder" | "welcome";
  previewEyebrow: string;
  previewTitle: string;
  previewFooter?: string;
  sendSuccessLabel: string;
};

export const emailReminderTemplateDefinitions: EmailReminderTemplateDefinition[] = [
  {
    key: inspectionReminderTemplateKey,
    label: "Inspection due this month",
    subject: "Your Fire Inspection Is Due This Month",
    category: "reminder",
    previewEyebrow: "Inspection reminder",
    previewTitle: "Your fire inspection is due this month",
    previewFooter: "If your inspection has already been completed or scheduled, please disregard this message.",
    sendSuccessLabel: "reminder email",
    body: `Hello {{customerName}},

This is a reminder that your fire system inspection is due this month.

Our team will be reaching out to coordinate service and ensure everything is completed in accordance with required safety and compliance standards.

If you have a preferred date or time, feel free to reply and we’ll make every effort to accommodate your schedule.

Otherwise, no action is needed — we’ll take care of scheduling directly with your team.

We appreciate the opportunity to help keep your property safe and compliant.

Best regards,
{{companyName}}

If your inspection has already been completed or scheduled, please disregard this message.`
  },
  {
    key: customerWelcomeTemplateKey,
    label: "Customer Welcome Email",
    subject: "Welcome to {{companyName}}",
    category: "welcome",
    previewEyebrow: "Customer welcome",
    previewTitle: "Welcome to {{companyName}}",
    sendSuccessLabel: "welcome email",
    body: `Hello {{customerName}},

Welcome to {{companyName}} - we're glad to have the opportunity to support your property.

Our team specializes in fire and life safety systems, and we're here to ensure your inspections, service, and compliance needs are handled with consistency and attention to detail.

You can expect a streamlined experience with clear communication, organized reporting, and reliable scheduling as we work together.

A member of our team may be reaching out to coordinate upcoming service or introduce themselves as your point of contact. If you have a preferred schedule, site-specific instructions, or any immediate questions, feel free to reply to this email and we'll take care of the rest.

We look forward to working with you.

Best regards,
{{companyName}}

If there is anything you would like us to be aware of regarding your property or systems, please don't hesitate to let us know.`
  }
];

function getEmailTemplateDefinition(templateKey: string) {
  const fallbackTemplate = emailReminderTemplateDefinitions[0];
  if (!fallbackTemplate) {
    throw new Error("Email templates are not configured.");
  }

  return emailReminderTemplateDefinitions.find((template) => template.key === templateKey) ?? fallbackTemplate;
}

const sendManualEmailRemindersInputSchema = z.object({
  dueMonth: z.string().regex(/^\d{4}-\d{2}$/),
  customerCompanyIds: z.array(z.string().trim().min(1)).min(1, "Select at least one customer."),
  templateKey: z.string().trim().min(1),
  subject: z.string().trim().min(1, "Add a subject before sending."),
  body: z.string().trim().min(1, "Add message content before sending.")
});

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function ensureAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can access Email Reminders.");
  }
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeMonthKey(input?: string | null) {
  return input && /^\d{4}-\d{2}$/.test(input) ? input : getCurrentMonthKey();
}

function getMonthDateRange(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function formatListSummary(values: string[]) {
  if (values.length === 0) {
    return "No site context";
  }
  if (values.length === 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values[0]}, ${values[1]}, +${values.length - 2} more`;
}

function formatAddressSummary(input: {
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) {
  const parts = [
    input.line1?.trim(),
    [input.city?.trim(), input.state?.trim(), input.postalCode?.trim()].filter(Boolean).join(" ").trim()
  ].filter(Boolean);

  return parts.join(", ");
}

function humanizeValue(value: string) {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function normalizeReminderText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replaceAll("â€™", "'")
    .replaceAll("â€”", "-")
    .replaceAll("’", "'")
    .replaceAll("—", "-")
    .replace(/Hello\s+,/g, "Hello,")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function mergeEmailReminderTemplate(
  template: string,
  fields: Record<"customerName" | "companyName" | "companyPhone" | "companyEmail", string>
) {
  return normalizeReminderText(
    template.replace(/{{\s*(customerName|companyName|companyPhone|companyEmail)\s*}}/g, (_, key) => fields[key as keyof typeof fields] ?? "")
  );
}

function buildReminderMergeFields(input: {
  customerName?: string | null;
  companyName: string;
  companyPhone?: string | null;
  companyEmail?: string | null;
}) {
  return {
    customerName: input.customerName?.trim() ?? "",
    companyName: input.companyName.trim(),
    companyPhone: input.companyPhone?.trim() ?? "",
    companyEmail: input.companyEmail?.trim() ?? ""
  } satisfies Record<"customerName" | "companyName" | "companyPhone" | "companyEmail", string>;
}

function buildReminderTextSearch(query: string): Prisma.InspectionTaskWhereInput | undefined {
  const trimmed = query.trim();
  if (!trimmed) {
    return undefined;
  }

  return {
    OR: [
      { inspection: { is: { id: { contains: trimmed, mode: "insensitive" } } } },
      { inspection: { is: { customerCompany: { is: { name: { contains: trimmed, mode: "insensitive" } } } } } },
      { inspection: { is: { customerCompany: { is: { billingEmail: { contains: trimmed, mode: "insensitive" } } } } } },
      { inspection: { is: { site: { is: { name: { contains: trimmed, mode: "insensitive" } } } } } },
      { inspection: { is: { site: { is: { addressLine1: { contains: trimmed, mode: "insensitive" } } } } } },
      { inspection: { is: { site: { is: { city: { contains: trimmed, mode: "insensitive" } } } } } }
    ]
  };
}

function buildCustomerReminderSearch(query: string): Prisma.CustomerCompanyWhereInput | undefined {
  const trimmed = query.trim();
  if (!trimmed) {
    return undefined;
  }

  return {
    OR: [
      { name: { contains: trimmed, mode: "insensitive" } },
      { contactName: { contains: trimmed, mode: "insensitive" } },
      { billingEmail: { contains: trimmed, mode: "insensitive" } },
      { phone: { contains: trimmed, mode: "insensitive" } },
      { serviceAddressLine1: { contains: trimmed, mode: "insensitive" } },
      { serviceCity: { contains: trimmed, mode: "insensitive" } },
      { billingAddressLine1: { contains: trimmed, mode: "insensitive" } },
      { billingCity: { contains: trimmed, mode: "insensitive" } },
      { sites: { some: { name: { contains: trimmed, mode: "insensitive" } } } },
      { sites: { some: { addressLine1: { contains: trimmed, mode: "insensitive" } } } },
      { sites: { some: { city: { contains: trimmed, mode: "insensitive" } } } }
    ]
  };
}

async function fetchRecipientCustomers(input: {
  tenantId: string;
  query?: string;
  hasValidEmail?: "all" | "yes" | "no";
  customerCompanyIds?: string[];
}) {
  const andFilters: Prisma.CustomerCompanyWhereInput[] = [{ tenantId: input.tenantId }];
  const textSearch = buildCustomerReminderSearch(input.query ?? "");
  if (textSearch) {
    andFilters.push(textSearch);
  }

  if (input.customerCompanyIds?.length) {
    andFilters.push({ id: { in: input.customerCompanyIds } });
  }

  if (input.hasValidEmail === "yes") {
    andFilters.push({ billingEmail: { not: null } });
    andFilters.push({ NOT: { billingEmail: "" } });
  }

  if (input.hasValidEmail === "no") {
    andFilters.push({
      OR: [{ billingEmail: null }, { billingEmail: "" }]
    });
  }

  const where = andFilters.length === 1 ? andFilters[0] : { AND: andFilters };

  return prisma.customerCompany.findMany({
    where,
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      contactName: true,
      billingEmail: true,
      phone: true,
      serviceAddressLine1: true,
      serviceCity: true,
      serviceState: true,
      servicePostalCode: true,
      billingAddressLine1: true,
      billingCity: true,
      billingState: true,
      billingPostalCode: true,
      sites: {
        select: {
          id: true,
          name: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true
        },
        orderBy: [{ name: "asc" }, { createdAt: "asc" }]
      }
    }
  });
}

function buildRecipientBaseWhere(input: {
  tenantId: string;
  dueMonth: string;
  query?: string;
  hasValidEmail?: "all" | "yes" | "no";
  inspectionType?: string;
  division?: string;
  customerCompanyIds?: string[];
}) {
  const { start, end } = getMonthDateRange(input.dueMonth);
  const andFilters: Prisma.InspectionTaskWhereInput[] = [
    {
      tenantId: input.tenantId,
      status: { notIn: [...excludedTaskStatuses] },
      schedulingStatus: { notIn: [...excludedTaskSchedulingStatuses] },
      inspection: {
        is: {
          tenantId: input.tenantId,
          status: { in: [...liveInspectionStatuses] }
        }
      },
      OR: [
        { dueMonth: input.dueMonth },
        {
          AND: [
            { dueMonth: null },
            { recurrence: { is: { nextDueAt: { gte: start, lte: end } } } }
          ]
        },
        {
          AND: [
            { dueMonth: null },
            { recurrence: { is: null } },
            { dueDate: { gte: start, lte: end } }
          ]
        }
      ]
    }
  ];

  if (input.customerCompanyIds?.length) {
    andFilters.push({
      inspection: { is: { customerCompanyId: { in: input.customerCompanyIds } } }
    });
  }

  if (input.hasValidEmail === "yes") {
    andFilters.push({
      inspection: { is: { customerCompany: { is: { billingEmail: { not: null } } } } }
    });
  }

  if (input.hasValidEmail === "no") {
    andFilters.push({
      OR: [
        { inspection: { is: { customerCompany: { is: { billingEmail: null } } } } },
        { inspection: { is: { customerCompany: { is: { billingEmail: "" } } } } }
      ]
    });
  }

  if (input.inspectionType) {
    andFilters.push({ inspectionType: input.inspectionType as InspectionType });
  }

  if (input.division) {
    const inspectionTypes = (Object.keys(inspectionTypeRegistry) as InspectionType[]).filter(
      (inspectionType) => mapInspectionTypeToComplianceReportingDivision(inspectionType) === input.division
    );

    if (inspectionTypes.length === 0) {
      andFilters.push({ id: "__no_match__" });
    } else {
      andFilters.push({ inspectionType: { in: inspectionTypes } });
    }
  }

  const textSearch = buildReminderTextSearch(input.query ?? "");
  if (textSearch) {
    andFilters.push(textSearch);
  }

  return andFilters.length === 1 ? andFilters[0] : { AND: andFilters };
}

async function fetchRecipientTaskRows(input: {
  tenantId: string;
  dueMonth: string;
  query?: string;
  hasValidEmail?: "all" | "yes" | "no";
  inspectionType?: string;
  division?: string;
  customerCompanyIds?: string[];
}) {
  return prisma.inspectionTask.findMany({
    where: buildRecipientBaseWhere(input),
    include: {
      inspection: {
        select: {
          id: true,
          customerCompanyId: true,
          customerCompany: {
            select: {
              id: true,
              name: true,
              contactName: true,
              billingEmail: true,
              serviceAddressLine1: true,
              serviceCity: true,
              serviceState: true,
              servicePostalCode: true,
              billingAddressLine1: true,
              billingCity: true,
              billingState: true,
              billingPostalCode: true
            }
          },
          site: {
            select: {
              id: true,
              name: true,
              city: true,
              addressLine1: true
            }
          }
        }
      }
    }
  });
}

function buildRecipientRows(input: {
  dueMonth: string;
  customers: Awaited<ReturnType<typeof fetchRecipientCustomers>>;
  taskRows: Awaited<ReturnType<typeof fetchRecipientTaskRows>>;
  lastSentByCustomerId: Map<string, Date>;
  restrictToTaskMatches?: boolean;
}) {
  const grouped = new Map<string, EmailReminderRecipientRow>(
    input.customers.map((customer) => {
      const siteNames = uniqueStrings([
        ...customer.sites.map(
          (site) =>
            site.name?.trim() ||
            formatAddressSummary({
              line1: site.addressLine1,
              city: site.city,
              state: site.state,
              postalCode: site.postalCode
            })
        ),
        formatAddressSummary({
          line1: customer.serviceAddressLine1 ?? customer.billingAddressLine1,
          city: customer.serviceCity ?? customer.billingCity,
          state: customer.serviceState ?? customer.billingState,
          postalCode: customer.servicePostalCode ?? customer.billingPostalCode
        })
      ]);

      const baseSiteNames = siteNames.length > 0 ? siteNames : ["No site context"];

      return [
        customer.id,
        {
          customerCompanyId: customer.id,
          customerName: customer.name,
          recipientEmail: customer.billingEmail?.trim() || null,
          hasValidEmail: Boolean(customer.billingEmail?.trim()),
          dueMonth: input.dueMonth,
          siteSummary: formatListSummary(baseSiteNames),
          siteNames: baseSiteNames,
          inspectionTypes: [],
          inspectionTypeLabels: [],
          divisions: [],
          lastSentAt: input.lastSentByCustomerId.get(customer.id) ?? null,
          taskCount: 0
        } satisfies EmailReminderRecipientRow
      ];
    })
  );

  for (const task of input.taskRows) {
    const customer = task.inspection.customerCompany;
    const customerId = customer.id;
    const existing = grouped.get(customerId);
    const siteName =
      task.inspection.site.name?.trim() ||
      formatAddressSummary({
        line1: customer.serviceAddressLine1 ?? customer.billingAddressLine1,
        city: customer.serviceCity ?? customer.billingCity,
        state: customer.serviceState ?? customer.billingState,
        postalCode: customer.servicePostalCode ?? customer.billingPostalCode
      });
    const inspectionType = task.inspectionType;
    const division = mapInspectionTypeToComplianceReportingDivision(inspectionType) ?? inspectionType;

    if (!existing) {
      continue;
    }

    existing.taskCount += 1;
    existing.siteNames = uniqueStrings([...existing.siteNames, siteName]);
    existing.siteSummary = formatListSummary(existing.siteNames);
    existing.inspectionTypes = [...new Set([...existing.inspectionTypes, inspectionType])];
    existing.inspectionTypeLabels = existing.inspectionTypes.map(
      (value) => inspectionTypeRegistry[value]?.label ?? humanizeValue(value)
    );
    existing.divisions = uniqueStrings([...existing.divisions, division]);
  }

  const rows = [...grouped.values()].sort((left, right) => left.customerName.localeCompare(right.customerName));
  return input.restrictToTaskMatches ? rows.filter((row) => row.taskCount > 0) : rows;
}

export async function getEmailReminderWorkspaceData(
  actor: ActorContext,
  input?: {
    query?: string;
    dueMonth?: string;
    hasValidEmail?: "all" | "yes" | "no";
    inspectionType?: string;
    division?: string;
    page?: number;
  }
) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);

  const tenantId = parsedActor.tenantId as string;
  const dueMonth = normalizeMonthKey(input?.dueMonth);
  const page = Number.isFinite(input?.page) && (input?.page ?? 1) > 0 ? Math.floor(input?.page ?? 1) : 1;
  const customers = await fetchRecipientCustomers({
    tenantId,
    query: input?.query?.trim() ?? "",
    hasValidEmail: input?.hasValidEmail ?? "all"
  });
  const taskRows = await fetchRecipientTaskRows({
    tenantId,
    dueMonth,
    inspectionType: input?.inspectionType ?? "",
    division: input?.division ?? ""
  });

  const customerIds = uniqueStrings(customers.map((customer) => customer.id));
  const logs = customerIds.length
    ? await prisma.emailReminderSendLog.findMany({
        where: {
          tenantId,
          dueMonth,
          customerCompanyId: { in: customerIds }
        },
        orderBy: { sentAt: "desc" },
        select: {
          customerCompanyId: true,
          sentAt: true
        }
      })
    : [];
  const lastSentByCustomerId = new Map<string, Date>();
  for (const log of logs) {
    if (!lastSentByCustomerId.has(log.customerCompanyId)) {
      lastSentByCustomerId.set(log.customerCompanyId, log.sentAt);
    }
  }

  const allRecipients = buildRecipientRows({
    dueMonth,
    customers,
    taskRows,
    lastSentByCustomerId,
    restrictToTaskMatches: Boolean(input?.inspectionType || input?.division)
  });
  const pagedRecipients = allRecipients.slice((page - 1) * emailReminderPageSize, page * emailReminderPageSize);
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      billingEmail: true,
      branding: true
    }
  });

  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  const branding = resolveTenantBranding({
    tenantName: tenant.name,
    branding: tenant.branding,
    billingEmail: tenant.billingEmail
  });
  const history = await prisma.emailReminderSendLog.findMany({
    where: { tenantId },
    orderBy: { sentAt: "desc" },
    take: 8,
    include: {
      customerCompany: { select: { name: true } },
      sentBy: { select: { name: true } }
    }
  });

  return {
    tenantName: tenant.name,
    branding,
    filters: {
      query: input?.query?.trim() ?? "",
      dueMonth,
      hasValidEmail: input?.hasValidEmail ?? "all",
      inspectionType: input?.inspectionType ?? "",
      division: input?.division ?? ""
    },
    pagination: {
      page,
      limit: emailReminderPageSize,
      totalCount: allRecipients.length,
      totalPages: Math.max(1, Math.ceil(allRecipients.length / emailReminderPageSize))
    },
    templates: emailReminderTemplateDefinitions,
    options: {
      dueMonths: Array.from({ length: 12 }, (_, index) => {
        const baseDate = new Date();
        baseDate.setUTCDate(1);
        baseDate.setUTCMonth(baseDate.getUTCMonth() + index);
        const monthKey = `${baseDate.getUTCFullYear()}-${String(baseDate.getUTCMonth() + 1).padStart(2, "0")}`;
        return {
          value: monthKey,
          label: baseDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
        };
      }),
      inspectionTypes: [
        { value: "", label: "All inspection types" },
        ...(Object.entries(inspectionTypeRegistry) as Array<[InspectionType, { label: string }]>).map(([value, definition]) => ({
          value,
          label: definition.label
        }))
      ],
      divisions: [
        { value: "", label: "All divisions" },
        ...uniqueStrings(
          (Object.keys(inspectionTypeRegistry) as InspectionType[])
            .map((inspectionType) => mapInspectionTypeToComplianceReportingDivision(inspectionType))
            .filter(Boolean)
        ).map((division) => ({
          value: division ?? "",
          label: humanizeValue(division ?? "")
        }))
      ]
    },
    summary: {
      candidateCount: allRecipients.length,
      withValidEmail: allRecipients.filter((recipient) => recipient.hasValidEmail).length,
      sentRecently: allRecipients.filter((recipient) => recipient.lastSentAt).length
    },
    recipients: pagedRecipients.map((recipient) => ({
      ...recipient,
      lastSentAt: recipient.lastSentAt ? recipient.lastSentAt.toISOString() : null
    })),
    recentHistory: history.map((entry) => ({
      id: entry.id,
      customerName: entry.customerCompany.name,
      recipientEmail: entry.recipientEmail,
      subjectSnapshot: entry.subjectSnapshot,
      templateKey: entry.templateKey,
      templateLabel: getEmailTemplateDefinition(entry.templateKey).label,
      sentAt: entry.sentAt.toISOString(),
      sentByName: entry.sentBy.name,
      dueMonth: entry.dueMonth,
      providerReason: entry.providerReason,
      providerError: entry.providerError
    }))
  };
}

export async function sendManualEmailReminders(
  actor: ActorContext,
  input: z.infer<typeof sendManualEmailRemindersInputSchema>
) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const parsedInput = sendManualEmailRemindersInputSchema.parse(input);
  const template = getEmailTemplateDefinition(parsedInput.templateKey);

  const tenantId = parsedActor.tenantId as string;
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      billingEmail: true,
      branding: true
    }
  });

  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  const branding = resolveTenantBranding({
    tenantName: tenant.name,
    branding: tenant.branding,
    billingEmail: tenant.billingEmail
  });

  const taskRows = await fetchRecipientTaskRows({
    tenantId,
    dueMonth: parsedInput.dueMonth,
    customerCompanyIds: parsedInput.customerCompanyIds
  });
  const customers = await fetchRecipientCustomers({
    tenantId,
    customerCompanyIds: parsedInput.customerCompanyIds
  });
  const recipients = buildRecipientRows({
    dueMonth: parsedInput.dueMonth,
    customers,
    taskRows,
    lastSentByCustomerId: new Map()
  }).filter((recipient) => parsedInput.customerCompanyIds.includes(recipient.customerCompanyId));

  if (recipients.length === 0) {
    throw new Error("No eligible email recipients were found for the selected customers.");
  }

  const logsToCreate: Array<Prisma.EmailReminderSendLogCreateManyInput> = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    if (!recipient.recipientEmail) {
      failedCount += 1;
      continue;
    }

    const mergeFields = buildReminderMergeFields({
      customerName: recipient.customerName,
      companyName: branding.legalBusinessName,
      companyPhone: branding.phone,
      companyEmail: branding.email
    });
    const mergedSubject = mergeEmailReminderTemplate(parsedInput.subject, mergeFields);
    const mergedBody = mergeEmailReminderTemplate(parsedInput.body, mergeFields);
    const delivery = await sendCustomerBrandedEmail({
      recipientEmail: recipient.recipientEmail,
      recipientName: recipient.customerName || "Customer",
      tenantName: tenant.name,
      subjectLine: mergedSubject,
      bodyText: mergedBody,
      eyebrow: template.previewEyebrow,
      title: mergeEmailReminderTemplate(template.previewTitle, mergeFields),
      footer: template.previewFooter,
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

    if (delivery.sent) {
      sentCount += 1;
    } else {
      failedCount += 1;
    }

    logsToCreate.push({
      tenantId,
      customerCompanyId: recipient.customerCompanyId,
      sentByUserId: parsedActor.userId,
      templateKey: parsedInput.templateKey,
      recipientEmail: recipient.recipientEmail,
      dueMonth: template.category === "reminder" ? parsedInput.dueMonth : null,
      siteSummary: template.category === "reminder" ? recipient.siteSummary : null,
      subjectSnapshot: mergedSubject,
      bodySnapshot: mergedBody,
      inspectionTypes: template.category === "reminder" ? recipient.inspectionTypes : [],
      divisions: template.category === "reminder" ? recipient.divisions : [],
      messageId: delivery.messageId,
      provider: delivery.provider,
      providerReason: delivery.reason,
      providerError: delivery.error,
      sentAt: new Date()
    });
  }

  if (logsToCreate.length > 0) {
    await prisma.emailReminderSendLog.createMany({
      data: logsToCreate
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorUserId: parsedActor.userId,
      action: template.category === "welcome" ? "customer_email.manual_send" : "email_reminder.manual_send",
      entityType: "EmailReminderSendLog",
      entityId: parsedInput.templateKey,
      metadata: {
        templateKey: parsedInput.templateKey,
        dueMonth: parsedInput.dueMonth,
        sentCount,
        failedCount,
        customerCompanyIds: parsedInput.customerCompanyIds
      }
    }
  });

  return {
    templateLabel: template.sendSuccessLabel,
    sentCount,
    failedCount,
    totalCount: recipients.length
  };
}
