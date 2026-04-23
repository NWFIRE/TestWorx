"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { Session } from "next-auth";
import { QuoteStatus } from "@prisma/client";
import type { ActorContext } from "@testworx/types";

import { auth } from "@/auth";
import {
  regenerateQuoteAccessToken,
  clearQuoteLineItemQuickBooksMapping,
  createQuote,
  deleteQuote,
  getQuoteDetail,
  quoteInputSchema,
  getQuoteReminderSettings,
  saveQuoteLineItemQuickBooksMapping,
  sendQuoteReminderNow,
  sendQuote,
  syncQuoteToQuickBooksEstimate,
  updateQuote,
  updateQuoteReminderControl,
  updateQuoteReminderSettings,
  updateQuoteStatus,
  convertQuoteToInspection
} from "@testworx/lib/server/index";

function parseLineItems(formData: FormData) {
  const raw = String(formData.get("lineItemsJson") ?? "[]");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error("Quote line items could not be read.");
  }
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function isBlankQuoteLineItem(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const lineItem = value as Record<string, unknown>;
  const hasMeaningfulText = [
    normalizeOptionalString(lineItem.internalCode),
    normalizeOptionalString(lineItem.title),
    normalizeOptionalString(lineItem.description),
    normalizeOptionalString(lineItem.inspectionType),
    normalizeOptionalString(lineItem.category)
  ].some(Boolean);

  if (hasMeaningfulText) {
    return false;
  }

  return (
    normalizeOptionalNumber(lineItem.quantity) === 1 &&
    normalizeOptionalNumber(lineItem.unitPrice) === 0 &&
    normalizeOptionalNumber(lineItem.discountAmount) === 0 &&
    lineItem.taxable !== true
  );
}

function sanitizeLineItems(lineItems: unknown[]) {
  return lineItems.filter((lineItem) => !isBlankQuoteLineItem(lineItem));
}

function parseQuoteFormData(formData: FormData) {
  return quoteInputSchema.parse({
    customerCompanyId: String(formData.get("customerCompanyId") ?? ""),
    siteId: String(formData.get("siteId") ?? "").trim() || null,
    customSiteName: String(formData.get("customSiteName") ?? "").trim() || null,
    contactName: String(formData.get("contactName") ?? "").trim() || null,
    recipientEmail: String(formData.get("recipientEmail") ?? "").trim() || null,
    proposalType: String(formData.get("proposalType") ?? "").trim() || null,
    issuedAt: String(formData.get("issuedAt") ?? ""),
    expiresAt: String(formData.get("expiresAt") ?? "").trim() ? String(formData.get("expiresAt")) : null,
    internalNotes: String(formData.get("internalNotes") ?? "").trim() || null,
    customerNotes: String(formData.get("customerNotes") ?? "").trim() || null,
    taxAmount: Number(formData.get("taxAmount") ?? "0"),
    lineItems: sanitizeLineItems(parseLineItems(formData))
  });
}

function quoteDetailHref(quoteId: string, params?: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `/app/admin/quotes/${quoteId}?${query}` : `/app/admin/quotes/${quoteId}`;
}

type QuoteActionSession = {
  user: {
    id: string;
    role: ActorContext["role"];
    tenantId: string;
    allowances: ActorContext["allowances"];
  };
};

function getQuoteActionSession(session: Session | null): QuoteActionSession {
  if (!session?.user?.tenantId) {
    throw new Error("Unauthorized");
  }

  return {
    user: {
      id: session.user.id,
      role: session.user.role as ActorContext["role"],
      tenantId: session.user.tenantId,
      allowances: session.user.allowances ?? null
    }
  };
}

function getActor(session: QuoteActionSession): ActorContext {
  return {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId,
    allowances: session.user.allowances ?? null
  };
}

async function getQuoteDetailForAction(session: QuoteActionSession, quoteId: string) {
  return getQuoteDetail(getActor(session), quoteId);
}

export async function createQuoteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  try {
    const parsed = parseQuoteFormData(formData);
    const quote = await createQuote(getActor(getQuoteActionSession(session)), parsed);
    revalidatePath("/app/admin/quotes");
    redirect(quoteDetailHref(quote.id, { quote: "created" }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(`/app/admin/quotes/new?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to create quote.")}`);
  }
}

export async function updateQuoteAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!session?.user?.tenantId || !quoteId) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  try {
    const parsed = parseQuoteFormData(formData);
    await updateQuote(getActor(getQuoteActionSession(session)), quoteId, parsed);
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    const actionSession = getQuoteActionSession(session);
    const detail = await getQuoteDetailForAction(actionSession, quoteId);
    return { ok: true, error: null, message: "Proposal updated", detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to update quote.", message: null, detail: null };
  }
}

