import crypto from "crypto";

import { prisma, type Prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { hashPassword } from "./auth";
import {
  sendWorkspaceInviteEmail,
  sendWorkspacePasswordResetEmail,
  type TransactionalEmailDeliveryResult
} from "./account-email";
import { assertTenantContext } from "./permissions";
import {
  allowanceKeys,
  allowanceLabelMap,
  customerAllowanceKeys,
  internalAllowanceKeys,
  type TeamAllowanceKey,
  type TeamAllowanceMap
} from "./team-management-shared";
import { inspectionTypeRegistry, type BrowserInspectionType } from "./inspection-types-shared";

const userRoleOptions = ["tenant_admin", "office_admin", "technician", "customer_user"] as const;
const inviteStatusOptions = ["pending", "accepted", "revoked"] as const;

const allowanceMapSchema = z.object(
  Object.fromEntries(allowanceKeys.map((key) => [key, z.boolean().optional()])) as Record<TeamAllowanceKey, z.ZodOptional<z.ZodBoolean>>
);

const inviteInputSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(160),
  role: z.enum(userRoleOptions),
  customerCompanyId: z.string().trim().optional(),
  allowances: allowanceMapSchema.optional()
}).superRefine((input, context) => {
  if (input.role === "customer_user" && !input.customerCompanyId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["customerCompanyId"],
      message: "Customer portal invites must be tied to a customer company."
    });
  }
});

const allowanceUpdateSchema = z.object({
  userId: z.string().trim().min(1),
  allowances: allowanceMapSchema
});

const inviteAllowanceUpdateSchema = z.object({
  inviteId: z.string().trim().min(1),
  allowances: allowanceMapSchema
});

const technicianEligibilityUpdateSchema = z.object({
  technicianUserId: z.string().trim().min(1),
  eligibilities: z.array(z.object({
    reportType: z.enum(Object.keys(inspectionTypeRegistry) as [BrowserInspectionType, ...BrowserInspectionType[]]),
    canBeAssigned: z.boolean().default(false),
    canClaim: z.boolean().default(false),
    licenseNumber: z.string().trim().max(120).optional().nullable(),
    expiresAt: z.union([z.coerce.date(), z.null()]).optional(),
    notes: z.string().trim().max(500).optional().nullable()
  }))
});

const acceptInviteSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(160)
});

const completePasswordResetSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8)
});

const userLookupSchema = z.object({
  kind: z.enum(["internal", "customer"]),
  query: z.string().trim().optional(),
  page: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(25).default(8),
  status: z.enum(["all", "active", "inactive"]).default("all")
});

function hashOneTimeToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createOneTimeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function requireTenantId(parsedActor: ReturnType<typeof parseActor>) {
  if (!parsedActor.tenantId) {
    throw new Error("Tenant context is required.");
  }

  return parsedActor.tenantId;
}

function getDefaultAllowancesForRole(role: (typeof userRoleOptions)[number]): TeamAllowanceMap {
  const base: TeamAllowanceMap = {
    accountAdmin: false,
    schedulingAccess: false,
    quoteAccess: false,
    billingAccess: false,
    settingsAccess: false,
    reportReviewAccess: false,
    deficiencyAccess: false,
    amendmentAccess: false,
    customerPortalAdmin: false,
    reportDownload: false,
    documentDownload: false,
    deficiencyVisibility: false,
    portalAdmin: false
  };

  switch (role) {
    case "tenant_admin":
      return Object.fromEntries(Object.keys(base).map((key) => [key, true])) as TeamAllowanceMap;
    case "office_admin":
      return {
        ...base,
        accountAdmin: true,
        schedulingAccess: true,
        quoteAccess: true,
        billingAccess: true,
        settingsAccess: true,
        reportReviewAccess: true,
        deficiencyAccess: true,
        amendmentAccess: true,
        customerPortalAdmin: true
      };
    case "technician":
      return {
        ...base,
        reportReviewAccess: true
      };
    case "customer_user":
      return {
        ...base,
        reportDownload: true,
        documentDownload: true,
        deficiencyVisibility: true
      };
    default:
      return base;
  }
}

