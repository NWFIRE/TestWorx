import "server-only";

import { prisma } from "@testworx/db";
import { z } from "zod";

type ProfileActor = { userId: string; tenantId: string | null };
const nameSchema = z.string().trim().min(1).max(100).refine(value => !/[\u0000-\u001f\u007f]/.test(value));

export class ProfileUpdateError extends Error {}

export async function getOwnUserProfile(actor: ProfileActor) {
  if (!actor.userId) return null;
  return prisma.user.findFirst({
    where: { id: actor.userId, tenantId: actor.tenantId, isActive: true },
    select: {
      name: true, email: true, role: true, createdAt: true,
      tenant: { select: { name: true, timezone: true } },
      customerCompany: { select: { name: true } }
    }
  });
}

export async function updateOwnUserProfile(actor: ProfileActor, name: unknown) {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) throw new ProfileUpdateError("Enter a name between 1 and 100 characters, without control characters.");
  if (!actor.userId) throw new ProfileUpdateError("Please sign in again to update your profile.");

  return prisma.$transaction(async tx => {
    const where = { id: actor.userId, tenantId: actor.tenantId, isActive: true };
    const current = await tx.user.findFirst({ where, select: { name: true } });
    if (!current) throw new ProfileUpdateError("Your account is no longer available. Please sign in again.");
    if (current.name === parsed.data) return parsed.data;
    const result = await tx.user.updateMany({ where, data: { name: parsed.data } });
    if (result.count !== 1) throw new ProfileUpdateError("Your account could not be updated. Please sign in again.");
    await tx.auditLog.create({ data: {
      tenantId: actor.tenantId, actorUserId: actor.userId,
      action: "user.profile.updated", entityType: "User", entityId: actor.userId,
      metadata: { changedFields: ["name"] }
    } });
    return parsed.data;
  });
}
