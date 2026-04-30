"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { auth } from "@/auth";
import {
  addInspectionTask,
  approveInspectionCloseoutRequest,
  dismissInspectionCloseoutRequest,
  createInspection,
  clearBillingSummaryItemCatalogLink,
  clearBillingSummaryItemGroupCatalogLink,
  createDirectQuickBooksInvoice,
  deleteInspection,
  importCustomerSiteCsv,
  createInspectionAmendment,
  createOneTimeInspectionSite,
  customInspectionSiteOptionValue,
  ensureGenericInspectionSite,
  genericInspectionSiteOptionValue,
  getAdminBillingSummaryDetail,
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
  updateInspectionBillingSourceType,
  updateInspection,
  updateInspectionStatus,
  reopenCompletedReportForCorrection,
  regenerateFinalizedReportPdf,
  inspectionTypeRegistry,
  markInspectionTaskNotNeeded,
  removeInspectionTask,
  uploadInspectionPdfAttachment
} from "@testworx/lib/server/index";

export { getCustomerSiteImportTemplateCsv };

type InspectionType = keyof typeof inspectionTypeRegistry;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function extractBillingResolutionBlockMessage(detail: Awaited<ReturnType<typeof getAdminBillingSummaryDetail>>) {
  if (!detail) {
    return null;
  }

  const deliverySnapshot = asRecord(detail.deliverySnapshot);
  const blockingIssueCode = typeof deliverySnapshot?.blockingIssueCode === "string"
    ? deliverySnapshot.blockingIssueCode
    : null;

  if (blockingIssueCode === "provider_contract_expired") {
    return "This work order is tied to an expired provider contract. Update the contract or override billing before invoicing.";
  }

  return null;
}

function resolveInspectionDeleteRedirectTarget(input: string | null | undefined) {
  const fallback = "/app/admin/dashboard?inspection=deleted";
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

export async function createInspectionAction(
  _: { error: string | null; success: string | null; redirectTo?: string | null; createdInspectionId?: string | null },
  formData: FormData
) {
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
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/dashboard");
    revalidatePath("/app/admin/inspections");
    revalidatePath("/app/admin/upcoming-inspections");
    revalidatePath("/app/admin/amendments");
    revalidatePath(`/app/admin/inspections/${inspection.id}`);
    revalidatePath("/app/tech");
    revalidatePath("/app/customer");
    return {
      error: null,
      success: `Inspection created successfully for ${inspection.scheduledStart.toLocaleString()}.`,
      redirectTo: null,
      createdInspectionId: inspection.id
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create inspection.",
      success: null,
      redirectTo: null,
      createdInspectionId: null
    };
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
    revalidatePath("/app/admin/dashboard");
    revalidatePath("/app/admin/inspections");
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
      success: `Imported ${summary.rowCount} row(s): ${summary.customersCreated} customer(s) created, ${summary.customersUpdated} customer(s) updated, ${summary.sitesCreated} site(s) created, ${summary.sitesUpdated} site(s) updated, ${summary.assetsCreated} asset(s) created, ${summary.assetsUpdated} asset(s) updated.${summary.quickBooksCustomersSynced > 0 ? ` Synced ${summary.quickBooksCustomersSynced} customer${summary.quickBooksCustomersSynced === 1 ? "" : "s"} to QuickBooks.` : ""}${summary.quickBooksCustomerSyncFailures > 0 ? ` ${summary.quickBooksCustomerSyncFailures} customer QuickBooks sync${summary.quickBooksCustomerSyncFailures === 1 ? "" : "s"} failed and can be retried from Clients.` : ""}`
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to import CSV.", success: null };
  }
}