function normalizeAllowancesForRole(
  role: (typeof userRoleOptions)[number],
  overrides?: Partial<TeamAllowanceMap> | null
) {
  return { ...getDefaultAllowancesForRole(role), ...(overrides ?? {}) };
}

function pickAllowedAllowanceKeys(role: (typeof userRoleOptions)[number]) {
  return role === "customer_user" ? customerAllowanceKeys : internalAllowanceKeys;
}

function sanitizeAllowancesForRole(
  role: (typeof userRoleOptions)[number],
  overrides?: Partial<TeamAllowanceMap> | null
) {
  const normalized = normalizeAllowancesForRole(role, overrides);
  const allowed = new Set(pickAllowedAllowanceKeys(role));
  const next = {} as TeamAllowanceMap;

  for (const key of allowanceKeys) {
    next[key] = allowed.has(key) ? normalized[key] : false;
  }

  return next;
}

function getAllowanceLabels(role: (typeof userRoleOptions)[number], allowances: TeamAllowanceMap) {
  return pickAllowedAllowanceKeys(role)
    .filter((key) => allowances[key])
    .map((key) => ({ key, label: allowanceLabelMap[key] }));
}

async function createAuditLog(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; actorUserId: string; action: string; entityType: string; entityId: string; metadata?: Record<string, unknown> }
) {
  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as Prisma.JsonObject | undefined
    }
  });
}

async function getActorWithAllowances(parsedActor: ReturnType<typeof parseActor>) {
  const actorUser = await prisma.user.findFirst({
    where: {
      id: parsedActor.userId,
      tenantId: parsedActor.tenantId ?? undefined
    },
    select: {
      id: true,
      name: true,
      role: true,
      allowances: true,
      tenant: { select: { name: true } }
    }
  });

  if (!actorUser) {
    throw new Error("User not found.");
  }

  return actorUser;
}

