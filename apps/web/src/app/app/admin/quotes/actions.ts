"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { Session } from "next-auth";
import { QuoteStatus } from "@prisma/client";
import type { ActorContext } from "@testworx/types";

import { auth } from "@/auth";
import {
  createQuote,
  quoteInputSchema,
  sendQuote,
  syncQuoteToQuickBooksEstimate,
  updateQuote,
  updateQuoteStatus,
  convertQuoteToInspection
} from "@testworx/lib";

function parseLineItems(formData: FormData) {
  const raw = String(formData.get("lineItemsJson") ?? "[]");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error("Quote line items could not be read.");
  }
}

function parseQuoteFormData(formData: FormData) {
  return quoteInputSchema.parse({
    customerCompanyId: String(formData.get("customerCompanyId") ?? ""),
    siteId: String(formData.get("siteId") ?? "").trim() || null,
    contactName: String(formData.get("contactName") ?? "").trim() || null,
    recipientEmail: String(formData.get("recipientEmail") ?? "").trim() || null,
    issuedAt: String(formData.get("issuedAt") ?? ""),
    expiresAt: String(formData.get("expiresAt") ?? "").trim() ? String(formData.get("expiresAt")) : null,
    internalNotes: String(formData.get("internalNotes") ?? "").trim() || null,
    customerNotes: String(formData.get("customerNotes") ?? "").trim() || null,
    taxAmount: Number(formData.get("taxAmount") ?? "0"),
    lineItems: parseLineItems(formData)
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
      tenantId: session.user.tenantId
    }
  };
}

function getActor(session: QuoteActionSession): ActorContext {
  return {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  };
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
    redirect("/login");
  }

  try {
    const parsed = parseQuoteFormData(formData);
    await updateQuote(getActor(getQuoteActionSession(session)), quoteId, parsed);
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    redirect(quoteDetailHref(quoteId, { quote: "saved" }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(quoteDetailHref(quoteId, { error: error instanceof Error ? error.message : "Unable to update quote." }));
  }
}

export async function sendQuoteAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!session?.user?.tenantId || !quoteId) {
    redirect("/login");
  }

  try {
    await sendQuote(getActor(getQuoteActionSession(session)), quoteId, {
      recipientEmail: String(formData.get("recipientEmail") ?? "").trim() || null,
      subject: String(formData.get("subject") ?? "").trim() || null,
      message: String(formData.get("message") ?? "").trim() || null
    });
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    revalidatePath("/app/customer");
    redirect(quoteDetailHref(quoteId, { delivery: "sent" }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(quoteDetailHref(quoteId, { delivery: error instanceof Error ? error.message : "Unable to send quote." }));
  }
}

export async function syncQuoteAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!session?.user?.tenantId || !quoteId) {
    redirect("/login");
  }

  try {
    await syncQuoteToQuickBooksEstimate(getActor(getQuoteActionSession(session)), quoteId);
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    redirect(quoteDetailHref(quoteId, { quickbooks: "synced" }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(quoteDetailHref(quoteId, { quickbooks: error instanceof Error ? error.message : "Quote sync failed." }));
  }
}

export async function updateQuoteStatusAction(formData: FormData) {
  const session = await auth();
  const quoteId = String(formData.get("quoteId") ?? "");
  const status = String(formData.get("status") ?? "") as QuoteStatus;
  if (!session?.user?.tenantId || !quoteId) {
    redirect("/login");
  }

  if (!Object.values(QuoteStatus).includes(status)) {
    redirect(quoteDetailHref(quoteId, { error: "Select a valid quote status." }));
  }

  try {
    await updateQuoteStatus(getActor(getQuoteActionSession(session)), quoteId, status, {
      note: String(formData.get("note") ?? "").trim() || null
    });
    revalidatePath("/app/admin/quotes");
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    redirect(quoteDetailHref(quoteId, { status: "updated" }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(quoteDetailHref(quoteId, { error: error instanceof Error ? error.message : "Unable to update quote status." }));
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
    revalidatePath("/app/admin/scheduling");
    redirect(`/app/admin/inspections/${inspection.id}?from=${encodeURIComponent(`/app/admin/quotes/${quoteId}`)}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(quoteDetailHref(quoteId, { error: error instanceof Error ? error.message : "Unable to convert quote." }));
  }
}
