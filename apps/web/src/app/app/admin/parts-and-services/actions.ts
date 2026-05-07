"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  clearQuickBooksItemMappingForCode,
  createQuickBooksCatalogItem,
  importQuickBooksCatalogItems,
  quickBooksCatalogItemInputSchema,
  saveQuickBooksItemMappingForCode,
  updateQuickBooksCatalogItem
} from "@testworx/lib/server/index";

type CatalogActionState = {
  error: string | null;
  success: string | null;
};

function revalidateCatalogPaths() {
  revalidatePath("/app/admin/parts-and-services");
  revalidatePath("/app/admin/settings");
  revalidatePath("/app/admin/billing");
  revalidatePath("/app/admin/quotes");
}

export async function resyncQuickBooksCatalogItemsFromPartsAction() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return;
  }

  await importQuickBooksCatalogItems({
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  });
  revalidateCatalogPaths();
}

export async function importQuickBooksCatalogItemsInlineAction(
  _: CatalogActionState,
  submittedFormData: FormData
): Promise<CatalogActionState> {
  void submittedFormData;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  try {
    const result = await importQuickBooksCatalogItems({
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    });
    revalidateCatalogPaths();
    return {
      error: null,
      success: `Imported ${result.importedItemCount} QuickBooks product${result.importedItemCount === 1 ? "" : "s"} and service${result.importedItemCount === 1 ? "" : "s"}.`
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "QuickBooks catalog import failed.",
      success: null
    };
  }
}

export async function createQuickBooksCatalogItemInlineAction(
  _: CatalogActionState,
  formData: FormData
): Promise<CatalogActionState> {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null };
  }

  const unitPriceRaw = String(formData.get("unitPrice") ?? "").trim();
  const parsed = quickBooksCatalogItemInputSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    itemType: String(formData.get("itemType") ?? "Service"),
    active: formData.get("active") === "on",
    taxable: formData.get("taxable") === "on",
    unitPrice: unitPriceRaw ? Number(unitPriceRaw) : null
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid product or service input.", success: null };
  }

  try {
    const item = await createQuickBooksCatalogItem(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed.data
    );
    revalidateCatalogPaths();
    return { error: null, success: `${item.name} created in QuickBooks.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create product or service.", success: null };
  }
}

export async function updateQuickBooksCatalogItemInlineAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { ok: false, error: "Unauthorized", success: null };
  }

  const unitPriceRaw = String(formData.get("unitPrice") ?? "").trim();
  const parsed = quickBooksCatalogItemInputSchema.safeParse({
    catalogItemId: String(formData.get("catalogItemId") ?? ""),
    name: String(formData.get("name") ?? ""),
    sku: String(formData.get("sku") ?? ""),
    itemType: String(formData.get("itemType") ?? "Service"),
    active: formData.get("active") === "on",
    taxable: formData.get("taxable") === "on",
    unitPrice: unitPriceRaw ? Number(unitPriceRaw) : null
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product or service input.", success: null };
  }

  try {
    const item = await updateQuickBooksCatalogItem(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      parsed.data
    );
    revalidateCatalogPaths();
    return { ok: true, error: null, success: `${item.name} updated in QuickBooks.` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update product or service.",
      success: null
    };
  }
}

export async function saveQuickBooksItemMappingInlineAction(
  _: {
    error: string | null;
    success: string | null;
    internalCode?: string | null;
    mapping?: {
      qbItemId: string;
      qbItemName: string;
      qbItemType: string | null;
      matchSource: string;
      qbActive: boolean;
    } | null;
  },
  formData: FormData
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null, internalCode: null, mapping: null };
  }

  const internalCode = String(formData.get("internalCode") ?? "").trim();
  const internalName = String(formData.get("internalName") ?? "").trim();
  const qbItemId = String(formData.get("qbItemId") ?? "").trim();

  if (!internalCode || !internalName || !qbItemId) {
    return {
      error: "QuickBooks item mapping is missing required values.",
      success: null,
      internalCode,
      mapping: null
    };
  }

  try {
    const mapping = await saveQuickBooksItemMappingForCode(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      { internalCode, internalName, qbItemId }
    );
    revalidateCatalogPaths();
    return {
      error: null,
      success: `${internalName} mapped successfully.`,
      internalCode,
      mapping: {
        qbItemId: mapping.qbItemId,
        qbItemName: mapping.qbItemName,
        qbItemType: mapping.qbItemType,
        matchSource: mapping.matchSource,
        qbActive: mapping.qbActive
      }
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to save QuickBooks item mapping.",
      success: null,
      internalCode,
      mapping: null
    };
  }
}

export async function clearQuickBooksItemMappingInlineAction(
  _: { error: string | null; success: string | null; internalCode?: string | null },
  formData: FormData
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return { error: "Unauthorized", success: null, internalCode: null };
  }

  const internalCode = String(formData.get("internalCode") ?? "").trim();
  if (!internalCode) {
    return { error: "QuickBooks item mapping code is missing.", success: null, internalCode: null };
  }

  try {
    await clearQuickBooksItemMappingForCode(
      { userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId },
      internalCode
    );
    revalidateCatalogPaths();
    return { error: null, success: `${internalCode} mapping cleared.`, internalCode };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to clear QuickBooks item mapping.",
      success: null,
      internalCode
    };
  }
}