function ensureTeamManagementAccess(actorUser: { role: string; allowances: Prisma.JsonValue | null }) {
  if (actorUser.role === "platform_admin" || actorUser.role === "tenant_admin") {
    return;
  }

  if (actorUser.role !== "office_admin") {
    throw new Error("Only administrators can manage team access.");
  }

  const effective = sanitizeAllowancesForRole("office_admin", allowanceMapSchema.safeParse(actorUser.allowances ?? {}).success
    ? allowanceMapSchema.parse(actorUser.allowances ?? {})
    : null);

  if (!effective.accountAdmin) {
    throw new Error("Your account does not have team management access.");
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function buildInviteUrl(token: string) {
  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
}

function buildPasswordResetUrl(token: string) {
  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

async function createEmailAuditLog(input: {
  tenantId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  delivery: TransactionalEmailDeliveryResult;
  recipientEmail: string;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: {
        provider: input.delivery.provider,
        sent: input.delivery.sent,
        messageId: input.delivery.messageId,
        reason: input.delivery.reason,
        error: input.delivery.error,
        recipientEmail: input.recipientEmail
      }
    }
  });
}

function deriveInviteStatus(invite: { status: string; expiresAt: Date }) {
  if (invite.status !== "pending") {
    return invite.status;
  }

  return invite.expiresAt.getTime() < Date.now() ? "expired" : "pending";
}

export async function getTeamWorkspaceData(
  actor: ActorContext,
  input?: {
    query?: string;
    status?: string;
    role?: string;
  }
) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);

  const query = input?.query?.trim().toLowerCase() ?? "";
  const requestedStatus = input?.status?.trim() || "all";
  const requestedRole = input?.role?.trim() || "all";

  const [summaryCounts, invites, customers] = await Promise.all([
    prisma.$transaction([
      prisma.user.count({
        where: {
          tenantId,
          role: { not: "customer_user" }
        }
      }),
      prisma.user.count({
        where: {
          tenantId,
          role: "customer_user"
        }
      }),
      prisma.user.count({
        where: {
          tenantId,
          isActive: false
        }
      }),
      prisma.accountInvitation.count({
        where: {
          tenantId,
          status: "pending",
          expiresAt: { gt: new Date() }
        }
      })
    ]),
    prisma.accountInvitation.findMany({
      where: { tenantId },
      orderBy: [{ sentAt: "desc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        allowances: true,
        status: true,
        sentAt: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
        customerCompany: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, name: true } }
      }
    }),
    prisma.customerCompany.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    })
  ]);

  const formattedInvites = invites.map((invite) => {
    const typedRole = invite.role as (typeof userRoleOptions)[number];
    const allowances = sanitizeAllowancesForRole(
      typedRole,
      allowanceMapSchema.safeParse(invite.allowances ?? {}).success ? allowanceMapSchema.parse(invite.allowances ?? {}) : null
    );

    return {
      ...invite,
      allowances,
      allowanceLabels: getAllowanceLabels(typedRole, allowances),
      derivedStatus: deriveInviteStatus(invite),
      kind: typedRole === "customer_user" ? "customer" : "internal"
    };
  });

  const matcher = (value: string | null | undefined) => value?.toLowerCase().includes(query) ?? false;
  const roleMatches = (role: string) => requestedRole === "all" || role === requestedRole;
  const inviteStatusFilter =
    requestedStatus === "pending" || requestedStatus === "expired" || requestedStatus === "revoked"
      ? requestedStatus
      : "all";
  const inviteStatusMatches = (invite: { derivedStatus: string }) =>
    inviteStatusFilter === "all" || inviteStatusFilter === invite.derivedStatus;

  const internalInvites = formattedInvites.filter((invite) =>
    invite.kind === "internal"
    && roleMatches(invite.role)
    && inviteStatusMatches(invite)
    && (!query || matcher(invite.name) || matcher(invite.email))
  );

  const customerInvites = formattedInvites.filter((invite) =>
    invite.kind === "customer"
    && roleMatches(invite.role)
    && inviteStatusMatches(invite)
    && (!query || matcher(invite.name) || matcher(invite.email) || matcher(invite.customerCompany?.name))
  );

  return {
    filters: {
      query: input?.query ?? "",
      status: requestedStatus,
      role: requestedRole
    },
    summary: {
      teamMembers: summaryCounts[0],
      customerPortalUsers: summaryCounts[1],
      pendingInvites: summaryCounts[3],
      inactiveUsers: summaryCounts[2]
    },
    customerCompanies: customers,
    teamInvites: internalInvites,
    customerInvites
  };
}

export async function searchTeamWorkspaceUsers(
  actor: ActorContext,
  rawInput: z.input<typeof userLookupSchema>
) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);
  const input = userLookupSchema.parse(rawInput);

  const query = input.query?.trim() ?? "";
  const statusWhere =
    input.status === "active"
      ? { isActive: true }
      : input.status === "inactive"
        ? { isActive: false }
        : {};

  const roleWhere =
    input.kind === "customer"
      ? { role: "customer_user" as const }
      : { role: { not: "customer_user" as const } };

  const searchWhere = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
          { customerCompany: { name: { contains: query, mode: "insensitive" as const } } }
        ]
      }
    : {};

  const users = await prisma.user.findMany({
    where: {
      tenantId,
      ...roleWhere,
      ...statusWhere,
      ...searchWhere
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { email: "asc" }],
    skip: input.page * input.limit,
    take: input.limit + 1,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      allowances: true,
      lastLoginAt: true,
      createdAt: true,
      customerCompany: { select: { id: true, name: true } },
      reportTypeEligibilities: {
        select: {
          reportType: true,
          canBeAssigned: true,
          canClaim: true,
          licenseRequired: true,
          licenseNumber: true,
          expiresAt: true,
          notes: true
        },
        orderBy: { reportType: "asc" }
      }
    }
  });

  const hasMore = users.length > input.limit;
  const pageItems = users.slice(0, input.limit).map((user) => {
    const typedRole = user.role as (typeof userRoleOptions)[number];
    const allowances = sanitizeAllowancesForRole(
      typedRole,
      allowanceMapSchema.safeParse(user.allowances ?? {}).success ? allowanceMapSchema.parse(user.allowances ?? {}) : null
    );

    return {
      ...user,
      allowances,
      allowanceLabels: getAllowanceLabels(typedRole, allowances),
      reportTypeEligibilities: user.role === "technician" ? user.reportTypeEligibilities : []
    };
  });

  return {
    items: pageItems,
    page: input.page,
    hasMore
  };
}

