"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  createComplianceReportingFeeRule,
  createCustomerCompany,
  createQuickBooksCatalogItem,
  createServiceFeeRule,
  buildQuickBooksConnectUrl,
  deleteComplianceReportingFeeRule,
  disconnectQuickBooks,
  importQuickBooksCustomers,
  deleteServiceFeeRule,
  complianceReportingFeeRuleInputSchema,
  customerCompanyInputSchema,
  importQuickBooksCatalogItems,
  quickBooksCatalogItemInputSchema,
  saveQuickBooksItemMappingForCode,
  clearQuickBooksItemMappingForCode,
  syncQuickBooksCustomers,
  quoteReminderSettingsInputSchema,
  updateCustomerCompany,
  updateComplianceReportingFeeRule,
  getTenantBrandingSettings,
  updateQuoteReminderSettings,
  updateQuickBooksCatalogItem,
  updateServiceFeeRule,
  updateTenantBranding,
  updateTenantDefaultServiceFee
} from "@testworx/lib";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const BRAND_PRIMARY_COOKIE = "tradeworx_brand_primary";
const BRAND_ACCENT_COOKIE = "tradeworx_brand_accent";

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

function buildCustomerResultMessage(result: { quickBooksSynced: boolean; quickBooksSyncError: string | null }, baseMessage: string) {
  if (result.quickBooksSynced) {
    return `${baseMessage} QuickBooks customer sync completed.`;
  }

  if (result.quickBooksSyncError) {
    return `${baseMessage} TradeWorx saved the customer, but QuickBooks sync needs attention: ${result.quickBooksSyncError}`;
  }

  return baseMessage;
}

