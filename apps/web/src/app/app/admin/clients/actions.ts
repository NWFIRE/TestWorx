"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { auth } from "@/auth";
import {
  createCustomerCompany,
  customerCompanyInputSchema,
  updateCustomerCompany
} from "@testworx/lib";

function buildCustomerResultMessage(result: { quickBooksSynced: boolean; quickBooksSyncError: string | null }, baseMessage: string) {
  if (result.quickBooksSynced) {
    return `${baseMessage} QuickBooks customer sync completed.`;
  }

  if (result.quickBooksSyncError) {
    return `${baseMessage} TradeWorx saved the customer, but QuickBooks sync needs attention: ${result.quickBooksSyncError}`;
  }

  return baseMessage;
}

function buildClientsHref(values: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/app/admin/clients?${query}` : "/app/admin/clients";
}

export async function createCustomerCompanyAction(
  _: { error: string | null; success: string | null },
  formData: FormData
) {
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
    revalidatePath("/app/admin/clients");
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
    redirect(buildClientsHref({
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
    revalidatePath("/app/admin/clients");
    revalidatePath("/app/admin/billing");
    redirect(buildClientsHref({
      customersPage,
      customersQuery: customersQuery || null,
      customers: buildCustomerResultMessage(result, `${result.customer.name} updated.`)
    }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(buildClientsHref({
      customersPage,
      customersQuery: customersQuery || null,
      customers: error instanceof Error ? error.message : "Unable to update customer."
    }));
  }
}