export async function updateTechnicianReportTypeEligibility(
  actor: ActorContext,
  rawInput: z.input<typeof technicianEligibilityUpdateSchema>
) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);
  const input = technicianEligibilityUpdateSchema.parse(rawInput);

  const technician = await prisma.user.findFirst({
    where: {
      id: input.technicianUserId,
      tenantId,
      role: "technician"
    },
    select: { id: true }
  });

  if (!technician) {
    throw new Error("Technician not found.");
  }

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      input.eligibilities.map((eligibility) =>
        tx.technicianReportTypeEligibility.upsert({
          where: {
            tenantId_technicianUserId_reportType: {
              tenantId,
              technicianUserId: technician.id,
              reportType: eligibility.reportType
            }
          },
          update: {
            canBeAssigned: eligibility.canBeAssigned,
            canClaim: eligibility.canClaim,
            licenseRequired: Boolean(eligibility.licenseNumber || eligibility.expiresAt),
            licenseNumber: eligibility.licenseNumber || null,
            expiresAt: eligibility.expiresAt ?? null,
            notes: eligibility.notes || null
          },
          create: {
            tenantId,
            technicianUserId: technician.id,
            reportType: eligibility.reportType,
            canBeAssigned: eligibility.canBeAssigned,
            canClaim: eligibility.canClaim,
            licenseRequired: Boolean(eligibility.licenseNumber || eligibility.expiresAt),
            licenseNumber: eligibility.licenseNumber || null,
            expiresAt: eligibility.expiresAt ?? null,
            notes: eligibility.notes || null
          }
        })
      )
    );

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "technician.report_type_eligibility_updated",
      entityType: "User",
      entityId: technician.id,
      metadata: {
        reportTypes: input.eligibilities.map((eligibility) => eligibility.reportType)
      }
    });
  });
}

export async function createAccountInvitation(
  actor: ActorContext,
  rawInput: z.input<typeof inviteInputSchema>
) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);
  const input = inviteInputSchema.parse({ ...rawInput, email: normalizeEmail(rawInput.email) });
  let customerName: string | null = null;

  const existingUser = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, tenantId: true } });
  if (existingUser) {
    throw new Error(existingUser.tenantId === tenantId ? "That email already belongs to a team member in this workspace." : "That email is already in use.");
  }

  const pendingInvite = await prisma.accountInvitation.findFirst({
    where: {
      tenantId,
      email: input.email,
      status: "pending",
      expiresAt: { gt: new Date() }
    },
    select: { id: true }
  });

  if (pendingInvite) {
    throw new Error("There is already an active invite for that email.");
  }

  if (input.customerCompanyId) {
    const customer = await prisma.customerCompany.findFirst({
      where: { id: input.customerCompanyId, tenantId },
      select: { id: true, name: true }
    });

    if (!customer) {
      throw new Error("Customer company not found.");
    }

    customerName = customer.name;
  }

  const token = createOneTimeToken();
  const tokenHash = hashOneTimeToken(token);
  const allowances = sanitizeAllowancesForRole(input.role, input.allowances ?? null);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const invite = await prisma.$transaction(async (tx) => {
    const created = await tx.accountInvitation.create({
      data: {
        tenantId,
        customerCompanyId: input.customerCompanyId || null,
        invitedByUserId: parsedActor.userId,
        email: input.email,
        name: input.name,
        role: input.role,
        allowances: allowances as Prisma.JsonObject,
        tokenHash,
        expiresAt
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true
      }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: input.role === "customer_user" ? "customer.portal_invite_created" : "team.invite_created",
      entityType: "AccountInvitation",
      entityId: created.id,
      metadata: { email: created.email, role: created.role }
    });

    return created;
  });

  const inviteUrl = buildInviteUrl(token);
  const roleLabel =
    input.role === "customer_user"
      ? "Customer portal user"
      : input.role === "tenant_admin"
        ? "Tenant admin"
        : input.role === "office_admin"
          ? "Office admin"
          : "Technician";
  const emailDelivery = await sendWorkspaceInviteEmail({
    recipientEmail: input.email,
    recipientName: input.name,
    tenantName: actorUser.tenant?.name ?? "TradeWorx",
    inviterName: actorUser.name,
    roleLabel,
    customerCompanyName: customerName,
    portalInvite: input.role === "customer_user",
    inviteUrl
  });

  await createEmailAuditLog({
    tenantId,
    actorUserId: parsedActor.userId,
    action: input.role === "customer_user"
      ? (emailDelivery.sent ? "customer.portal_invite_email_sent" : "customer.portal_invite_email_failed")
      : (emailDelivery.sent ? "team.invite_email_sent" : "team.invite_email_failed"),
    entityType: "AccountInvitation",
    entityId: invite.id,
    delivery: emailDelivery,
    recipientEmail: input.email
  });

  return {
    invite,
    inviteUrl,
    emailDelivery
  };
}

