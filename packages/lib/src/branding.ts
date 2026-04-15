import { prisma } from "@testworx/db";
import { z } from "zod";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantContext } from "./permissions";

const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/i, "Enter a valid hex color.");
const imageDataUrlSchema = z.string().refine((value) => value === "" || /^data:image\/.+;base64,/i.test(value), "Logos must be stored as image data URLs.");
const websiteSchema = z.string().trim().transform((value, ctx) => {
  if (value === "") {
    return "";
  }

  const normalized = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(normalized);
    return parsed.toString();
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a valid website URL."
    });
    return z.NEVER;
  }
});

function parseBrandingField<T>(schema: z.ZodType<T>, value: unknown, fallback: T) {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export const tenantBrandingSchema = z.object({
  logoDataUrl: imageDataUrlSchema.optional().default(""),
  primaryColor: hexColorSchema.optional().default("#1E3A5F"),
  accentColor: hexColorSchema.optional().default("#C2410C"),
  legalBusinessName: z.string().max(160).optional().default(""),
  phone: z.string().max(60).optional().default(""),
  email: z.string().email().or(z.literal("")).optional().default(""),
  website: websiteSchema.optional().default(""),
  addressLine1: z.string().max(160).optional().default(""),
  addressLine2: z.string().max(160).optional().default(""),
  city: z.string().max(80).optional().default(""),
  state: z.string().max(40).optional().default(""),
  postalCode: z.string().max(20).optional().default("")
});

export type TenantBranding = z.infer<typeof tenantBrandingSchema>;

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

export function resolveTenantBranding(input: { tenantName: string; branding: unknown; billingEmail?: string | null }) {
  const rawBranding = input.branding && typeof input.branding === "object"
    ? input.branding as Record<string, unknown>
    : {};

  const branding = tenantBrandingSchema.parse({
    logoDataUrl: parseBrandingField(imageDataUrlSchema, rawBranding.logoDataUrl, ""),
    primaryColor: parseBrandingField(hexColorSchema, rawBranding.primaryColor, "#1E3A5F"),
    accentColor: parseBrandingField(hexColorSchema, rawBranding.accentColor, "#C2410C"),
    legalBusinessName: parseBrandingField(z.string().max(160), rawBranding.legalBusinessName, ""),
    phone: parseBrandingField(z.string().max(60), rawBranding.phone, ""),
    email: parseBrandingField(z.string().email().or(z.literal("")), rawBranding.email, ""),
    website: parseBrandingField(websiteSchema, rawBranding.website, ""),
    addressLine1: parseBrandingField(z.string().max(160), rawBranding.addressLine1, ""),
    addressLine2: parseBrandingField(z.string().max(160), rawBranding.addressLine2, ""),
    city: parseBrandingField(z.string().max(80), rawBranding.city, ""),
    state: parseBrandingField(z.string().max(40), rawBranding.state, ""),
    postalCode: parseBrandingField(z.string().max(20), rawBranding.postalCode, "")
  });
  return {
    ...branding,
    legalBusinessName: branding.legalBusinessName || input.tenantName,
    email: branding.email || input.billingEmail || "",
    primaryColor: branding.primaryColor || "#1E3A5F",
    accentColor: branding.accentColor || "#C2410C"
  };
}

export function buildTenantBrandingCss(branding: TenantBranding) {
  const primaryColor = branding.primaryColor || "#1E3A5F";
  const accentColor = branding.accentColor || "#C2410C";
  const primaryRgb = hexToRgbChannels(primaryColor);
  const accentRgb = hexToRgbChannels(accentColor);
  return {
    "--tenant-primary": primaryColor,
    "--tenant-primary-rgb": primaryRgb,
    "--tenant-primary-soft": `rgb(${primaryRgb} / 0.1)`,
    "--tenant-primary-border": `rgb(${primaryRgb} / 0.28)`,
    "--tenant-primary-contrast": getReadableForeground(primaryColor),
    "--tenant-accent": accentColor,
    "--tenant-accent-rgb": accentRgb,
    "--tenant-accent-soft": `rgb(${accentRgb} / 0.12)`,
    "--tenant-accent-border": `rgb(${accentRgb} / 0.28)`,
    "--tenant-accent-contrast": getReadableForeground(accentColor)
  } as Record<string, string>;
}

function getReadableForeground(value: string) {
  const normalized = value.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((segment) => `${segment}${segment}`).join("")
    : normalized;

  if (expanded.length !== 6) {
    return "#FFFFFF";
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#0F172A" : "#FFFFFF";
}

function hexToRgbChannels(value: string) {
  const normalized = value.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((segment) => `${segment}${segment}`).join("")
    : normalized;

  if (expanded.length !== 6) {
    return "30 58 95";
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `${red} ${green} ${blue}`;
}

export const updateTenantBrandingSchema = tenantBrandingSchema.extend({
  billingEmail: z.string().email().or(z.literal("")).default("")
});

export async function getTenantBrandingSettings(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  const tenant = await prisma.tenant.findFirst({
    where: { id: parsedActor.tenantId as string },
    include: { subscriptionPlan: true }
  });

  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    billingEmail: tenant.billingEmail ?? "",
    branding: resolveTenantBranding({ tenantName: tenant.name, branding: tenant.branding, billingEmail: tenant.billingEmail }),
    subscriptionPlan: tenant.subscriptionPlan
  };
}

export async function updateTenantBranding(actor: ActorContext, input: z.infer<typeof updateTenantBrandingSchema>) {
  const parsedActor = parseActor(actor);
  if (!["tenant_admin", "platform_admin", "office_admin"].includes(parsedActor.role)) {
    throw new Error("Only administrators can update branding.");
  }

  const parsedInput = updateTenantBrandingSchema.parse(input);
  const tenant = await prisma.tenant.findFirst({ where: { id: parsedActor.tenantId as string } });
  if (!tenant) {
    throw new Error("Tenant not found.");
  }

  const mergedBranding = resolveTenantBranding({
    tenantName: tenant.name,
    billingEmail: parsedInput.billingEmail,
    branding: {
      ...(tenant.branding && typeof tenant.branding === "object" ? tenant.branding as Record<string, unknown> : {}),
      ...parsedInput
    }
  });

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      billingEmail: parsedInput.billingEmail || null,
      branding: mergedBranding
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorUserId: parsedActor.userId,
      action: "tenant.branding_updated",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { primaryColor: mergedBranding.primaryColor, billingEmail: updated.billingEmail }
    }
  });

  return updated;
}
