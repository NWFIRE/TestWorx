"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { approveQuoteByAccessToken, declineQuoteByAccessToken } from "@testworx/lib";

function quoteHref(token: string, params?: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `/quote/${token}?${query}` : `/quote/${token}`;
}

export async function approveQuoteFromHostedPage(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    await approveQuoteByAccessToken(token, { note });
    revalidatePath(`/quote/${token}`);
    revalidatePath("/app/admin/quotes");
    redirect(quoteHref(token, { response: "approved" }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(quoteHref(token, { error: error instanceof Error ? error.message : "Unable to approve quote." }));
  }
}

export async function declineQuoteFromHostedPage(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    await declineQuoteByAccessToken(token, { note });
    revalidatePath(`/quote/${token}`);
    revalidatePath("/app/admin/quotes");
    redirect(quoteHref(token, { response: "declined" }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(quoteHref(token, { error: error instanceof Error ? error.message : "Unable to decline quote." }));
  }
}
