"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  createServiceFeeRule,
  buildQuickBooksConnectUrl,
  disconnectQuickBooks,
  deleteServiceFeeRule,
  importQuickBooksCatalogItems,
  getTenantBrandingSettings,
  updateServiceFeeRule,
  updateTenantBranding,
  updateTenantDefaultServiceFee
} from "@testworx/lib";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function getAppUrl() {
  return process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function normalizeWebsiteInput(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function fileToDataUrl(file: File | null, fallback: string) {
  if (!file || file.size === 0) {
    return fallback;
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Logos must be uploaded as image files.");
  }

  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo files must be 2 MB or smaller.");
  }

  return `data:${file.type || "application/octet-stream"};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
}

export async function updateTenantBrandingAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  try {
    const logo = formData.get("logo");
    const currentBranding = await getTenantBrandingSettings({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
    const logoDataUrl = await fileToDataUrl(logo instanceof File ? logo : null, currentBranding.branding.logoDataUrl ?? "");

    await updateTenantBranding(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        logoDataUrl,
        primaryColor: String(formData.get("primaryColor") ?? "#1E3A5F"),
        accentColor: String(formData.get("accentColor") ?? "#C2410C"),
        legalBusinessName: String(formData.get("legalBusinessName") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        email: String(formData.get("email") ?? ""),
        website: normalizeWebsiteInput(formData.get("website")),
        addressLine1: String(formData.get("addressLine1") ?? ""),
        addressLine2: String(formData.get("addressLine2") ?? ""),
        city: String(formData.get("city") ?? ""),
        state: String(formData.get("state") ?? ""),
        postalCode: String(formData.get("postalCode") ?? ""),
        billingEmail: String(formData.get("billingEmail") ?? "")
      }
    );

    revalidatePath("/app/admin/settings");
    revalidatePath("/app/customer");
    return { error: null, success: "Branding updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update branding.", success: null };
  }
}

export async function startQuickBooksConnectAction() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("tradeworx_qbo_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10
  });

  redirect(buildQuickBooksConnectUrl(state));
}

export async function disconnectQuickBooksAction() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  await disconnectQuickBooks({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
  revalidatePath("/app/admin/settings");
  revalidatePath("/app/admin/billing");
  redirect("/app/admin/settings?quickbooks=disconnected");
}

export async function importQuickBooksCatalogItemsAction() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  try {
    const result = await importQuickBooksCatalogItems({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
    revalidatePath("/app/admin/settings");
    redirect(`/app/admin/settings?quickbooks=${encodeURIComponent(`Imported ${result.importedItemCount} QuickBooks product${result.importedItemCount === 1 ? "" : "s"} and service${result.importedItemCount === 1 ? "" : "s"}.`)}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "QuickBooks catalog import failed.";
    redirect(`/app/admin/settings?quickbooks=${encodeURIComponent(message)}`);
  }
}

export async function startBillingCheckoutAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  const appUrl = getAppUrl();
  const result = await createBillingCheckoutSession(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    {
      planCode: String(formData.get("planCode") ?? "starter") as "starter" | "professional" | "enterprise",
      successUrl: `${appUrl}/app/admin/settings?billing=success`,
      cancelUrl: `${appUrl}/app/admin/settings?billing=cancelled`
    }
  );

  redirect(result.url || `${appUrl}/app/admin/settings`);
}

export async function openBillingPortalAction() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  const appUrl = getAppUrl();
  const result = await createBillingPortalSession(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    { returnUrl: `${appUrl}/app/admin/settings` }
  );

  redirect(result.url);
}

export async function updateDefaultServiceFeeAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  try {
    const unitPriceRaw = String(formData.get("defaultServiceFeeUnitPrice") ?? "").trim();
    await updateTenantDefaultServiceFee(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        defaultServiceFeeCode: String(formData.get("defaultServiceFeeCode") ?? "SERVICE_FEE").trim() || "SERVICE_FEE",
        defaultServiceFeeUnitPrice: unitPriceRaw ? Number(unitPriceRaw) : null
      }
    );

    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin/billing");
    return { error: null, success: "Default service fee updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update default service fee.", success: null };
  }
}

export async function createServiceFeeRuleAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  try {
    await createServiceFeeRule(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        customerCompanyId: String(formData.get("customerCompanyId") ?? "").trim() || undefined,
        siteId: String(formData.get("siteId") ?? "").trim() || undefined,
        city: String(formData.get("city") ?? "").trim() || undefined,
        state: String(formData.get("state") ?? "").trim() || undefined,
        zipCode: String(formData.get("zipCode") ?? "").trim() || undefined,
        feeCode: String(formData.get("feeCode") ?? "SERVICE_FEE").trim() || "SERVICE_FEE",
        unitPrice: Number(formData.get("unitPrice") ?? "0"),
        priority: Number(formData.get("priority") ?? "0"),
        isActive: formData.get("isActive") === "on"
      }
    );

    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin/billing");
    return { error: null, success: "Service fee rule created." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create service fee rule.", success: null };
  }
}

export async function updateServiceFeeRuleAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return;
  }

  await updateServiceFeeRule(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    {
      ruleId: String(formData.get("ruleId") ?? ""),
      customerCompanyId: String(formData.get("customerCompanyId") ?? "").trim() || undefined,
      siteId: String(formData.get("siteId") ?? "").trim() || undefined,
      city: String(formData.get("city") ?? "").trim() || undefined,
      state: String(formData.get("state") ?? "").trim() || undefined,
      zipCode: String(formData.get("zipCode") ?? "").trim() || undefined,
      feeCode: String(formData.get("feeCode") ?? "SERVICE_FEE").trim() || "SERVICE_FEE",
      unitPrice: Number(formData.get("unitPrice") ?? "0"),
      priority: Number(formData.get("priority") ?? "0"),
      isActive: formData.get("isActive") === "on"
    }
  );

  revalidatePath("/app/admin/settings");
  revalidatePath("/app/admin/billing");
}

export async function deleteServiceFeeRuleAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return;
  }

  const ruleId = String(formData.get("ruleId") ?? "");
  if (!ruleId) {
    return;
  }

  await deleteServiceFeeRule(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    ruleId
  );

  revalidatePath("/app/admin/settings");
  revalidatePath("/app/admin/billing");
}