export async function updateInspectionAction(
  _: { error: string | null; success: string | null; redirectTo?: string | null; createdInspectionId?: string | null },
  formData: FormData
) {
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
    return { error: null, success: "Visit updated successfully.", redirectTo: null, createdInspectionId: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update inspection.",
      success: null,
      redirectTo: null,
      createdInspectionId: null
    };
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
    revalidatePath("/app/admin/dashboard");
    revalidatePath("/app/admin/inspections");
    revalidatePath("/app/admin/reports");
    revalidatePath("/app/admin/amendments");
    revalidatePath("/app/admin/billing");
    revalidatePath("/app/admin/archive");
    revalidatePath("/app/deficiencies");
    revalidatePath("/app/tech");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);

    return { error: null, success: "Inspection status updated successfully." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update inspection status.", success: null };
  }
}

export async function approveInspectionCloseoutRequestAction(inspectionId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Unauthorized" };
  }

  try {
    const createdInspection = await approveInspectionCloseoutRequest(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath(`/app/admin/inspections/${createdInspection.id}`);
    revalidatePath("/app/tech");

    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to approve this request." };
  }
}

export async function dismissInspectionCloseoutRequestAction(inspectionId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Unauthorized" };
  }

  try {
    await dismissInspectionCloseoutRequest(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath("/app/tech");

    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to dismiss this request." };
  }
}

export async function removeInspectionTaskAdminAction(inspectionId: string, inspectionTaskId: string) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Unauthorized" };
  }

  try {
    await removeInspectionTask(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { inspectionId, inspectionTaskId }
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath("/app/admin/reports");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath(`/app/admin/reports/${inspectionId}/${inspectionTaskId}`);
    revalidatePath("/app/tech");
    revalidatePath("/app/customer");

    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to remove this report type." };
  }
}

export async function addInspectionTaskAdminAction(inspectionId: string, inspectionType: InspectionType) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Unauthorized" };
  }

  if (!(inspectionType in inspectionTypeRegistry)) {
    return { ok: false, error: "Choose a valid report type." };
  }

  try {
    const task = await addInspectionTask(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { inspectionId, inspectionType }
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath("/app/admin/reports");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath(`/app/admin/reports/${inspectionId}/${task.id}`);
    revalidatePath("/app/tech");
    revalidatePath(`/app/tech/reports/${inspectionId}/${task.id}`);
    revalidatePath("/app/customer");

    return { ok: true, error: null, taskId: task.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to add this report type.", taskId: null };
  }
}

export async function markInspectionTaskNotNeededAdminAction(inspectionId: string, inspectionTaskId: string, reason: string) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Unauthorized" };
  }

  try {
    await markInspectionTaskNotNeeded(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { inspectionId, inspectionTaskId, reason }
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath("/app/admin/reports");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath(`/app/admin/reports/${inspectionId}/${inspectionTaskId}`);
    revalidatePath("/app/tech");
    revalidatePath(`/app/tech/reports/${inspectionId}/${inspectionTaskId}`);
    revalidatePath("/app/customer");

    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to mark this report type not needed." };
  }
}

export async function uploadInspectionPdfAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const customerVisible = formData.get("customerVisible") === "on";
  const files = formData
    .getAll("attachment")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!session?.user?.tenantId || !inspectionId || files.length === 0) {
    return { error: "Select at least one PDF to upload.", success: null };
  }

  try {
    for (const file of files) {
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
    }

    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath("/app/customer");
    return {
      error: null,
      success: files.length === 1
        ? `${files[0]!.name} uploaded.`
        : `${files.length} PDFs uploaded.`
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to upload PDF.", success: null };
  }
}


