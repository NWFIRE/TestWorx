"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { ProfileUpdateError, updateOwnUserProfile } from "@testworx/lib/server/index";

export async function updateProfileAction(_state: { error: string | null; success: string | null }, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Please sign in again to update your profile.", success: null };
  try {
    await updateOwnUserProfile({ userId: session.user.id, tenantId: session.user.tenantId ?? null }, formData.get("name"));
    revalidatePath("/app", "layout");
    return { error: null, success: "Your profile has been updated." };
  } catch (error) {
    if (!(error instanceof ProfileUpdateError)) console.error("Profile update failed", error);
    return { error: error instanceof ProfileUpdateError ? error.message : "Unable to save your profile. Please try again.", success: null };
  }
}