function buildSettingsRedirectWithParams(values: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/app/admin/settings?${query}` : "/app/admin/settings";
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
    const primaryColor = String(formData.get("primaryColor") ?? "#1E3A5F");
    const accentColor = String(formData.get("accentColor") ?? "#C2410C");

    await updateTenantBranding(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        logoDataUrl,
        primaryColor,
        accentColor,
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

    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: false,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365
    };
    cookieStore.set(BRAND_PRIMARY_COOKIE, primaryColor, cookieOptions);
    cookieStore.set(BRAND_ACCENT_COOKIE, accentColor, cookieOptions);

    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin");
    revalidatePath("/app/tech");
    revalidatePath("/app/customer");
    revalidatePath("/login");
    revalidatePath("/accept-invite");
    revalidatePath("/reset-password");
    revalidatePath("/app", "layout");
    revalidatePath("/", "layout");
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

export async function createCustomerCompanyAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  const parsed = customerCompanyInputSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    billingEmail: String(formData.get("billingEmail") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    isTaxExempt: formData.get("isTaxExempt") === "on",
    serviceAddressLine1: String(formData.get("serviceAddressLine1") ?? ""),
    serviceAddressLine2: String(formData.get("serviceAddressLine2") ?? ""),
    serviceCity: String(formData.get("serviceCity") ?? ""),
    serviceState: String(formData.get("serviceState") ?? ""),
    servicePostalCode: String(formData.get("servicePostalCode") ?? ""),
    serviceCountry: String(formData.get("serviceCountry") ?? ""),
    billingAddressSameAsService: formData.get("billingAddressSameAsService") === "on",
    billingAddressLine1: String(formData.get("billingAddressLine1") ?? ""),
    billingAddressLine2: String(formData.get("billingAddressLine2") ?? ""),
    billingCity: String(formData.get("billingCity") ?? ""),
    billingState: String(formData.get("billingState") ?? ""),
    billingPostalCode: String(formData.get("billingPostalCode") ?? ""),
    billingCountry: String(formData.get("billingCountry") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    isActive: formData.get("isActive") === "on",
    paymentTermsCode: String(formData.get("paymentTermsCode") ?? "due_on_receipt"),
    customPaymentTermsLabel: String(formData.get("customPaymentTermsLabel") ?? ""),
    customPaymentTermsDays: (() => {
      const raw = String(formData.get("customPaymentTermsDays") ?? "").trim();
      return raw ? Number(raw) : undefined;
    })()
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid customer input.", success: null };
  }

  try {
    const result = await createCustomerCompany(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed.data
    );
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin/billing");
    return {
      error: null,
      success: buildCustomerResultMessage(result, `${result.customer.name} created.`)
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create customer.", success: null };
  }
}

export async function updateCustomerCompanyAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  const customersPage = String(formData.get("customersPage") ?? "").trim() || "1";
  const customersQuery = String(formData.get("customersQuery") ?? "").trim();

  const parsed = customerCompanyInputSchema.safeParse({
    customerCompanyId: String(formData.get("customerCompanyId") ?? ""),
    name: String(formData.get("name") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    billingEmail: String(formData.get("billingEmail") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    isTaxExempt: formData.get("isTaxExempt") === "on",
    serviceAddressLine1: String(formData.get("serviceAddressLine1") ?? ""),
    serviceAddressLine2: String(formData.get("serviceAddressLine2") ?? ""),
    serviceCity: String(formData.get("serviceCity") ?? ""),
    serviceState: String(formData.get("serviceState") ?? ""),
    servicePostalCode: String(formData.get("servicePostalCode") ?? ""),
    serviceCountry: String(formData.get("serviceCountry") ?? ""),
    billingAddressSameAsService: formData.get("billingAddressSameAsService") === "on",
    billingAddressLine1: String(formData.get("billingAddressLine1") ?? ""),
    billingAddressLine2: String(formData.get("billingAddressLine2") ?? ""),
    billingCity: String(formData.get("billingCity") ?? ""),
    billingState: String(formData.get("billingState") ?? ""),
    billingPostalCode: String(formData.get("billingPostalCode") ?? ""),
    billingCountry: String(formData.get("billingCountry") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    isActive: formData.get("isActive") === "on",
    paymentTermsCode: String(formData.get("paymentTermsCode") ?? "due_on_receipt"),
    customPaymentTermsLabel: String(formData.get("customPaymentTermsLabel") ?? ""),
    customPaymentTermsDays: (() => {
      const raw = String(formData.get("customPaymentTermsDays") ?? "").trim();
      return raw ? Number(raw) : undefined;
    })()
  });

  if (!parsed.success) {
    redirect(buildSettingsRedirectWithParams({
      customersOpen: "1",
      customersPage,
      customersQuery: customersQuery || null,
      customers: parsed.error.issues[0]?.message ?? "Invalid customer input."
    }));
  }

  try {
    const result = await updateCustomerCompany(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed.data
    );
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin/billing");
    redirect(buildSettingsRedirectWithParams({
      customersOpen: "1",
      customersPage,
      customersQuery: customersQuery || null,
      customers: buildCustomerResultMessage(result, `${result.customer.name} updated.`)
    }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(buildSettingsRedirectWithParams({
      customersOpen: "1",
      customersPage,
      customersQuery: customersQuery || null,
      customers: error instanceof Error ? error.message : "Unable to update customer."
    }));
  }
}

export async function createQuickBooksCatalogItemAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  const unitPriceRaw = String(formData.get("unitPrice") ?? "").trim();
  const parsed = quickBooksCatalogItemInputSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    itemType: String(formData.get("itemType") ?? "Service"),
    active: formData.get("active") === "on",
    unitPrice: unitPriceRaw ? Number(unitPriceRaw) : null
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid product or service input.", success: null };
  }

  try {
    const item = await createQuickBooksCatalogItem(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed.data
    );
    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin/billing");
    return { error: null, success: `${item.name} created in QuickBooks.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create product or service.", success: null };
  }
}

export async function updateQuickBooksCatalogItemAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  const catalogPage = String(formData.get("qboPage") ?? "").trim() || "1";
  const catalogSearch = String(formData.get("qboSearch") ?? "").trim();
  const catalogType = String(formData.get("qboType") ?? "").trim();
  const catalogStatus = String(formData.get("qboStatus") ?? "").trim();

  const unitPriceRaw = String(formData.get("unitPrice") ?? "").trim();
  const parsed = quickBooksCatalogItemInputSchema.safeParse({
    catalogItemId: String(formData.get("catalogItemId") ?? ""),
    name: String(formData.get("name") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    itemType: String(formData.get("itemType") ?? "Service"),
    active: formData.get("active") === "on",
    unitPrice: unitPriceRaw ? Number(unitPriceRaw) : null
  });

  if (!parsed.success) {
    redirect(buildSettingsRedirectWithParams({
      catalogOpen: "1",
      qboPage: catalogPage,
      qboSearch: catalogSearch || null,
      qboType: catalogType || null,
      qboStatus: catalogStatus || null,
      catalog: parsed.error.issues[0]?.message ?? "Invalid product or service input."
    }));
  }

  try {
    const item = await updateQuickBooksCatalogItem(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed.data
    );
    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin/billing");
    redirect(buildSettingsRedirectWithParams({
      catalogOpen: "1",
      qboPage: catalogPage,
      qboSearch: catalogSearch || null,
      qboType: catalogType || null,
      qboStatus: catalogStatus || null,
      catalog: `${item.name} updated in QuickBooks.`
    }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(buildSettingsRedirectWithParams({
      catalogOpen: "1",
      qboPage: catalogPage,
      qboSearch: catalogSearch || null,
      qboType: catalogType || null,
      qboStatus: catalogStatus || null,
      catalog: error instanceof Error ? error.message : "Unable to update product or service."
    }));
  }
}

export async function importQuickBooksCustomersAction() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  try {
    const result = await importQuickBooksCustomers({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/settings");
    redirect(
      `/app/admin/settings?quickbooks=${encodeURIComponent(
        `Imported ${result.importedCustomerCount} QuickBooks customer${result.importedCustomerCount === 1 ? "" : "s"}: ${result.customersCreated} created, ${result.customersUpdated} updated.`
      )}`
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "QuickBooks customer import failed.";
    redirect(`/app/admin/settings?quickbooks=${encodeURIComponent(message)}`);
  }
}

export async function saveQuickBooksItemMappingAction(
  _: {
    error: string | null;
    success: string | null;
    internalCode?: string | null;
    mapping?: {
      qbItemId: string;
      qbItemName: string;
      qbItemType: string | null;
      matchSource: string;
      qbActive: boolean;
    } | null;
  },
  formData: FormData
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null, internalCode: null, mapping: null };
  }

  const internalCode = String(formData.get("internalCode") ?? "").trim();
  const internalName = String(formData.get("internalName") ?? "").trim();
  const qbItemId = String(formData.get("qbItemId") ?? "").trim();

  if (!internalCode || !internalName || !qbItemId) {
    return {
      error: "QuickBooks item mapping is missing required values.",
      success: null,
      internalCode,
      mapping: null
    };
  }

  try {
    const mapping = await saveQuickBooksItemMappingForCode(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { internalCode, internalName, qbItemId }
    );
    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin/billing");
    return {
      error: null,
      success: `${internalName} mapped successfully.`,
      internalCode,
      mapping: {
        qbItemId: mapping.qbItemId,
        qbItemName: mapping.qbItemName,
        qbItemType: mapping.qbItemType,
        matchSource: mapping.matchSource,
        qbActive: mapping.qbActive
      }
    };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    return {
      error: error instanceof Error ? error.message : "Unable to save QuickBooks item mapping.",
      success: null,
      internalCode,
      mapping: null
    };
  }
}

export async function clearQuickBooksItemMappingAction(
  _: { error: string | null; success: string | null; internalCode?: string | null },
  formData: FormData
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null, internalCode: null };
  }

  const internalCode = String(formData.get("internalCode") ?? "").trim();
  if (!internalCode) {
    return { error: "QuickBooks item mapping code is missing.", success: null, internalCode: null };
  }

  try {
    await clearQuickBooksItemMappingForCode(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      internalCode
    );
    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin/billing");
    return { error: null, success: `${internalCode} mapping cleared.`, internalCode };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    return {
      error: error instanceof Error ? error.message : "Unable to clear QuickBooks item mapping.",
      success: null,
      internalCode
    };
  }
}