export async function resendAccountInvitation(actor: ActorContext, inviteId: string) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);

  const invite = await prisma.accountInvitation.findFirst({
    where: { id: inviteId, tenantId },
    select: {
      id: true,
      role: true,
      status: true,
      email: true,
      name: true,
      customerCompany: { select: { name: true } }
    }
  });

  if (!invite) {
    throw new Error("Invite not found.");
  }

  if (invite.status !== "pending") {
    throw new Error("Only pending invites can be resent.");
  }

  const token = createOneTimeToken();
  const tokenHash = hashOneTimeToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.$transaction(async (tx) => {
    await tx.accountInvitation.update({
      where: { id: invite.id },
      data: {
        tokenHash,
        sentAt: new Date(),
        expiresAt
      }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: invite.role === "customer_user" ? "customer.portal_invite_resent" : "team.invite_resent",
      entityType: "AccountInvitation",
      entityId: invite.id
    });
  });

  const inviteUrl = buildInviteUrl(token);
  const roleLabel =
    invite.role === "customer_user"
      ? "Customer portal user"
      : invite.role === "tenant_admin"
        ? "Tenant admin"
        : invite.role === "office_admin"
          ? "Office admin"
          : "Technician";
  const emailDelivery = await sendWorkspaceInviteEmail({
    recipientEmail: invite.email,
    recipientName: invite.name ?? invite.email,
    tenantName: actorUser.tenant?.name ?? "TradeWorx",
    inviterName: actorUser.name,
    roleLabel,
    customerCompanyName: invite.customerCompany?.name ?? null,
    portalInvite: invite.role === "customer_user",
    inviteUrl
  });

  await createEmailAuditLog({
    tenantId,
    actorUserId: parsedActor.userId,
    action: invite.role === "customer_user"
      ? (emailDelivery.sent ? "customer.portal_invite_email_resent" : "customer.portal_invite_email_resend_failed")
      : (emailDelivery.sent ? "team.invite_email_resent" : "team.invite_email_resend_failed"),
    entityType: "AccountInvitation",
    entityId: invite.id,
    delivery: emailDelivery,
    recipientEmail: invite.email
  });

  return { inviteUrl, emailDelivery };
}

export async function revokeAccountInvitation(actor: ActorContext, inviteId: string) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);

  const invite = await prisma.accountInvitation.findFirst({
    where: { id: inviteId, tenantId },
    select: { id: true, role: true, status: true }
  });

  if (!invite) {
    throw new Error("Invite not found.");
  }

  if (invite.status !== "pending") {
    throw new Error("Only pending invites can be revoked.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.accountInvitation.update({
      where: { id: invite.id },
      data: {
        status: "revoked",
        revokedAt: new Date()
      }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: invite.role === "customer_user" ? "customer.portal_invite_revoked" : "team.invite_revoked",
      entityType: "AccountInvitation",
      entityId: invite.id
    });
  });
}

