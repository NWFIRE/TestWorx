"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { submitCustomerIntakeRequest } from "@testworx/lib/server/index";

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export async function submitCustomerIntakeAction(formData: FormData) {
  const token = readText(formData, "token").trim();
  if (!token) {
    redirect("/intake/customer/invalid?error=Invalid intake link.");
  }

  try {
    const files = formData
      .getAll("uploads")
      .filter((value): value is File => value instanceof File && value.size > 0);

    await submitCustomerIntakeRequest({
      token,
      submission: {
        companyName: readText(formData, "companyName"),
        companyWebsite: readText(formData, "companyWebsite"),
        primaryContactName: readText(formData, "primaryContactName"),
        primaryContactEmail: readText(formData, "primaryContactEmail"),
        primaryContactPhone: readText(formData, "primaryContactPhone"),
        billingContactName: readText(formData, "billingContactName"),
        billingEmail: readText(formData, "billingEmail"),
        billingPhone: readText(formData, "billingPhone"),
        billingAddressLine1: readText(formData, "billingAddressLine1"),
        billingAddressLine2: readText(formData, "billingAddressLine2"),
        billingCity: readText(formData, "billingCity"),
        billingState: readText(formData, "billingState"),
        billingPostalCode: readText(formData, "billingPostalCode"),
        siteName: readText(formData, "siteName"),
        siteAddressLine1: readText(formData, "siteAddressLine1"),
        siteAddressLine2: readText(formData, "siteAddressLine2"),
        siteCity: readText(formData, "siteCity"),
        siteState: readText(formData, "siteState"),
        sitePostalCode: readText(formData, "sitePostalCode"),
        siteContactName: readText(formData, "siteContactName"),
        siteContactPhone: readText(formData, "siteContactPhone"),
        siteContactEmail: readText(formData, "siteContactEmail"),
        requestedServiceType: readText(formData, "requestedServiceType"),
        systemTypes: formData.getAll("systemTypes").map((value) => String(value)),
        preferredServiceDate: readText(formData, "preferredServiceDate"),
        preferredTimeWindow: readText(formData, "preferredTimeWindow"),
        preferredServiceWindow: readText(formData, "preferredServiceWindow"),
        serviceNotes: readText(formData, "serviceNotes")
      },
      files
    });
    redirect(`/intake/customer/${encodeURIComponent(token)}?submitted=1`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    redirect(`/intake/customer/${encodeURIComponent(token)}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to submit intake.")}`);
  }
}
