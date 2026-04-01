import crypto from "crypto";

import { prisma, type Prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { hashPassword } from "./auth";
import { assertTenantContext } from "./permissions";
import {
  allowanceKeys,
  allowanceLabelMap,
  customerAllowanceKeys,
  internalAllowanceKeys,
  type TeamAllowanceKey,
  type TeamAllowanceMap
} from "./team-management-shared";

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

const acceptInviteSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(160)
});

const completePasswordResetSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8)
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
      role: true,
      allowances: true
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

  const [users, invites, customers] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        allowances: true,
        lastLoginAt: true,
        createdAt: true,
        customerCompany: { select: { id: true, name: true } }
      }
    }),
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

  const formattedUsers = users.map((user) => {
    const typedRole = user.role as (typeof userRoleOptions)[number];
    const allowances = sanitizeAllowancesForRole(
      typedRole,
      allowanceMapSchema.safeParse(user.allowances ?? {}).success ? allowanceMapSchema.parse(user.allowances ?? {}) : null
    );

    return {
      ...user,
      allowances,
      allowanceLabels: getAllowanceLabels(typedRole, allowances),
      kind: typedRole === "customer_user" ? "customer" : "internal"
    };
  });

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
  const userStatusMatches = (user: { isActive: boolean }) =>
    requestedStatus === "all"
    || (requestedStatus === "active" && user.isActive)
    || (requestedStatus === "inactive" && !user.isActive);
  const inviteStatusMatches = (invite: { derivedStatus: string }) =>
    requestedStatus === "all" || requestedStatus === invite.derivedStatus;

  const internalUsers = formattedUsers.filter((user) =>
    user.kind === "internal"
    && roleMatches(user.role)
    && userStatusMatches(user)
    && (!query || matcher(user.name) || matcher(user.email))
  );

  const customerUsers = formattedUsers.filter((user) =>
    user.kind === "customer"
    && roleMatches(user.role)
    && userStatusMatches(user)
    && (!query || matcher(user.name) || matcher(user.email) || matcher(user.customerCompany?.name))
  );

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
      teamMembers: formattedUsers.filter((user) => user.kind === "internal").length,
      customerPortalUsers: formattedUsers.filter((user) => user.kind === "customer").length,
      pendingInvites: formattedInvites.filter((invite) => invite.derivedStatus === "pending").length,
      inactiveUsers: formattedUsers.filter((user) => !user.isActive).length
    },
    customerCompanies: customers,
    teamMembers: internalUsers,
    customerPortalUsers: customerUsers,
    teamInvites: internalInvites,
    customerInvites
  };
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
      select: { id: true }
    });

    if (!customer) {
      throw new Error("Customer company not found.");
    }
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

  return {
    invite,
    inviteUrl: buildInviteUrl(token)
  };
}

export async function resendAccountInvitation(actor: ActorContext, inviteId: string) {
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

  return { inviteUrl: buildInviteUrl(token) };
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
    select: { id: true, role: true }
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

  return { resetUrl: buildPasswordResetUrl(token) };
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