export async function updateUserAllowances(actor: ActorContext, rawInput: z.input<typeof allowanceUpdateSchema>) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);
  const input = allowanceUpdateSchema.parse(rawInput);

  const user = await prisma.user.findFirst({
    where: { id: input.userId, tenantId },
    select: { id: true, role: true }
  });

  if (!user) {
    throw new Error("User not found.");
  }

  const allowances = sanitizeAllowancesForRole(user.role as (typeof userRoleOptions)[number], input.allowances);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { allowances: allowances as Prisma.JsonObject }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: user.role === "customer_user" ? "customer.portal_allowances_updated" : "team.allowances_updated",
      entityType: "User",
      entityId: user.id
    });
  });
}

export async function updateInviteAllowances(actor: ActorContext, rawInput: z.input<typeof inviteAllowanceUpdateSchema>) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);
  const input = inviteAllowanceUpdateSchema.parse(rawInput);

  const invite = await prisma.accountInvitation.findFirst({
    where: { id: input.inviteId, tenantId },
    select: { id: true, role: true, status: true }
  });

  if (!invite) {
    throw new Error("Invite not found.");
  }

  if (invite.status !== "pending") {
    throw new Error("Only pending invites can be updated.");
  }

  const allowances = sanitizeAllowancesForRole(invite.role as (typeof userRoleOptions)[number], input.allowances);

  await prisma.$transaction(async (tx) => {
    await tx.accountInvitation.update({
      where: { id: invite.id },
      data: { allowances: allowances as Prisma.JsonObject }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: invite.role === "customer_user" ? "customer.portal_invite_allowances_updated" : "team.invite_allowances_updated",
      entityType: "AccountInvitation",
      entityId: invite.id
    });
  });
}

export async function setUserActiveState(actor: ActorContext, userId: string, isActive: boolean) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, role: true, isActive: true }
  });

  if (!user) {
    throw new Error("User not found.");
  }

  if (user.role === "tenant_admin" && !isActive) {
    const tenantAdminCount = await prisma.user.count({
      where: { tenantId, role: "tenant_admin", isActive: true }
    });

    if (tenantAdminCount <= 1) {
      throw new Error("Keep at least one active tenant admin in the workspace.");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { isActive }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: isActive
        ? (user.role === "customer_user" ? "customer.portal_access_reactivated" : "team.member_reactivated")
        : (user.role === "customer_user" ? "customer.portal_access_deactivated" : "team.member_deactivated"),
      entityType: "User",
      entityId: user.id
    });
  });
}

export async function removeUserFromWorkspace(actor: ActorContext, userId: string) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: {
      id: true,
      role: true,
      _count: {
        select: {
          assignedInspections: true,
          createdInspections: true,
          inspectionReports: true,
          auditLogs: true,
          reportCorrectionEvents: true,
          createdAmendments: true,
          inspectionAssignments: true
        }
      }
    }
  });

  if (!user) {
    throw new Error("User not found.");
  }

  const operationalReferences = Object.values(user._count).reduce((sum, value) => sum + value, 0);
  if (operationalReferences > 0) {
    throw new Error("This account has operational history and cannot be removed. Deactivate it instead.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.user.delete({ where: { id: user.id } });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: user.role === "customer_user" ? "customer.portal_access_removed" : "team.member_removed",
      entityType: "User",
      entityId: user.id
    });
  });
}

