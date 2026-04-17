"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  archiveManual,
  createManual,
  favoriteManual,
  manualSearchableTextStatuses,
  parseManualTags,
  setManualOfflineState,
  unfavoriteManual,
  updateManual,
  uploadManualFile
} from "@testworx/lib/server/index";

type ManualActionState = {
  error: string | null;
  success: string | null;
  redirectTo: string | null;
};

export const initialManualActionState: ManualActionState = {
  error: null,
  success: null,
  redirectTo: null
};

function readBooleanField(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function readSearchableTextStatus(formData: FormData) {
  const value = String(formData.get("searchableTextStatus") ?? "").trim();
  return manualSearchableTextStatuses.includes(value as (typeof manualSearchableTextStatuses)[number])
    ? (value as (typeof manualSearchableTextStatuses)[number])
    : undefined;
}

async function requireActor() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    throw new Error("Unauthorized");
  }

  return {
    userId: session.user.id,
    role: session.user.role,
    tenantId: session.user.tenantId
  };
}

async function maybeUploadManualFile(actor: Awaited<ReturnType<typeof requireActor>>, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  const uploaded = await uploadManualFile(actor, {
    fileName: file.name,
    mimeType: file.type || "application/pdf",
    bytes: new Uint8Array(await file.arrayBuffer())
  });

  return uploaded.id;
}

function revalidateManualPaths(manualId?: string | null) {
  revalidatePath("/app/manuals");
  revalidatePath("/app/admin/manuals");
  if (manualId) {
    revalidatePath(`/app/manuals/${manualId}`);
    revalidatePath(`/app/admin/manuals/${manualId}`);
  }
}

export async function toggleManualFavoriteAction(formData: FormData) {
  const actor = await requireActor();
  const manualId = String(formData.get("manualId") ?? "");
  const favorite = formData.get("favorite") === "true";

  if (!manualId) {
    throw new Error("Manual id is required.");
  }

  if (favorite) {
    await favoriteManual(actor, manualId);
  } else {
    await unfavoriteManual(actor, manualId);
  }

  revalidateManualPaths(manualId);
}

export async function toggleManualOfflineAction(formData: FormData) {
  const actor = await requireActor();
  const manualId = String(formData.get("manualId") ?? "");
  const saveOffline = formData.get("saveOffline") === "true";

  if (!manualId) {
    throw new Error("Manual id is required.");
  }

  await setManualOfflineState(actor, manualId, saveOffline);
  revalidateManualPaths(manualId);
}

export async function createManualAction(_: ManualActionState, formData: FormData): Promise<ManualActionState> {
  try {
    const actor = await requireActor();
    const uploadedFileId = await maybeUploadManualFile(actor, formData);
    const manual = await createManual(actor, {
      title: String(formData.get("title") ?? ""),
      manufacturer: String(formData.get("manufacturer") ?? ""),
      systemCategory: String(formData.get("systemCategory") ?? "") as "wet_chemical" | "industrial_dry_chemical",
      productFamily: String(formData.get("productFamily") ?? ""),
      model: String(formData.get("model") ?? ""),
      documentType: String(formData.get("documentType") ?? "") as never,
      revisionLabel: String(formData.get("revisionLabel") ?? ""),
      revisionDate: String(formData.get("revisionDate") ?? ""),
      description: String(formData.get("description") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      tags: parseManualTags(String(formData.get("tags") ?? "")),
      fileId: uploadedFileId ?? String(formData.get("fileId") ?? ""),
      source: String(formData.get("source") ?? ""),
      isActive: readBooleanField(formData, "isActive"),
      isOfflineEligible: readBooleanField(formData, "isOfflineEligible"),
      supersedesManualId: String(formData.get("supersedesManualId") ?? ""),
      searchableText: String(formData.get("searchableText") ?? ""),
      searchableTextStatus: readSearchableTextStatus(formData)
    });

    revalidateManualPaths(manual.id);
    return {
      error: null,
      success: "Manual created.",
      redirectTo: `/app/admin/manuals/${manual.id}`
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create manual.",
      success: null,
      redirectTo: null
    };
  }
}

export async function updateManualAction(_: ManualActionState, formData: FormData): Promise<ManualActionState> {
  const manualId = String(formData.get("manualId") ?? "");
  if (!manualId) {
    return { error: "Manual id is required.", success: null, redirectTo: null };
  }

  try {
    const actor = await requireActor();
    const uploadedFileId = await maybeUploadManualFile(actor, formData);
    await updateManual(actor, manualId, {
      title: String(formData.get("title") ?? ""),
      manufacturer: String(formData.get("manufacturer") ?? ""),
      systemCategory: String(formData.get("systemCategory") ?? "") as "wet_chemical" | "industrial_dry_chemical",
      productFamily: String(formData.get("productFamily") ?? ""),
      model: String(formData.get("model") ?? ""),
      documentType: String(formData.get("documentType") ?? "") as never,
      revisionLabel: String(formData.get("revisionLabel") ?? ""),
      revisionDate: String(formData.get("revisionDate") ?? ""),
      description: String(formData.get("description") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      tags: parseManualTags(String(formData.get("tags") ?? "")),
      fileId: uploadedFileId ?? undefined,
      source: String(formData.get("source") ?? ""),
      isActive: readBooleanField(formData, "isActive"),
      isOfflineEligible: readBooleanField(formData, "isOfflineEligible"),
      supersedesManualId: String(formData.get("supersedesManualId") ?? ""),
      searchableText: String(formData.get("searchableText") ?? ""),
      searchableTextStatus: readSearchableTextStatus(formData)
    });

    revalidateManualPaths(manualId);
    return {
      error: null,
      success: "Manual updated.",
      redirectTo: `/app/admin/manuals/${manualId}`
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update manual.",
      success: null,
      redirectTo: null
    };
  }
}

export async function archiveManualAction(formData: FormData) {
  const actor = await requireActor();
  const manualId = String(formData.get("manualId") ?? "");
  if (!manualId) {
    throw new Error("Manual id is required.");
  }

  await archiveManual(actor, manualId);
  revalidateManualPaths(manualId);
}
