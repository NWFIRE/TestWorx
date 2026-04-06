"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { auth } from "@/auth";
import {
  createInspection,
  clearBillingSummaryItemCatalogLink,
  clearBillingSummaryItemGroupCatalogLink,
  deleteInspection,
  importCustomerSiteCsv,
  createInspectionAmendment,
  createOneTimeInspectionSite,
  customInspectionSiteOptionValue,
  ensureGenericInspectionSite,
  genericInspectionSiteOptionValue,
  getCustomerSiteImportTemplateCsv,
  uploadInspectionDocument,
  parseCreateInspectionFormData,
  parseUpdateInspectionFormData,
  sendQuickBooksInvoice,
  searchBillingSummaryItemCatalogMatches,
  syncBillingSummaryToQuickBooks,
  linkBillingSummaryItemCatalog,
  linkBillingSummaryItemGroupCatalog,
  updateBillingSummaryItem,
  updateBillingSummaryItemGroup,
  updateBillingSummaryNotes,
  updateBillingSummaryStatus,
  updateDeficiencyStatus,
  editableInspectionStatuses,
  updateInspection,
  updateInspectionStatus,
  reopenCompletedReportForCorrection,
  uploadInspectionPdfAttachment
} from "@testworx/lib";

export { getCustomerSiteImportTemplateCsv };

function resolveInspectionDeleteRedirectTarget(input: string | null | undefined) {
  const fallback = "/app/admin?inspection=deleted";
  const candidate = (input ?? "").trim();
  if (!candidate.startsWith("/app/")) {
    return fallback;
  }

  if (candidate.startsWith("/app/admin/inspections/")) {
    return fallback;
  }

  return candidate.includes("?")
    ? `${candidate}&inspection=deleted`
    : `${candidate}?inspection=deleted`;
}

async function resolveInspectionSiteSelection<T extends {
  customerCompanyId: string;
  siteId: string;
}>(
  actor: {
    userId: string;
    role: string;
    tenantId: string;
  },
  input: T,
  formData?: FormData
): Promise<T> {
  if (input.siteId !== genericInspectionSiteOptionValue && input.siteId !== customInspectionSiteOptionValue) {
    return input;
  }

  if (input.siteId === customInspectionSiteOptionValue) {
    const customSiteName = String(formData?.get("customSiteName") ?? "").trim();
    const customSiteAddressLine1 = String(formData?.get("customSiteAddressLine1") ?? "").trim();
    const customSiteCity = String(formData?.get("customSiteCity") ?? "").trim();
    const customSiteState = String(formData?.get("customSiteState") ?? "").trim();
    const customSitePostalCode = String(formData?.get("customSitePostalCode") ?? "").trim();

    if (!customSiteName) {
      throw new Error("Enter a site name for the one-time site.");
    }

    if (!customSiteAddressLine1 || !customSiteCity || !customSiteState || !customSitePostalCode) {
      throw new Error("Complete the one-time site address before creating the inspection.");
    }

    const customSite = await createOneTimeInspectionSite(actor, input.customerCompanyId, {
      name: customSiteName,
      addressLine1: customSiteAddressLine1,
      addressLine2: String(formData?.get("customSiteAddressLine2") ?? "").trim() || null,
      city: customSiteCity,
      state: customSiteState,
      postalCode: customSitePostalCode,
      notes: String(formData?.get("customSiteNotes") ?? "").trim() || null
    });

    return {
      ...input,
      siteId: customSite.id
    };
  }

  const genericSite = await ensureGenericInspectionSite(
    actor,
    input.customerCompanyId
  );

  return {
    ...input,
    siteId: genericSite.id
  };
}