export async function deleteQuoteAction(
  _: { error: string | null; success: string | null; redirectTo: string | null },
  formData: FormData
) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  const requestedRedirect = String(formData.get("redirectTo") ?? "");
  const redirectTo = requestedRedirect.startsWith("/app/") ? requestedRedirect : "/app/admin/quotes?quote=deleted";

  if (!session?.user?.tenantId || !quoteId) {
    return { error: "Unauthorized", success: null, redirectTo: null };
  }

  try {
    await deleteQuote(getActor(getQuoteActionSession(session)), quoteId);
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    revalidatePath("/app/customer");
    return { error: null, success: "Quote deleted successfully.", redirectTo };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to delete quote.",
      success: null,
      redirectTo: null
    };
  }
}

export async function sendQuoteAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!session?.user?.tenantId || !quoteId) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  try {
    const actionSession = getQuoteActionSession(session);
    await sendQuote(getActor(actionSession), quoteId, {
      recipientEmail: String(formData.get("recipientEmail") ?? "").trim() || null,
      subject: String(formData.get("subject") ?? "").trim() || null,
      message: String(formData.get("message") ?? "").trim() || null
    });
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    revalidatePath("/app/customer");
    const detail = await getQuoteDetailForAction(actionSession, quoteId);
    return { ok: true, error: null, message: "Quote sent", detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to send quote.", message: null, detail: null };
  }
}

export async function syncQuoteAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!session?.user?.tenantId || !quoteId) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  try {
    const actionSession = getQuoteActionSession(session);
    await syncQuoteToQuickBooksEstimate(getActor(actionSession), quoteId);
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    const detail = await getQuoteDetailForAction(actionSession, quoteId);
    return { ok: true, error: null, message: "Quote synced to QuickBooks", detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Quote sync failed.", message: null, detail: null };
  }
}

export async function saveQuoteLineItemMappingAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  const lineItemId = String(formData.get("lineItemId") ?? "");
  const internalCode = String(formData.get("internalCode") ?? "").trim();
  const internalName = String(formData.get("internalName") ?? "").trim();
  const qbItemId = String(formData.get("qbItemId") ?? "").trim();
  if (!session?.user?.tenantId || !quoteId || !lineItemId || !internalCode || !internalName || !qbItemId) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  try {
    const actionSession = getQuoteActionSession(session);
    await saveQuoteLineItemQuickBooksMapping(getActor(actionSession), {
      quoteId,
      lineItemId,
      internalCode,
      internalName,
      qbItemId
    });
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    const detail = await getQuoteDetailForAction(actionSession, quoteId);
    return { ok: true, error: null, message: `${internalName} mapped`, detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to save QuickBooks mapping.", message: null, detail: null };
  }
}

export async function saveQuoteLineItemMappingFormAction(formData: FormData) {
  await saveQuoteLineItemMappingAction(formData);
}

export async function clearQuoteLineItemMappingAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  const lineItemId = String(formData.get("lineItemId") ?? "");
  const internalCode = String(formData.get("internalCode") ?? "").trim();
  if (!session?.user?.tenantId || !quoteId || !lineItemId || !internalCode) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  try {
    const actionSession = getQuoteActionSession(session);
    await clearQuoteLineItemQuickBooksMapping(getActor(actionSession), {
      quoteId,
      lineItemId,
      internalCode
    });
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    const detail = await getQuoteDetailForAction(actionSession, quoteId);
    return { ok: true, error: null, message: "QuickBooks mapping cleared", detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to clear QuickBooks mapping.", message: null, detail: null };
  }
}

export async function clearQuoteLineItemMappingFormAction(formData: FormData) {
  await clearQuoteLineItemMappingAction(formData);
}

export async function updateQuoteStatusAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  const status = String(formData.get("status") ?? "") as QuoteStatus;
  if (!session?.user?.tenantId || !quoteId) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  if (!Object.values(QuoteStatus).includes(status)) {
    return { ok: false, error: "Select a valid quote status.", message: null, detail: null };
  }

  try {
    const actionSession = getQuoteActionSession(session);
    await updateQuoteStatus(getActor(actionSession), quoteId, status, {
      note: String(formData.get("note") ?? "").trim() || null
    });
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    const detail = await getQuoteDetailForAction(actionSession, quoteId);
    return { ok: true, error: null, message: "Quote status updated", detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to update quote status.", message: null, detail: null };
  }
}

