"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  contractProviderAccountInputSchema,
  createContractProviderAccount,
  createProviderContractProfile,
  createProviderContractRate,
  parseProviderContractRateInput,
  providerContractProfileInputSchema,
  serviceSiteProviderAssignmentInputSchema,
  setServiceSiteProviderAssignment,
  updateContractProviderAccount,
  updateProviderContractProfile,
  updateProviderContractRate
} from "@testworx/lib/server/index";

function requireActor(session: {
  user?: {
    id?: string | null;
    role?: string | null;
    tenantId?: string | null;
  } | null;
} | null) {
  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  return {
    userId: session.user.id ?? "",
    role: session.user.role ?? "",
    tenantId: session.user.tenantId
  };
}

function buildRedirect(target: string, notice: string) {
  const [pathname, queryString] = target.split("?");
  const params = new URLSearchParams(queryString ?? "");
  params.set("notice", notice);
  const safePath = pathname || "/app/admin/contract-providers";
  return params.toString() ? `${safePath}?${params.toString()}` : safePath;
}

export async function createContractProviderAccountAction(formData: FormData) {
  const actor = requireActor(await auth());
  const parsed = contractProviderAccountInputSchema.parse({
    name: String(formData.get("name") ?? ""),
    legalName: String(formData.get("legalName") ?? ""),
    status: String(formData.get("status") ?? "active"),
    billingContactName: String(formData.get("billingContactName") ?? ""),
    billingEmail: String(formData.get("billingEmail") ?? ""),
    billingPhone: String(formData.get("billingPhone") ?? ""),
    remittanceAddressLine1: String(formData.get("remittanceAddressLine1") ?? ""),
    remittanceAddressLine2: String(formData.get("remittanceAddressLine2") ?? ""),
    remittanceCity: String(formData.get("remittanceCity") ?? ""),
    remittanceState: String(formData.get("remittanceState") ?? ""),
    remittancePostalCode: String(formData.get("remittancePostalCode") ?? ""),
    paymentTerms: String(formData.get("paymentTerms") ?? ""),
    notes: String(formData.get("notes") ?? "")
  });

  await createContractProviderAccount(actor, parsed);
  revalidatePath("/app/admin/contract-providers");
  redirect(buildRedirect("/app/admin/contract-providers", "Contract provider created."));
}

export async function updateContractProviderAccountAction(formData: FormData) {
  const actor = requireActor(await auth());
  const redirectTo = String(formData.get("redirectTo") ?? "/app/admin/contract-providers");
  const parsed = contractProviderAccountInputSchema.parse({
    providerAccountId: String(formData.get("providerAccountId") ?? ""),
    name: String(formData.get("name") ?? ""),
    legalName: String(formData.get("legalName") ?? ""),
    status: String(formData.get("status") ?? "active"),
    billingContactName: String(formData.get("billingContactName") ?? ""),
    billingEmail: String(formData.get("billingEmail") ?? ""),
    billingPhone: String(formData.get("billingPhone") ?? ""),
    remittanceAddressLine1: String(formData.get("remittanceAddressLine1") ?? ""),
    remittanceAddressLine2: String(formData.get("remittanceAddressLine2") ?? ""),
    remittanceCity: String(formData.get("remittanceCity") ?? ""),
    remittanceState: String(formData.get("remittanceState") ?? ""),
    remittancePostalCode: String(formData.get("remittancePostalCode") ?? ""),
    paymentTerms: String(formData.get("paymentTerms") ?? ""),
    notes: String(formData.get("notes") ?? "")
  });

  await updateContractProviderAccount(actor, parsed);
  revalidatePath("/app/admin/contract-providers");
  if (redirectTo.startsWith("/app/admin/contract-providers/")) {
    revalidatePath(redirectTo);
  }
  redirect(buildRedirect(redirectTo, "Provider billing info saved."));
}

export async function createProviderContractProfileAction(formData: FormData) {
  const actor = requireActor(await auth());
  const redirectTo = String(formData.get("redirectTo") ?? "/app/admin/contract-providers");
  const parsed = providerContractProfileInputSchema.parse({
    providerAccountId: String(formData.get("providerAccountId") ?? ""),
    name: String(formData.get("name") ?? ""),
    status: String(formData.get("status") ?? "draft"),
    effectiveStartDate: String(formData.get("effectiveStartDate") ?? ""),
    effectiveEndDate: String(formData.get("effectiveEndDate") ?? ""),
    pricingStrategy: String(formData.get("pricingStrategy") ?? "provider_rate_card"),
    invoiceGroupingMode: String(formData.get("invoiceGroupingMode") ?? "per_work_order"),
    requireProviderWorkOrderNumber: formData.get("requireProviderWorkOrderNumber") === "on",
    requireSiteReferenceNumber: formData.get("requireSiteReferenceNumber") === "on",
    notes: String(formData.get("notes") ?? "")
  });

  await createProviderContractProfile(actor, parsed);
  revalidatePath("/app/admin/contract-providers");
  if (redirectTo.startsWith("/app/admin/contract-providers/")) {
    revalidatePath(redirectTo);
  }
  redirect(buildRedirect(redirectTo, "Provider contract created."));
}

