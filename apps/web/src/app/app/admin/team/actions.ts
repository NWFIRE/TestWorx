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
import { initialTeamActionState, type TeamActionState } from "./action-state";

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

export async function createTeamInviteAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
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
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to create invite." };
  }
}

export async function createCustomerInviteAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
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
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to create portal invite." };
  }
}

export async function resendInviteAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  try {
    const actor = await requireActor();
    const result = await resendAccountInvitation(actor, String(formData.get("inviteId") ?? ""));
    revalidatePath("/app/admin/team");
    return { error: null, success: "Invite resent.", inviteUrl: result.inviteUrl, resetUrl: null };
  } catch (error) {
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to resend invite." };
  }
}

export async function revokeInviteAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  try {
    const actor = await requireActor();
    await revokeAccountInvitation(actor, String(formData.get("inviteId") ?? ""));
    revalidatePath("/app/admin/team");
    return { ...initialTeamActionState, success: "Invite revoked." };
  } catch (error) {
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to revoke invite." };
  }
}

export async function updateUserAllowancesAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  try {
    const actor = await requireActor();
    await updateUserAllowances(actor, {
      userId: String(formData.get("userId") ?? ""),
      allowances: readAllowanceValues(formData)
    });
    revalidatePath("/app/admin/team");
    return { ...initialTeamActionState, success: "Allowances updated." };
  } catch (error) {
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to update allowances." };
  }
}

export async function updateInviteAllowancesAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  try {
    const actor = await requireActor();
    await updateInviteAllowances(actor, {
      inviteId: String(formData.get("inviteId") ?? ""),
      allowances: readAllowanceValues(formData)
    });
    revalidatePath("/app/admin/team");
    return { ...initialTeamActionState, success: "Invite allowances updated." };
  } catch (error) {
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to update invite allowances." };
  }
}

export async function setUserActiveStateAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  try {
    const actor = await requireActor();
    await setUserActiveState(
      actor,
      String(formData.get("userId") ?? ""),
      String(formData.get("nextState") ?? "") === "active"
    );
    revalidatePath("/app/admin/team");
    return { ...initialTeamActionState, success: "Account status updated." };
  } catch (error) {
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to update account status." };
  }
}

export async function removeUserAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  try {
    const actor = await requireActor();
    await removeUserFromWorkspace(actor, String(formData.get("userId") ?? ""));
    revalidatePath("/app/admin/team");
    return { ...initialTeamActionState, success: "Account removed." };
  } catch (error) {
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to remove account." };
  }
}

export async function issuePasswordResetAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  try {
    const actor = await requireActor();
    const result = await createPasswordResetRequest(actor, String(formData.get("userId") ?? ""));
    revalidatePath("/app/admin/team");
    return { error: null, success: "Password reset link created.", inviteUrl: null, resetUrl: result.resetUrl };
  } catch (error) {
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to issue reset." };
  }
}

export async function acceptInvitePasswordAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  try {
    await acceptAccountInvitation({
      token: String(formData.get("token") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? "")
    });

    return { ...initialTeamActionState, success: "Your account is ready. You can sign in now." };
  } catch (error) {
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to accept invite." };
  }
}

export async function completePasswordResetAction(_: TeamActionState, formData: FormData): Promise<TeamActionState> {
  try {
    await completePasswordReset({
      token: String(formData.get("token") ?? ""),
      password: String(formData.get("password") ?? "")
    });

    return { ...initialTeamActionState, success: "Password updated. You can sign in now." };
  } catch (error) {
    return { ...initialTeamActionState, error: error instanceof Error ? error.message : "Unable to reset password." };
  }
}