export async function amendInspectionAction(
  _: { error: string | null; success: string | null; redirectTo?: string | null; createdInspectionId?: string | null },
  formData: FormData
) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const reason =
    String(formData.get("reason") ?? "").trim() ||
    "Created a new visit after work had already been recorded on the original visit.";
  if (!session?.user?.tenantId || !inspectionId) {
    return { error: "Unauthorized", success: null, redirectTo: null };
  }

  const parsed = parseUpdateInspectionFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form input.", success: null, redirectTo: null };
  }

  try {
    const actor = { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId };
    const resolvedInput = await resolveInspectionSiteSelection(actor, parsed.data, formData);
    const newVisit = await createInspectionAmendment(
      actor,
      inspectionId,
      { ...resolvedInput, reason }
    );
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath(`/app/admin/inspections/${newVisit.id}`);
    revalidatePath("/app/tech");
    return {
      error: null,
      success: "New visit created.",
      redirectTo: `/app/admin/inspections/${newVisit.id}?from=${encodeURIComponent("/app/admin/inspections")}`,
      createdInspectionId: newVisit.id
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create a new visit.",
      success: null,
      redirectTo: null,
      createdInspectionId: null
    };
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

export async function regenerateCompletedReportPdfAction(_: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const inspectionReportId = String(formData.get("inspectionReportId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");

  if (!session?.user?.tenantId || !inspectionId || !inspectionReportId || !taskId) {
    return { error: "Unauthorized", success: null };
  }

  try {
    await regenerateFinalizedReportPdf(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { inspectionReportId }
    );

    revalidatePath("/app/admin");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath(`/app/admin/reports/${inspectionId}/${taskId}`);
    revalidatePath("/app/admin/archive");
    revalidatePath("/app/customer");
    revalidatePath(`/app/customer/inspections/${inspectionId}`);
    revalidatePath(`/app/customer/reports/${inspectionReportId}`);

    return {
      error: null,
      success: "Report PDF regenerated with the current v2 renderer."
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to regenerate the report PDF.", success: null };
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
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  if (status === "invoiced") {
    const detail = await getAdminBillingSummaryDetail(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );
    const blockMessage = extractBillingResolutionBlockMessage(detail);
    if (blockMessage) {
      return { ok: false, error: blockMessage, message: null, detail };
    }
  }

  await updateBillingSummaryStatus(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    summaryId,
    status
  );

  revalidatePath("/app/admin");
  revalidatePath("/app/admin/billing");
  revalidatePath("/app/admin/archive");
  revalidatePath(`/app/admin/billing/${inspectionId}`);

  const detail = await getAdminBillingSummaryDetail(
    { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
    inspectionId
  );

  return {
    ok: true,
    error: null,
    message: `Billing summary marked ${status.replaceAll("_", " ")}.`,
    detail
  };
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
      description: string | null;
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
      pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 20 },
      hasSearched: true
    };
  }

  try {
    const result = await searchBillingSummaryItemCatalogMatches(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { summaryId, itemId, query, page: Number.isFinite(page) ? page : 1, limit: 20 }
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
      pagination: { page: 1, totalPages: 1, totalCount: 0, limit: 20 },
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

export async function createDirectQuickBooksInvoiceAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Unauthorized", message: null, invoice: null };
  }

    try {
      const lineItemsJson = String(formData.get("lineItemsJson") ?? "[]");
      const proposalType = String(formData.get("proposalType") ?? "").trim() || undefined;
      const parsedLineItems = JSON.parse(lineItemsJson) as Array<{
        catalogItemId: string;
        description: string;
        quantity: number;
      unitPrice: number;
      taxable: boolean;
    }>;

      const result = await createDirectQuickBooksInvoice(
        { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
        {
          customerCompanyId: String(formData.get("customerCompanyId") ?? "").trim() || undefined,
          walkInMode: formData.get("walkInMode") === "on",
          walkInCustomerName: String(formData.get("walkInCustomerName") ?? "").trim() || undefined,
          walkInCustomerEmail: String(formData.get("walkInCustomerEmail") ?? "").trim() || undefined,
          walkInCustomerPhone: String(formData.get("walkInCustomerPhone") ?? "").trim() || undefined,
          siteLabel: String(formData.get("siteLabel") ?? "").trim() || undefined,
          proposalType: proposalType as Parameters<typeof createDirectQuickBooksInvoice>[1]["proposalType"],
          issueDate: String(formData.get("issueDate") ?? "").trim(),
          dueDate: String(formData.get("dueDate") ?? "").trim() || undefined,
          memo: String(formData.get("memo") ?? "").trim() || undefined,
        sendEmail: formData.get("sendEmail") === "on",
        lineItems: parsedLineItems
      }
    );

    revalidatePath("/app/admin/billing");
    return {
      ok: true,
      error: null,
      message: result.invoiceNumber
        ? result.sendStatus === "sent"
          ? `Invoice ${result.invoiceNumber} created and sent from QuickBooks.`
          : `Invoice ${result.invoiceNumber} created in QuickBooks.`
        : result.sendStatus === "sent"
          ? "Invoice created and sent from QuickBooks."
          : "Invoice created in QuickBooks.",
      invoice: result
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to create invoice.",
      message: null,
      invoice: null
    };
  }
}

export async function syncBillingSummaryToQuickBooksAction(formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  if (!session?.user?.tenantId || !inspectionId) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  try {
    const existingDetail = await getAdminBillingSummaryDetail(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );
    const blockMessage = extractBillingResolutionBlockMessage(existingDetail);
    if (blockMessage) {
      return {
        ok: false,
        error: blockMessage,
        message: null,
        detail: existingDetail
      };
    }

    const result = await syncBillingSummaryToQuickBooks(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/billing");
    revalidatePath("/app/admin/archive");
    revalidatePath(`/app/admin/billing/${inspectionId}`);

    const detail = await getAdminBillingSummaryDetail(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );

    const message = result.quickbooksSendStatus === "sent"
      ? "Invoice synced and sent from QuickBooks."
      : result.quickbooksSendStatus === "send_skipped"
        ? result.quickbooksSendError ?? "Invoice synced to QuickBooks, but email send was skipped."
        : result.quickbooksSendStatus === "send_failed"
          ? result.quickbooksSendError ?? "Invoice synced to QuickBooks, but email send failed."
          : "Invoice synced to QuickBooks.";

    return {
      ok: true,
      error: null,
      message,
      detail
    };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : "QuickBooks sync failed.",
      message: null,
      detail: null
    };
  }
}

export async function sendQuickBooksInvoiceAction(formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  if (!session?.user?.tenantId || !inspectionId) {
    return { ok: false, error: "Unauthorized", message: null, detail: null };
  }

  try {
    const existingDetail = await getAdminBillingSummaryDetail(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );
    const blockMessage = extractBillingResolutionBlockMessage(existingDetail);
    if (blockMessage) {
      return {
        ok: false,
        error: blockMessage,
        message: null,
        detail: existingDetail
      };
    }

    const result = await sendQuickBooksInvoice(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId,
      { suppressThrowOnSendFailure: true }
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/billing");
    revalidatePath(`/app/admin/billing/${inspectionId}`);

    const detail = await getAdminBillingSummaryDetail(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId
    );

    return {
      ok: true,
      error: null,
      message: result.sendStatus === "sent"
        ? "Invoice sent from QuickBooks."
        : result.error ?? "QuickBooks email send was skipped.",
      detail
    };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : "QuickBooks send failed.",
      message: null,
      detail: null
    };
  }
}

export async function updateInspectionBillingSourceTypeAction(formData: FormData) {
  const session = await auth();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const sourceType = String(formData.get("sourceType") ?? "");

  if (!session?.user?.tenantId || !inspectionId || (sourceType !== "direct" && sourceType !== "third_party_provider")) {
    return;
  }

  try {
    await updateInspectionBillingSourceType(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { inspectionId, sourceType }
    );

    revalidatePath("/app/admin");
    revalidatePath("/app/admin/billing");
    revalidatePath(`/app/admin/billing/${inspectionId}`);
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
  } catch (error) {
    throw error instanceof Error ? error : new Error("Unable to update the billing override.");
  }
}