export async function convertQuoteAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!session?.user?.tenantId || !quoteId) {
    redirect("/login");
  }

  try {
    const inspection = await convertQuoteToInspection(getActor(getQuoteActionSession(session)), quoteId);
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/inspections");
    redirect(`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(`/app/admin/quotes/${quoteId}`)}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(quoteDetailHref(quoteId, { error: error instanceof Error ? error.message : "Unable to convert quote." }));
  }
}

export async function regenerateQuoteLinkAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!session?.user?.tenantId || !quoteId) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  try {
    const actionSession = getQuoteActionSession(session);
    await regenerateQuoteAccessToken(getActor(actionSession), quoteId);
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    const detail = await getQuoteDetailForAction(actionSession, quoteId);
    return { ok: true, error: null, message: "Hosted quote link refreshed", detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to refresh hosted quote link.", message: null, detail: null };
  }
}

export async function sendQuoteReminderNowAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!session?.user?.tenantId || !quoteId) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  try {
    const actionSession = getQuoteActionSession(session);
    await sendQuoteReminderNow(getActor(actionSession), quoteId);
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    const detail = await getQuoteDetailForAction(actionSession, quoteId);
    return { ok: true, error: null, message: "Reminder sent", detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to send reminder.", message: null, detail: null };
  }
}

export async function updateQuoteReminderControlAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  const action = String(formData.get("reminderAction") ?? "") as "pause" | "resume" | "disable" | "enable";
  if (!session?.user?.tenantId || !quoteId) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  try {
    const actionSession = getQuoteActionSession(session);
    await updateQuoteReminderControl(getActor(actionSession), quoteId, action);
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    const detail = await getQuoteDetailForAction(actionSession, quoteId);
    const label = action === "pause" ? "Reminders paused" : action === "resume" ? "Reminders resumed" : action === "disable" ? "Reminders disabled" : "Reminders enabled";
    return { ok: true, error: null, message: label, detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to update reminders.", message: null, detail: null };
  }
}

export async function updateQuoteReminderSettingsAction(
  _: { error: string | null; success: string | null },
  formData: FormData
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  const actor = getActor(getQuoteActionSession(session));
  const currentSettings = await getQuoteReminderSettings(actor);

  try {
    await updateQuoteReminderSettings(actor, {
      enabled: formData.get("enabled") === "on",
      sentNotViewedFirstBusinessDays: Number(formData.get("sentNotViewedFirstBusinessDays") ?? currentSettings.sentNotViewedFirstBusinessDays),
      sentNotViewedSecondBusinessDays: Number(formData.get("sentNotViewedSecondBusinessDays") ?? currentSettings.sentNotViewedSecondBusinessDays),
      viewedPendingFirstBusinessDays: Number(formData.get("viewedPendingFirstBusinessDays") ?? currentSettings.viewedPendingFirstBusinessDays),
      viewedPendingSecondBusinessDays: Number(formData.get("viewedPendingSecondBusinessDays") ?? currentSettings.viewedPendingSecondBusinessDays),
      expiringSoonDays: Number(formData.get("expiringSoonDays") ?? currentSettings.expiringSoonDays),
      expiredFollowUpEnabled: formData.get("expiredFollowUpEnabled") === "on",
      expiredFollowUpDays: Number(formData.get("expiredFollowUpDays") ?? currentSettings.expiredFollowUpDays),
      maxAutoReminders: Number(formData.get("maxAutoReminders") ?? currentSettings.maxAutoReminders),
      templates: {
        sentNotViewed: {
          subject: String(formData.get("templateSentNotViewedSubject") ?? currentSettings.templates.sentNotViewed.subject),
          body: String(formData.get("templateSentNotViewedBody") ?? currentSettings.templates.sentNotViewed.body)
        },
        viewedPending: {
          subject: String(formData.get("templateViewedPendingSubject") ?? currentSettings.templates.viewedPending.subject),
          body: String(formData.get("templateViewedPendingBody") ?? currentSettings.templates.viewedPending.body)
        },
        expiringSoon: {
          subject: String(formData.get("templateExpiringSoonSubject") ?? currentSettings.templates.expiringSoon.subject),
          body: String(formData.get("templateExpiringSoonBody") ?? currentSettings.templates.expiringSoon.body)
        },
        expired: {
          subject: String(formData.get("templateExpiredSubject") ?? currentSettings.templates.expired.subject),
          body: String(formData.get("templateExpiredBody") ?? currentSettings.templates.expired.body)
        }
      }
    });
    revalidatePath("/app/admin/quotes");
    return { error: null, success: "Reminder settings saved." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update quote reminders.",
      success: null
    };
  }
}