export async function updateProviderContractProfileAction(formData: FormData) {
  const actor = requireActor(await auth());
  const redirectTo = String(formData.get("redirectTo") ?? "/app/admin/contract-providers");
  const parsed = providerContractProfileInputSchema.parse({
    providerContractProfileId: String(formData.get("providerContractProfileId") ?? ""),
    providerAccountId: String(formData.get("providerAccountId") ?? ""),
    name: String(formData.get("name") ?? ""),
    status: String(formData.get("status") ?? "draft"),
    effectiveStartDate: String(formData.get("effectiveStartDate") ?? ""),
    effectiveEndDate: String(formData.get("effectiveEndDate") ?? ""),
    pricingStrategy: String(formData.get("pricingStrategy") ?? "provider_rate_card"),
    invoiceGroupingMode: String(formData.get("invoiceGroupingMode") ?? "per_work_order"),
    requireProviderWorkOrderNumber: formData.get("requireProviderWorkOrderNumber") === "on",
    requireSiteReferenceNumber: formData.get("requireSiteReferenceNumber") === "on",
    notes: String(formData.get("notes") ?? "")
  });

  await updateProviderContractProfile(actor, parsed);
  revalidatePath("/app/admin/contract-providers");
  if (redirectTo.startsWith("/app/admin/contract-providers/")) {
    revalidatePath(redirectTo);
  }
  redirect(buildRedirect(redirectTo, "Provider contract saved."));
}

export async function createProviderContractRateAction(formData: FormData) {
  const actor = requireActor(await auth());
  const redirectTo = String(formData.get("redirectTo") ?? "/app/admin/contract-providers");
  const parsed = parseProviderContractRateInput({
    providerContractProfileId: String(formData.get("providerContractProfileId") ?? ""),
    serviceType: String(formData.get("serviceType") ?? ""),
    inspectionType: String(formData.get("inspectionType") ?? ""),
    assetCategory: String(formData.get("assetCategory") ?? ""),
    reportType: String(formData.get("reportType") ?? ""),
    pricingMethod: String(formData.get("pricingMethod") ?? "flat_rate") as "flat_rate" | "per_unit" | "hourly",
    unitRate: String(formData.get("unitRate") ?? ""),
    flatRate: String(formData.get("flatRate") ?? ""),
    minimumCharge: String(formData.get("minimumCharge") ?? ""),
    effectiveStartDate: String(formData.get("effectiveStartDate") ?? ""),
    effectiveEndDate: String(formData.get("effectiveEndDate") ?? ""),
    priority: String(formData.get("priority") ?? "0")
  });

  await createProviderContractRate(actor, parsed);
  revalidatePath("/app/admin/contract-providers");
  if (redirectTo.startsWith("/app/admin/contract-providers/")) {
    revalidatePath(redirectTo);
  }
  redirect(buildRedirect(redirectTo, "Contract pricing rule created."));
}

export async function updateProviderContractRateAction(formData: FormData) {
  const actor = requireActor(await auth());
  const redirectTo = String(formData.get("redirectTo") ?? "/app/admin/contract-providers");
  const parsed = parseProviderContractRateInput({
    providerContractRateId: String(formData.get("providerContractRateId") ?? ""),
    providerContractProfileId: String(formData.get("providerContractProfileId") ?? ""),
    serviceType: String(formData.get("serviceType") ?? ""),
    inspectionType: String(formData.get("inspectionType") ?? ""),
    assetCategory: String(formData.get("assetCategory") ?? ""),
    reportType: String(formData.get("reportType") ?? ""),
    pricingMethod: String(formData.get("pricingMethod") ?? "flat_rate") as "flat_rate" | "per_unit" | "hourly",
    unitRate: String(formData.get("unitRate") ?? ""),
    flatRate: String(formData.get("flatRate") ?? ""),
    minimumCharge: String(formData.get("minimumCharge") ?? ""),
    effectiveStartDate: String(formData.get("effectiveStartDate") ?? ""),
    effectiveEndDate: String(formData.get("effectiveEndDate") ?? ""),
    priority: String(formData.get("priority") ?? "0")
  });

  await updateProviderContractRate(actor, parsed);
  revalidatePath("/app/admin/contract-providers");
  if (redirectTo.startsWith("/app/admin/contract-providers/")) {
    revalidatePath(redirectTo);
  }
  redirect(buildRedirect(redirectTo, "Contract pricing rule saved."));
}

export async function setServiceSiteProviderAssignmentAction(formData: FormData) {
  const actor = requireActor(await auth());
  const customerId = String(formData.get("customerCompanyId") ?? "");
  const parsed = serviceSiteProviderAssignmentInputSchema.parse({
    serviceSiteId: String(formData.get("serviceSiteId") ?? ""),
    providerAccountId: String(formData.get("providerAccountId") ?? ""),
    providerContractProfileId: String(formData.get("providerContractProfileId") ?? ""),
    externalAccountName: String(formData.get("externalAccountName") ?? ""),
    externalAccountNumber: String(formData.get("externalAccountNumber") ?? ""),
    externalLocationCode: String(formData.get("externalLocationCode") ?? ""),
    effectiveStartDate: String(formData.get("effectiveStartDate") ?? ""),
    effectiveEndDate: String(formData.get("effectiveEndDate") ?? ""),
    billingNotes: String(formData.get("billingNotes") ?? "")
  });

  const result = await setServiceSiteProviderAssignment(actor, parsed);
  revalidatePath(`/app/admin/clients/${customerId}`);
  revalidatePath("/app/admin/billing");
  revalidatePath("/app/admin/inspections");
  redirect(`/app/admin/clients/${encodeURIComponent(customerId)}?customer=${encodeURIComponent(result.message)}`);
}
