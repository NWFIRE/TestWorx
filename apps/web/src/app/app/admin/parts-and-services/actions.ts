"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  createQuickBooksCatalogItem,
  importQuickBooksCatalogItems,
  quickBooksCatalogItemInputSchema,
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