export async function syncQuickBooksCustomersActionState(
  previousState: { error: string | null; success: string | null },
  submittedFormData: FormData
) {
  void previousState;
  void submittedFormData;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  try {
    const result = await syncQuickBooksCustomers({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId });
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/settings");
    return {
      error: null,
      success: `Synced QuickBooks customers: ${result.importedCustomerCount} imported, ${result.customersCreated} created, ${result.customersUpdated} updated, ${result.customersSynced} reconciled in TradeWorx.`
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "QuickBooks customer sync failed.",
      success: null
    };
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

export async function updateQuoteReminderSettingsAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  const parsed = quoteReminderSettingsInputSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    sentNotViewedFirstBusinessDays: Number(formData.get("sentNotViewedFirstBusinessDays") ?? "2"),
    sentNotViewedSecondBusinessDays: Number(formData.get("sentNotViewedSecondBusinessDays") ?? "5"),
    viewedPendingFirstBusinessDays: Number(formData.get("viewedPendingFirstBusinessDays") ?? "2"),
    viewedPendingSecondBusinessDays: Number(formData.get("viewedPendingSecondBusinessDays") ?? "5"),
    expiringSoonDays: Number(formData.get("expiringSoonDays") ?? "2"),
    expiredFollowUpEnabled: formData.get("expiredFollowUpEnabled") === "on",
    expiredFollowUpDays: Number(formData.get("expiredFollowUpDays") ?? "1"),
    maxAutoReminders: Number(formData.get("maxAutoReminders") ?? "5"),
    templates: {
      sentNotViewed: {
        subject: String(formData.get("templateSentNotViewedSubject") ?? ""),
        body: String(formData.get("templateSentNotViewedBody") ?? "")
      },
      viewedPending: {
        subject: String(formData.get("templateViewedPendingSubject") ?? ""),
        body: String(formData.get("templateViewedPendingBody") ?? "")
      },
      expiringSoon: {
        subject: String(formData.get("templateExpiringSoonSubject") ?? ""),
        body: String(formData.get("templateExpiringSoonBody") ?? "")
      },
      expired: {
        subject: String(formData.get("templateExpiredSubject") ?? ""),
        body: String(formData.get("templateExpiredBody") ?? "")
      }
    }
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid quote reminder settings.", success: null };
  }

  try {
    await updateQuoteReminderSettings(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed.data
    );

    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin/quotes");
    return { error: null, success: "Quote reminder settings updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update quote reminder settings.", success: null };
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

export async function createComplianceReportingFeeRuleAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  const parsed = complianceReportingFeeRuleInputSchema.safeParse({
    division: String(formData.get("division") ?? ""),
    city: String(formData.get("city") ?? ""),
    county: String(formData.get("county") ?? ""),
    state: String(formData.get("state") ?? ""),
    feeAmount: Number(formData.get("feeAmount") ?? "0"),
    active: formData.get("active") === "on"
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid compliance reporting fee rule.", success: null };
  }

  try {
    await createComplianceReportingFeeRule(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed.data
    );

    revalidatePath("/app/admin/settings");
    revalidatePath("/app/admin/billing");
    return { error: null, success: "Compliance reporting fee rule created." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create compliance reporting fee rule.", success: null };
  }
}

export async function updateComplianceReportingFeeRuleAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return;
  }

  const parsed = complianceReportingFeeRuleInputSchema.parse({
    ruleId: String(formData.get("ruleId") ?? ""),
    division: String(formData.get("division") ?? ""),
    city: String(formData.get("city") ?? ""),
    county: String(formData.get("county") ?? ""),
    state: String(formData.get("state") ?? ""),
    feeAmount: Number(formData.get("feeAmount") ?? "0"),
    active: formData.get("active") === "on"
  });

  await updateComplianceReportingFeeRule(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    parsed
  );

  revalidatePath("/app/admin/settings");
  revalidatePath("/app/admin/billing");
}

export async function deleteComplianceReportingFeeRuleAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return;
  }

  const ruleId = String(formData.get("ruleId") ?? "");
  if (!ruleId) {
    return;
  }

  await deleteComplianceReportingFeeRule(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    ruleId
  );

  revalidatePath("/app/admin/settings");
  revalidatePath("/app/admin/billing");
}
