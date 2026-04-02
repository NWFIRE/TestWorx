import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetServerEnvForTests } from "../env";

const prismaMock = {
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn()
  },
  customerCompany: {
    findFirst: vi.fn(),
    findMany: vi.fn()
  },
  accountInvitation: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  passwordResetToken: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn()
  },
  auditLog: {
    create: vi.fn()
  },
  $transaction: vi.fn()
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../auth", () => ({
  hashPassword: vi.fn(async (password: string) => `hashed:${password}`)
}));

function makeActor() {
  return {
    userId: "user_admin",
    role: "office_admin" as const,
    tenantId: "tenant_1"
  };
}

function makeAdminUser(overrides?: Partial<{ role: string; allowances: Record<string, boolean> | null }>) {
  return {
    id: "user_admin",
    role: overrides?.role ?? "office_admin",
    allowances: overrides?.allowances ?? { accountAdmin: true }
  };
}

function setupTransaction() {
  prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock as never));
}

describe("team management", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/testworx?schema=public");
    vi.stubEnv("AUTH_SECRET", "replace-with-a-long-random-secret");
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    prismaMock.auditLog.create.mockResolvedValue(undefined);
    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    setupTransaction();
    resetServerEnvForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvForTests();
  });

  it("creates an internal invite with a secure link", async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeAdminUser());
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.accountInvitation.findFirst.mockResolvedValue(null);
    prismaMock.accountInvitation.create.mockResolvedValue({
      id: "invite_1",
      email: "tech@example.com",
      role: "technician",
      name: "Tech User"
    });

    const { createAccountInvitation } = await import("../team-management");

    const result = await createAccountInvitation(makeActor(), {
      email: "tech@example.com",
      name: "Tech User",
      role: "technician",
      allowances: {
        reportReviewAccess: true,
        billingAccess: false
      }
    });

    expect(result.invite.id).toBe("invite_1");
    expect(result.inviteUrl).toMatch(/^http:\/\/localhost:3000\/accept-invite\?token=/);
    expect(prismaMock.accountInvitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        email: "tech@example.com",
        role: "technician",
        allowances: expect.objectContaining({
          reportReviewAccess: true,
          billingAccess: false,
          reportDownload: false
        })
      }),
      select: {
        id: true,
        email: true,
        role: true,
        name: true
      }
    });
  });

  it("creates a customer portal invite tied to a customer company", async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeAdminUser());
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.accountInvitation.findFirst.mockResolvedValue(null);
    prismaMock.customerCompany.findFirst.mockResolvedValue({ id: "customer_1" });
    prismaMock.accountInvitation.create.mockResolvedValue({
      id: "invite_customer_1",
      email: "portal@example.com",
      role: "customer_user",
      name: "Portal User"
    });

    const { createAccountInvitation } = await import("../team-management");

    await createAccountInvitation(makeActor(), {
      email: "portal@example.com",
      name: "Portal User",
      role: "customer_user",
      customerCompanyId: "customer_1",
      allowances: {
        reportDownload: true,
        documentDownload: true,
        portalAdmin: true
      }
    });

    expect(prismaMock.customerCompany.findFirst).toHaveBeenCalledWith({
      where: { id: "customer_1", tenantId: "tenant_1" },
      select: { id: true }
    });
    expect(prismaMock.accountInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerCompanyId: "customer_1",
          role: "customer_user",
          allowances: expect.objectContaining({
            reportDownload: true,
            portalAdmin: true,
            schedulingAccess: false
          })
        })
      })
    );
  });

  it("accepts a pending invite and creates the user account", async () => {
    prismaMock.accountInvitation.findFirst.mockResolvedValue({
      id: "invite_1",
      tenantId: "tenant_1",
      customerCompanyId: "customer_1",
      email: "new.user@example.com",
      role: "customer_user",
      allowances: { reportDownload: true, deficiencyVisibility: true },
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000)
    });
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "user_new" });
    prismaMock.accountInvitation.update.mockResolvedValue(undefined);

    const { acceptAccountInvitation } = await import("../team-management");

    await acceptAccountInvitation({
      token: "valid-token",
      name: "New User",
      password: "password123"
    });

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        customerCompanyId: "customer_1",
        email: "new.user@example.com",
        name: "New User",
        passwordHash: "hashed:password123",
        role: "customer_user",
        isActive: true
      })
    });
    expect(prismaMock.accountInvitation.update).toHaveBeenCalledWith({
      where: { id: "invite_1" },
      data: expect.objectContaining({
        status: "accepted",
        acceptedByUserId: "user_new"
      })
    });
  });

  it("rejects expired invites cleanly", async () => {
    prismaMock.accountInvitation.findFirst.mockResolvedValue({
      id: "invite_expired",
      tenantId: "tenant_1",
      customerCompanyId: null,
      email: "late@example.com",
      role: "technician",
      allowances: null,
      status: "pending",
      expiresAt: new Date(Date.now() - 60_000)
    });

    const { acceptAccountInvitation } = await import("../team-management");

    await expect(
      acceptAccountInvitation({
        token: "expired-token",
        name: "Late User",
        password: "password123"
      })
    ).rejects.toThrow("This invite is invalid or has expired.");
  });

  it("issues a password reset link and invalidates older active tokens", async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeAdminUser());
    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findFirst
      .mockResolvedValueOnce(makeAdminUser())
      .mockResolvedValueOnce({ id: "user_tech", role: "technician" });
    prismaMock.passwordResetToken.create.mockResolvedValue({ id: "reset_1" });

    const { createPasswordResetRequest } = await import("../team-management");

    const result = await createPasswordResetRequest(makeActor(), "user_tech");

    expect(result.resetUrl).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=/);
    expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_tech", usedAt: null },
      data: { usedAt: expect.any(Date) }
    });
  });

  it("completes a password reset using a valid token", async () => {
    prismaMock.passwordResetToken.findFirst.mockResolvedValue({
      id: "reset_1",
      tenantId: "tenant_1",
      userId: "user_tech"
    });
    prismaMock.user.update.mockResolvedValue(undefined);
    prismaMock.passwordResetToken.update.mockResolvedValue(undefined);

    const { completePasswordReset } = await import("../team-management");

    await completePasswordReset({
      token: "valid-token",
      password: "new-password123"
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user_tech" },
      data: { passwordHash: "hashed:new-password123", isActive: true }
    });
    expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: "reset_1" },
      data: { usedAt: expect.any(Date) }
    });
  });

  it("blocks deactivating the last active tenant admin", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(makeAdminUser())
      .mockResolvedValueOnce({ id: "tenant_admin_1", role: "tenant_admin", isActive: true });
    prismaMock.user.count.mockResolvedValue(1);

    const { setUserActiveState } = await import("../team-management");

    await expect(setUserActiveState(makeActor(), "tenant_admin_1", false)).rejects.toThrow(
      "Keep at least one active tenant admin in the workspace."
    );
  });

  it("blocks permanent removal when the account has operational history", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(makeAdminUser())
      .mockResolvedValueOnce({
        id: "user_history",
        role: "technician",
        _count: {
          assignedInspections: 1,
          createdInspections: 0,
          inspectionReports: 0,
          auditLogs: 0,
          reportCorrectionEvents: 0,
          createdAmendments: 0,
          inspectionAssignments: 0
        }
      });

    const { removeUserFromWorkspace } = await import("../team-management");

    await expect(removeUserFromWorkspace(makeActor(), "user_history")).rejects.toThrow(
      "This account has operational history and cannot be removed. Deactivate it instead."
    );
  });

  it("searches internal users lazily with pagination", async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeAdminUser());
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "user_1",
        email: "alpha@example.com",
        name: "Alpha Admin",
        role: "office_admin",
        isActive: true,
        allowances: { accountAdmin: true },
        lastLoginAt: null,
        createdAt: new Date("2026-04-01T10:00:00.000Z"),
        customerCompany: null
      },
      {
        id: "user_2",
        email: "bravo@example.com",
        name: "Bravo Tech",
        role: "technician",
        isActive: true,
        allowances: { reportReviewAccess: true },
        lastLoginAt: null,
        createdAt: new Date("2026-04-01T11:00:00.000Z"),
        customerCompany: null
      },
      {
        id: "user_3",
        email: "charlie@example.com",
        name: "Charlie Tech",
        role: "technician",
        isActive: false,
        allowances: { reportReviewAccess: true },
        lastLoginAt: null,
        createdAt: new Date("2026-04-01T12:00:00.000Z"),
        customerCompany: null
      }
    ]);

    const { searchTeamWorkspaceUsers } = await import("../team-management");

    const result = await searchTeamWorkspaceUsers(makeActor(), {
      kind: "internal",
      query: "a",
      page: 0,
      limit: 2,
      status: "all"
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "tenant_1",
        role: { not: "customer_user" },
        OR: expect.any(Array)
      }),
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { email: "asc" }],
      skip: 0,
      take: 3,
      select: expect.any(Object)
    });
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it("searches customer portal users only within the customer role", async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeAdminUser());
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "portal_1",
        email: "portal@example.com",
        name: "Portal Contact",
        role: "customer_user",
        isActive: true,
        allowances: { reportDownload: true },
        lastLoginAt: null,
        createdAt: new Date("2026-04-01T10:00:00.000Z"),
        customerCompany: { id: "customer_1", name: "North Campus" }
      }
    ]);

    const { searchTeamWorkspaceUsers } = await import("../team-management");

    const result = await searchTeamWorkspaceUsers(makeActor(), {
      kind: "customer",
      query: "north",
      page: 0,
      limit: 8,
      status: "active"
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "tenant_1",
        role: "customer_user",
        isActive: true,
        OR: expect.any(Array)
      }),
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { email: "asc" }],
      skip: 0,
      take: 9,
      select: expect.any(Object)
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.customerCompany?.name).toBe("North Campus");
  });

  it("keeps pending invites visible when the workspace is filtered to active users", async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeAdminUser());
    prismaMock.$transaction.mockResolvedValue([7, 2, 1, 2]);
    prismaMock.accountInvitation.findMany.mockResolvedValue([
      {
        id: "invite_internal_1",
        email: "tech@example.com",
        name: "Tech User",
        role: "technician",
        allowances: { reportReviewAccess: true },
        status: "pending",
        sentAt: new Date("2026-04-02T08:00:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        customerCompany: null,
        invitedBy: { id: "user_admin", name: "Admin User" }
      },
      {
        id: "invite_customer_1",
        email: "portal@example.com",
        name: "Portal User",
        role: "customer_user",
        allowances: { reportDownload: true },
        status: "pending",
        sentAt: new Date("2026-04-02T08:05:00.000Z"),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        customerCompany: { id: "customer_1", name: "Acme Hospital" },
        invitedBy: { id: "user_admin", name: "Admin User" }
      }
    ]);
    prismaMock.customerCompany.findMany.mockResolvedValue([{ id: "customer_1", name: "Acme Hospital" }]);

    const { getTeamWorkspaceData } = await import("../team-management");

    const result = await getTeamWorkspaceData(makeActor(), { status: "active" });

    expect(result.teamInvites).toHaveLength(1);
    expect(result.customerInvites).toHaveLength(1);
    expect(result.teamInvites[0]?.derivedStatus).toBe("pending");
    expect(result.customerInvites[0]?.derivedStatus).toBe("pending");
  });
});