export async function createPasswordResetRequest(actor: ActorContext, userId: string) {
  const parsedActor = parseActor(actor);
  const tenantId = requireTenantId(parsedActor);
  const actorUser = await getActorWithAllowances(parsedActor);
  ensureTeamManagementAccess(actorUser);

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, role: true, email: true, name: true }
  });

  if (!user) {
    throw new Error("User not found.");
  }

  const token = createOneTimeToken();
  const tokenHash = hashOneTimeToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() }
    });

    const created = await tx.passwordResetToken.create({
      data: {
        tenantId,
        userId: user.id,
        requestedByUserId: parsedActor.userId,
        tokenHash,
        expiresAt
      }
    });

    await createAuditLog(tx, {
      tenantId,
      actorUserId: parsedActor.userId,
      action: user.role === "customer_user" ? "customer.portal_password_reset_issued" : "team.password_reset_issued",
      entityType: "PasswordResetToken",
      entityId: created.id
    });
  });

  const resetUrl = buildPasswordResetUrl(token);
  const emailDelivery = await sendWorkspacePasswordResetEmail({
    recipientEmail: user.email,
    recipientName: user.name,
    tenantName: actorUser.tenant?.name ?? "TradeWorx",
    resetUrl
  });

  await createEmailAuditLog({
    tenantId,
    actorUserId: parsedActor.userId,
    action: user.role === "customer_user"
      ? (emailDelivery.sent ? "customer.portal_password_reset_email_sent" : "customer.portal_password_reset_email_failed")
      : (emailDelivery.sent ? "team.password_reset_email_sent" : "team.password_reset_email_failed"),
    entityType: "User",
    entityId: user.id,
    delivery: emailDelivery,
    recipientEmail: user.email
  });

  return { resetUrl, emailDelivery };
}

export async function getInvitationAcceptanceDetails(token: string) {
  const tokenHash = hashOneTimeToken(token);
  const invite = await prisma.accountInvitation.findFirst({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      expiresAt: true,
      customerCompany: { select: { name: true } },
      tenant: { select: { name: true } }
    }
  });

  if (!invite || deriveInviteStatus(invite) !== "pending") {
    return null;
  }

  return invite;
}

export async function acceptAccountInvitation(rawInput: z.input<typeof acceptInviteSchema>) {
  const input = acceptInviteSchema.parse(rawInput);
  const tokenHash = hashOneTimeToken(input.token);

  const invite = await prisma.accountInvitation.findFirst({
    where: { tokenHash },
    select: {
      id: true,
      tenantId: true,
      customerCompanyId: true,
      email: true,
      role: true,
      allowances: true,
      status: true,
      expiresAt: true
    }
  });

  if (!invite || deriveInviteStatus(invite) !== "pending") {
    throw new Error("This invite is invalid or has expired.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true }
  });

  if (existingUser) {
    throw new Error("That email already has an account.");
  }

  const passwordHash = await hashPassword(input.password);
  const allowances = sanitizeAllowancesForRole(
    invite.role as (typeof userRoleOptions)[number],
    allowanceMapSchema.safeParse(invite.allowances ?? {}).success ? allowanceMapSchema.parse(invite.allowances ?? {}) : null
  );

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: invite.tenantId,
        customerCompanyId: invite.customerCompanyId,
        email: invite.email,
        name: input.name,
        passwordHash,
        role: invite.role,
        allowances: allowances as Prisma.JsonObject,
        isActive: true
      }
    });

    await tx.accountInvitation.update({
      where: { id: invite.id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
        acceptedByUserId: user.id
      }
    });

    await createAuditLog(tx, {
      tenantId: invite.tenantId,
      actorUserId: user.id,
      action: invite.role === "customer_user" ? "customer.portal_invite_accepted" : "team.invite_accepted",
      entityType: "AccountInvitation",
      entityId: invite.id
    });
  });
}

export async function getPasswordResetDetails(token: string) {
  const tokenHash = hashOneTimeToken(token);
  const reset = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    select: {
      id: true,
      user: {
        select: {
          email: true,
          name: true,
          tenant: { select: { name: true } }
        }
      }
    }
  });

  return reset;
}

export async function completePasswordReset(rawInput: z.input<typeof completePasswordResetSchema>) {
  const input = completePasswordResetSchema.parse(rawInput);
  const tokenHash = hashOneTimeToken(input.token);

  const reset = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    select: {
      id: true,
      tenantId: true,
      userId: true
    }
  });

  if (!reset) {
    throw new Error("This reset link is invalid or has expired.");
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: reset.userId },
      data: {
        passwordHash,
        isActive: true
      }
    });

    await tx.passwordResetToken.update({
      where: { id: reset.id },
      data: { usedAt: new Date() }
    });

    await createAuditLog(tx, {
      tenantId: reset.tenantId,
      actorUserId: reset.userId,
      action: "account.password_reset_completed",
      entityType: "PasswordResetToken",
      entityId: reset.id
    });
  });
}
