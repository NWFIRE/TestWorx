import "server-only";
import { prisma } from "@testworx/db";
import { z } from "zod";

const coordinate = (limit: number) => z.preprocess((value) => {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  return typeof value === "string" ? Number(value) : value;
}, z.number().finite().min(-limit).max(limit).nullable());
export const serviceLocationSchema = z.object({
  addressLine1: z.string().trim().max(300), addressLine2: z.string().trim().max(300),
  city: z.string().trim().max(120), state: z.string().trim().max(120), postalCode: z.string().trim().max(30),
  latitude: coordinate(90), longitude: coordinate(180)
}).refine((value) => (value.latitude === null) === (value.longitude === null), { message: "Enter both latitude and longitude, or leave both blank." });

export async function saveServiceLocation(actor: { userId: string; tenantId?: string | null; role: string }, siteId: string, raw: unknown) {
  if (!actor.tenantId || !["tenant_admin", "office_admin"].includes(actor.role)) throw new Error("Only office administrators can edit service locations.");
  const tenantId = actor.tenantId;
  const user = await prisma.user.findFirst({ where: { id: actor.userId, tenantId, isActive: true, role: { in: ["tenant_admin", "office_admin"] } }, select: { id: true } });
  if (!user) throw new Error("Location editing is unavailable.");
  const parsed = serviceLocationSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join(" "));
  return prisma.$transaction(async (tx) => {
    const site = await tx.site.findFirst({ where: { id: siteId, tenantId } });
    if (!site) throw new Error("Service location not found.");
    await tx.site.updateMany({ where: { id: siteId, tenantId }, data: parsed.data });
    await tx.auditLog.create({ data: { tenantId, actorUserId: actor.userId, action: "site.location_updated", entityType: "Site", entityId: siteId, metadata: { before: { latitude: site.latitude, longitude: site.longitude }, after: parsed.data } } });
    return tx.site.findFirstOrThrow({ where: { id: siteId, tenantId }, select: { id: true, addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true, latitude: true, longitude: true } });
  });
}
