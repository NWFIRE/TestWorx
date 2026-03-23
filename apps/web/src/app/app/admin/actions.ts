"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { auth } from "@/auth";
import {
  createInspection,
  importCustomerSiteCsv,
  createInspectionAmendment,
  getCustomerSiteImportTemplateCsv,
  uploadInspectionDocument,
  parseCreateInspectionFormData,
  parseUpdateInspectionFormData,
  sendQuickBooksInvoice,
  syncBillingSummaryToQuickBooks,
  updateBillingSummaryItem,
  updateBillingSummaryNotes,
  updateBillingSummaryStatus,
  updateDeficiencyStatus,
  updateInspection,
  reopenCompletedReportForCorrection,
  uploadInspectionPdfAttachment
} from "@testworx/lib";

export { getCustomerSiteImportTemplateCsv };

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
    const inspection = await createInspection({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, parsed.data);
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
      success: `Imported ${summary.rowCount} row(s): ${summary.customersCreated} customer(s) created, ${summary.customersUpdated} customer(s) updated, ${summary.sitesCreated} site(s) created, ${summary.sitesUpdated} site(s) updated, ${summary.assetsCreated} asset(s) created, ${summary.assetsUpdated} asset(s) updated.`
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
    await updateInspection({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, inspectionId, parsed.data);
    revalidatePath("/app/admin");
    revalidatePath("/app/admin/amendments");
    revalidatePath(`/app/admin/inspections/${inspectionId}`);
    revalidatePath("/app/tech");
    return { error: null, success: "Inspection updated successfully." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update inspection.", success: null };
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
    await createInspectionAmendment(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      inspectionId,
      { ...parsed.data, reason }
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
