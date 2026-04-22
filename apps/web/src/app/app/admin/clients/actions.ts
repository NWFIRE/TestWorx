"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { auth } from "@/auth";
import {
  createCustomerCompany,
  customerCompanyInputSchema,
  deleteCustomerCompany,
  updateCustomerCompany
} from "@testworx/lib/server/index";

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

function buildClientProfileHref(customerCompanyId: string, values: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query
    ? `/app/admin/clients/${encodeURIComponent(customerCompanyId)}?${query}`
    : `/app/admin/clients/${encodeURIComponent(customerCompanyId)}`;
}

function buildCustomerCompanyPayload(formData: FormData) {
  return {
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
    paymentTermsCode: String(formData.get("paymentTermsCode") ?? "net_30"),
    customPaymentTermsLabel: String(formData.get("customPaymentTermsLabel") ?? ""),
    customPaymentTermsDays: (() => {
      const raw = String(formData.get("customPaymentTermsDays") ?? "").trim();
      return raw ? Number(raw) : undefined;
    })(),
    billingType: String(formData.get("billingType") ?? "standard"),
    billToAccountId: String(formData.get("billToAccountId") ?? ""),
    contractProfileId: String(formData.get("contractProfileId") ?? ""),
    invoiceDeliverySettings: {
      method: String(formData.get("invoiceDeliveryMethod") ?? "payer_email"),
      recipientEmail: String(formData.get("invoiceDeliveryRecipientEmail") ?? ""),
      label: String(formData.get("invoiceDeliveryLabel") ?? "")
    },
    autoBillingEnabled: formData.get("autoBillingEnabled") === "on",
    requiredBillingReferences: {
      requirePo: formData.get("requirePo") === "on",
      requireCustomerReference: formData.get("requireCustomerReference") === "on",
      labels: String(formData.get("requiredReferenceLabels") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    }
  };
}

export async function createCustomerCompanyAction(
  _: { error: string | null; success: string | null; customerCompanyId?: string | null },
  formData: FormData
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null, customerCompanyId: null };
  }

  const parsed = customerCompanyInputSchema.safeParse({
    ...buildCustomerCompanyPayload(formData)
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid customer input.", success: null, customerCompanyId: null };
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
      success: buildCustomerResultMessage(result, `${result.customer.name} created.`),
      customerCompanyId: result.customer.id
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create customer.",
      success: null,
      customerCompanyId: null
    };
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
    ...buildCustomerCompanyPayload(formData)
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

export async function updateCustomerCompanyProfileAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  const customerCompanyId = String(formData.get("customerCompanyId") ?? "").trim();
  if (!customerCompanyId) {
    redirect("/app/admin/clients");
  }

  const parsed = customerCompanyInputSchema.safeParse({
    customerCompanyId,
    ...buildCustomerCompanyPayload(formData)
  });

  if (!parsed.success) {
    redirect(buildClientProfileHref(customerCompanyId, {
      edit: "1",
      customer: parsed.error.issues[0]?.message ?? "Invalid customer input."
    }));
  }

  try {
    const result = await updateCustomerCompany(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed.data
    );
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/clients");
    revalidatePath(`/app/admin/clients/${customerCompanyId}`);
    revalidatePath("/app/admin/billing");
    redirect(buildClientProfileHref(customerCompanyId, {
      customer: buildCustomerResultMessage(result, `${result.customer.name} updated.`)
    }));
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirect(buildClientProfileHref(customerCompanyId, {
      edit: "1",
      customer: error instanceof Error ? error.message : "Unable to update customer."
    }));
  }
}

export async function deleteCustomerCompanyAction(
  _: { error: string | null; success: string | null; redirectTo: string | null },
  formData: FormData
) {
  const session = await auth();
  const customerCompanyId = String(formData.get("customerCompanyId") ?? "").trim();

  if (!session?.user?.tenantId || !customerCompanyId) {
    return { error: "Unauthorized", success: null, redirectTo: null };
  }

  try {
    const result = await deleteCustomerCompany(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      customerCompanyId
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/clients");
    revalidatePath(`/app/admin/clients/${customerCompanyId}`);
    revalidatePath("/app/admin/billing");
    revalidatePath("/app/admin/quotes");
    revalidatePath("/app/admin/email-reminders");
    revalidatePath("/app/admin/upcoming-inspections");

    return {
      error: null,
      success: `${result.name} deleted.`,
      redirectTo: buildClientsHref({
        customers: `${result.name} deleted.`
      })
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to delete customer.",
      success: null,
      redirectTo: null
    };
  }
}

