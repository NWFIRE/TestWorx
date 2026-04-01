"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  acceptAccountInvitation,
  allowanceKeys,
  completePasswordReset,
  createAccountInvitation,
  createPasswordResetRequest,
  removeUserFromWorkspace,
  resendAccountInvitation,
  revokeAccountInvitation,
  setUserActiveState,
  updateInviteAllowances,
  updateUserAllowances
} from "@testworx/lib";

type ActionState = {
  error: string | null;
  success: string | null;
  inviteUrl?: string | null;
  resetUrl?: string | null;
};

const initialActionState: ActionState = {
  error: null,
  success: null,
  inviteUrl: null,
  resetUrl: null
};

function readAllowanceValues(formData: FormData) {
  return Object.fromEntries(allowanceKeys.map((key) => [key, formData.get(key) === "on"]));
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

export async function createTeamInviteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const result = await createAccountInvitation(actor, {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      role: String(formData.get("role") ?? "technician") as "tenant_admin" | "office_admin" | "technician" | "customer_user",
      allowances: readAllowanceValues(formData)
    });
    revalidatePath("/app/admin/team");
    return { error: null, success: "Invite created.", inviteUrl: result.inviteUrl, resetUrl: null };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to create invite." };
  }
}

export async function createCustomerInviteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const result = await createAccountInvitation(actor, {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      role: "customer_user",
      customerCompanyId: String(formData.get("customerCompanyId") ?? ""),
      allowances: readAllowanceValues(formData)
    });
    revalidatePath("/app/admin/team");
    return { error: null, success: "Customer portal invite created.", inviteUrl: result.inviteUrl, resetUrl: null };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to create portal invite." };
  }
}

export async function resendInviteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const result = await resendAccountInvitation(actor, String(formData.get("inviteId") ?? ""));
    revalidatePath("/app/admin/team");
    return { error: null, success: "Invite resent.", inviteUrl: result.inviteUrl, resetUrl: null };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to resend invite." };
  }
}

export async function revokeInviteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await revokeAccountInvitation(actor, String(formData.get("inviteId") ?? ""));
    revalidatePath("/app/admin/team");
    return { ...initialActionState, success: "Invite revoked." };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to revoke invite." };
  }
}

export async function updateUserAllowancesAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await updateUserAllowances(actor, {
      userId: String(formData.get("userId") ?? ""),
      allowances: readAllowanceValues(formData)
    });
    revalidatePath("/app/admin/team");
    return { ...initialActionState, success: "Allowances updated." };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to update allowances." };
  }
}

export async function updateInviteAllowancesAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await updateInviteAllowances(actor, {
      inviteId: String(formData.get("inviteId") ?? ""),
      allowances: readAllowanceValues(formData)
    });
    revalidatePath("/app/admin/team");
    return { ...initialActionState, success: "Invite allowances updated." };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to update invite allowances." };
  }
}

export async function setUserActiveStateAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await setUserActiveState(
      actor,
      String(formData.get("userId") ?? ""),
      String(formData.get("nextState") ?? "") === "active"
    );
    revalidatePath("/app/admin/team");
    return { ...initialActionState, success: "Account status updated." };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to update account status." };
  }
}

export async function removeUserAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await removeUserFromWorkspace(actor, String(formData.get("userId") ?? ""));
    revalidatePath("/app/admin/team");
    return { ...initialActionState, success: "Account removed." };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to remove account." };
  }
}

export async function issuePasswordResetAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const result = await createPasswordResetRequest(actor, String(formData.get("userId") ?? ""));
    revalidatePath("/app/admin/team");
    return { error: null, success: "Password reset link created.", inviteUrl: null, resetUrl: result.resetUrl };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to issue reset." };
  }
}

export async function acceptInvitePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await acceptAccountInvitation({
      token: String(formData.get("token") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? "")
    });

    return { ...initialActionState, success: "Your account is ready. You can sign in now." };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to accept invite." };
  }
}

export async function completePasswordResetAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await completePasswordReset({
      token: String(formData.get("token") ?? ""),
      password: String(formData.get("password") ?? "")
    });

    return { ...initialActionState, success: "Password updated. You can sign in now." };
  } catch (error) {
    return { ...initialActionState, error: error instanceof Error ? error.message : "Unable to reset password." };
  }
}

export { initialActionState };