function readExternalDocumentFiles(formData: FormData) {
  return formData
    .getAll("externalDocuments")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export async function createInspectionAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  const parsed = parseCreateInspectionFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form input.", success: null };
  }

  try {
    const actor = { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId };
    const resolvedInput = await resolveInspectionSiteSelection(actor, parsed.data, formData);
    const inspection = await createInspection(actor, resolvedInput);
    const externalDocumentFiles = readExternalDocumentFiles(formData);
    const requiresSignature = formData.get("externalDocumentsRequireSignature") === "on";
    const customerVisible = formData.get("externalDocumentsCustomerVisible") === "on";
    const externalDocumentLabel = String(formData.get("externalDocumentLabel") ?? "").trim();

    for (const file of externalDocumentFiles) {
      await uploadInspectionDocument(
        { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
        {
          inspectionId: inspection.id,
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          bytes: new Uint8Array(await file.arrayBuffer()),
          label: externalDocumentFiles.length === 1 ? externalDocumentLabel || null : null,
          requiresSignature,
          customerVisible
        }
      );
    }
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath(`/app/admin/inspections/${inspection.id}`);
    revalidatePath("/app/tech");
    revalidatePath("/app/customer");
    return { error: null, success: `Inspection created successfully for ${inspection.scheduledStart.toLocaleString()}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create inspection.", success: null };
  }
}

export async function deleteInspectionAction(
  _: { error: string | null; success: string | null; redirectTo: string | null },
  formData: FormData
) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const redirectTo = resolveInspectionDeleteRedirectTarget(String(formData.get("redirectTo") ?? ""));

  if (!session?.user?.tenantId || !inspectionId) {
    return { error: "Unauthorized", success: null, redirectTo: null };
  }

  try {
    await deleteInspection(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath("/app/admin/billing");
    revalidatePath("/app/tech");
    revalidatePath("/app/customer");

    return { error: null, success: "Inspection deleted successfully.", redirectTo };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to delete inspection.",
      success: null,
      redirectTo: null
    };
  }
}

export async function importCustomerSiteCsvAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  const file = formData.get("csvFile");

  if (!session?.user?.tenantId || !(file instanceof File) || file.size === 0) {
    return { error: "Select a CSV file to import.", success: null };
  }

  try {
    const summary = await importCustomerSiteCsv(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      await file.text()
    );

    revalidatePath("/app/admin");
    return {
      error: null,
      success: `Imported ${summary.rowCount} row(s): ${summary.customersCreated} customer(s) created, ${summary.customersUpdated} customer(s) updated, ${summary.sitesCreated} site(s) created, ${summary.sitesUpdated} site(s) updated, ${summary.assetsCreated} asset(s) created, ${summary.assetsUpdated} asset(s) updated.${summary.quickBooksCustomersSynced > 0 ? ` Synced ${summary.quickBooksCustomersSynced} customer${summary.quickBooksCustomersSynced === 1 ? "" : "s"} to QuickBooks.` : ""}${summary.quickBooksCustomerSyncFailures > 0 ? ` ${summary.quickBooksCustomerSyncFailures} customer QuickBooks sync${summary.quickBooksCustomerSyncFailures === 1 ? "" : "s"} failed and can be retried from Settings.` : ""}`
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to import CSV.", success: null };
  }
}

export async function updateInspectionAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  if (!session?.user?.tenantId || !inspectionId) {
    return { error: "Unauthorized", success: null };
  }

  const parsed = parseUpdateInspectionFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form input.", success: null };
  }

  try {
    const actor = { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId };
    const resolvedInput = await resolveInspectionSiteSelection(actor, parsed.data, formData);
    await updateInspection(actor, inspectionId, resolvedInput);
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath("/app/tech");
    return { error: null, success: "Inspection updated successfully." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update inspection.", success: null };
  }
}

export async function updateInspectionStatusAdminAction(
  _: { error: string | null; success: string | null },
  formData: FormData
) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const nextStatus = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!session?.user?.tenantId || !inspectionId) {
    return { error: "Unauthorized", success: null };
  }

  if (!["tenant_admin", "office_admin"].includes(session.user.role)) {
    return { error: "Only administrators can update inspection status.", success: null };
  }

  if (!editableInspectionStatuses.includes(nextStatus as (typeof editableInspectionStatuses)[number])) {
    return { error: "Select a valid inspection status.", success: null };
  }

  try {
    await updateInspectionStatus(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId,
      nextStatus as (typeof editableInspectionStatuses)[number],
      { note: note || null }
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/scheduling");
    revalidatePath("/app/admin/reports");
    revalidatePath("/app/admin/amendments");
    revalidatePath("/app/admin/billing");
    revalidatePath("/app/deficiencies");
    revalidatePath("/app/tech");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);

    return { error: null, success: "Inspection status updated successfully." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update inspection status.", success: null };
  }
}

export async function uploadInspectionPdfAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const customerVisible = formData.get("customerVisible") === "on";
  const file = formData.get("attachment");

  if (!session?.user?.tenantId || !inspectionId || !(file instanceof File) || file.size === 0) {
    return { error: "Select a PDF to upload.", success: null };
  }

  try {
    await uploadInspectionPdfAttachment(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        inspectionId,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        bytes: new Uint8Array(await file.arrayBuffer()),
        customerVisible
      }
    );

    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath("/app/customer");
    return { error: null, success: `${file.name} uploaded.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to upload PDF.", success: null };
  }
}


export async function amendInspectionAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!session?.user?.tenantId || !inspectionId) {
    return { error: "Unauthorized", success: null };
  }

  const parsed = parseUpdateInspectionFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form input.", success: null };
  }

  try {
    const actor = { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId };
    const resolvedInput = await resolveInspectionSiteSelection(actor, parsed.data, formData);
    await createInspectionAmendment(
      actor,
      inspectionId,
      { ...resolvedInput, reason }
    );
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath("/app/tech");
    return { error: null, success: "Amended inspection created successfully." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create amendment.", success: null };
  }
}

export async function uploadInspectionExternalDocumentAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const requiresSignature = formData.get("requiresSignature") === "on";
  const customerVisible = formData.get("customerVisible") === "on";
  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("document");

  if (!session?.user?.tenantId || !inspectionId || !(file instanceof File) || file.size === 0) {
    return { error: "Select a PDF to upload.", success: null };
  }

  try {
    await uploadInspectionDocument(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      {
        inspectionId,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        bytes: new Uint8Array(await file.arrayBuffer()),
        label: label || null,
        requiresSignature,
        customerVisible
      }
    );

    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath("/app/admin");
    revalidatePath("/app/tech");
    revalidatePath("/app/customer");
    return {
      error: null,
      success: `${file.name} attached to the inspection.`
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to upload inspection document.", success: null };
  }
}

export async function reopenCompletedReportAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const inspectionReportId = String(formData.get("inspectionReportId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const correctionMode = String(formData.get("correctionMode") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!session?.user?.tenantId || !inspectionId || !inspectionReportId || !taskId) {
    return { error: "Unauthorized", success: null };
  }

  if (correctionMode !== "admin_edit" && correctionMode !== "reissue_to_technician") {
    return { error: "Choose a valid correction action.", success: null };
  }

  try {
    const reopened = await reopenCompletedReportForCorrection(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { inspectionReportId, correctionMode, reason }
    );

    revalidatePath("/app/admin");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath(`/app/admin/reports/${inspectionId}/${taskId}`);
    revalidatePath(`/app/tech/reports/${inspectionId}/${taskId}`);
    revalidatePath("/app/tech");
    revalidatePath("/app/admin/billing");

    return {
      error: null,
      success: reopened.correctionState === "reissued_to_technician"
        ? "Report re-issued to the assigned technician for correction."
        : "Completed report reopened for admin correction."
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to reopen completed report.", success: null };
  }
}

export async function updateDeficiencyStatusAction(formData: FormData) {
  const session = await auth();
  const deficiencyId = String(formData.get("deficiencyId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!session?.user?.tenantId || !deficiencyId || !status) {
    return;
  }

  await updateDeficiencyStatus(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    deficiencyId,
    status
  );

  revalidatePath("/app/deficiencies");
  revalidatePath("/app/admin");
}

export async function updateBillingSummaryStatusAction(formData: FormData) {
  const session = await auth();
  const summaryId = String(formData.get("summaryId") ?? "");
  const status = String(formData.get("status") ?? "") as "draft" | "reviewed" | "invoiced";
  const inspectionId = String(formData.get("inspectionId") ?? "");
  if (!session?.user?.tenantId || !summaryId || !status || !inspectionId) {
    return;
  }

  await updateBillingSummaryStatus(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    summaryId,
    status
  );

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/billing");
  revalidatePath(`/app/admin/billing/${inspectionId}`);
}

export async function updateBillingSummaryNotesAction(formData: FormData) {
  const session = await auth();
  const summaryId = String(formData.get("summaryId") ?? "");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const notes = String(formData.get("notes") ?? "");
  if (!session?.user?.tenantId || !summaryId || !inspectionId) {
    return;
  }

  await updateBillingSummaryNotes(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    summaryId,
    notes
  );

  revalidatePath("/app/admin/billing");
  revalidatePath(`/app/admin/billing/${inspectionId}`);
}

export async function updateBillingSummaryItemAction(formData: FormData) {
  const session = await auth();
  const summaryId = String(formData.get("summaryId") ?? "");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const quantity = Number(formData.get("quantity") ?? "0");
  const unitPriceRaw = String(formData.get("unitPrice") ?? "");
  const unitPrice = unitPriceRaw.trim().length > 0 ? Number(unitPriceRaw) : null;
  if (!session?.user?.tenantId || !summaryId || !inspectionId || !itemId) {
    return;
  }

  await updateBillingSummaryItem(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    summaryId,
    itemId,
    Number.isFinite(quantity) ? quantity : 0,
    unitPrice !== null && Number.isFinite(unitPrice) ? unitPrice : null
  );

  revalidatePath("/app/admin/billing");
  revalidatePath(`/app/admin/billing/${inspectionId}`);
}

export async function updateBillingSummaryItemGroupAction(formData: FormData) {
  const session = await auth();
  const summaryId = String(formData.get("summaryId") ?? "");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const itemIds = formData.getAll("itemIds").map((value) => String(value)).filter(Boolean);
  const quantity = Number(formData.get("quantity") ?? "0");
  const unitPriceRaw = String(formData.get("unitPrice") ?? "");
  const unitPrice = unitPriceRaw.trim().length > 0 ? Number(unitPriceRaw) : null;
  if (!session?.user?.tenantId || !summaryId || !inspectionId || itemIds.length === 0) {
    return;
  }

  await updateBillingSummaryItemGroup(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    summaryId,
    itemIds,
    Number.isFinite(quantity) ? quantity : 0,
    unitPrice !== null && Number.isFinite(unitPrice) ? unitPrice : null
  );

  revalidatePath("/app/admin/billing");
  revalidatePath(`/app/admin/billing/${inspectionId}`);
}

export async function searchBillingSummaryItemCatalogMatchesAction(
  _: {
    error: string | null;
    query: string;
    results: Array<{
      catalogItemId: string;
      quickbooksItemId: string;
      name: string;
      sku: string | null;
      itemType: string;
      unitPrice: number | null;
      alias: string | null;
      confidence: number;
      matchMethod: string;
      autoMatchEligible: boolean;
    }>;
    pagination: { page: number; totalPages: number; totalCount: number; limit: number };
    hasSearched: boolean;
  },
  formData: FormData
) {
  const session = await auth();
  const summaryId = String(formData.get("summaryId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const query = String(formData.get("query") ?? "").trim();
  const page = Number(formData.get("page") ?? "1");

  if (!session?.user?.tenantId || !summaryId || !itemId) {
    return {
      error: "Unauthorized",
      query,
      results: [],
      pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 8 },
      hasSearched: true
    };
  }

  try {
    const result = await searchBillingSummaryItemCatalogMatches(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { summaryId, itemId, query, page: Number.isFinite(page) ? page : 1, limit: 8 }
    );

    return {
      error: null,
      query,
      results: result.results,
      pagination: result.pagination,
      hasSearched: true
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to search products and services.",
      query,
      results: [],
      pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 8 },
      hasSearched: true
    };
  }
}

export async function linkBillingSummaryItemCatalogAction(
  _: { error: string | null; success: string | null },
  formData: FormData
) {
  const session = await auth();
  const summaryId = String(formData.get("summaryId") ?? "");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const itemIds = formData.getAll("itemIds").map((value) => String(value)).filter(Boolean);
  const catalogItemId = String(formData.get("catalogItemId") ?? "");
  const saveMapping = formData.get("saveMapping") === "on";
  const alias = String(formData.get("alias") ?? "");

  if (!session?.user?.tenantId || !summaryId || !inspectionId || (!itemId && itemIds.length === 0) || !catalogItemId) {
    return { error: "Unauthorized", success: null };
  }

  try {
    const linked = itemIds.length > 1
      ? await linkBillingSummaryItemGroupCatalog(
          { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
          { summaryId, itemIds, catalogItemId, saveMapping, alias }
        )
      : await linkBillingSummaryItemCatalog(
          { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
          { summaryId, itemId, catalogItemId, saveMapping, alias }
        );

    revalidatePath("/app/admin/billing");
    revalidatePath(`/app/admin/billing/${inspectionId}`);
    return { error: null, success: `${linked.catalogItemName} linked.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to link billing item.", success: null };
  }
}

export async function clearBillingSummaryItemCatalogLinkAction(
  _: { error: string | null; success: string | null },
  formData: FormData
) {
  const session = await auth();
  const summaryId = String(formData.get("summaryId") ?? "");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const itemIds = formData.getAll("itemIds").map((value) => String(value)).filter(Boolean);

  if (!session?.user?.tenantId || !summaryId || !inspectionId || (!itemId && itemIds.length === 0)) {
    return { error: "Unauthorized", success: null };
  }

  try {
    if (itemIds.length > 1) {
      await clearBillingSummaryItemGroupCatalogLink(
        { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
        { summaryId, itemIds }
      );
    } else {
      await clearBillingSummaryItemCatalogLink(
        { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
        { summaryId, itemId }
      );
    }

    revalidatePath("/app/admin/billing");
    revalidatePath(`/app/admin/billing/${inspectionId}`);
    return { error: null, success: "Billing item link cleared." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to clear billing item link.", success: null };
  }
}

export async function syncBillingSummaryToQuickBooksAction(formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  if (!session?.user?.tenantId || !inspectionId) {
    return;
  }

  try {
    await syncBillingSummaryToQuickBooks(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/billing");
    revalidatePath(`/app/admin/billing/${inspectionId}`);
    redirect(`/app/admin/billing/${inspectionId}?quickbooks=success`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "QuickBooks sync failed.";
    redirect(`/app/admin/billing/${inspectionId}?quickbooks=${encodeURIComponent(message)}`);
  }
}

export async function sendQuickBooksInvoiceAction(formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  if (!session?.user?.tenantId || !inspectionId) {
    return;
  }

  try {
    await sendQuickBooksInvoice(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/billing");
    revalidatePath(`/app/admin/billing/${inspectionId}`);
    redirect(`/app/admin/billing/${inspectionId}?quickbooks=sent`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "QuickBooks send failed.";
    redirect(`/app/admin/billing/${inspectionId}?quickbooks=${encodeURIComponent(message)}`);
  }
}
