export * from "./auth";
export * from "./account-email";
export * from "./billing";
export * from "./branding";
export * from "./customer-companies";
export * from "./customer-import";
export * from "./deficiency-service";
export * from "./env";
export * from "./inspection-billing";
export * from "./inspection-documents";
export * from "./permissions";
export * from "./pilot-readiness";
export * from "./quickbooks";
export * from "./report-calculations";
export * from "./report-config";
export * from "./report-engine";
export * from "./report-options";
export * from "./report-photo";
export * from "./report-service";
export * from "./scheduling";
export * from "./service-fees";
export * from "./storage";
export * from "./team-management-shared";

type TeamManagementModule = typeof import("./team-management");

export async function getTeamWorkspaceData(
  ...args: Parameters<TeamManagementModule["getTeamWorkspaceData"]>
): ReturnType<TeamManagementModule["getTeamWorkspaceData"]> {
  const mod = await import("./team-management");
  return mod.getTeamWorkspaceData(...args);
}

export async function createAccountInvitation(
  ...args: Parameters<TeamManagementModule["createAccountInvitation"]>
): ReturnType<TeamManagementModule["createAccountInvitation"]> {
  const mod = await import("./team-management");
  return mod.createAccountInvitation(...args);
}

export async function resendAccountInvitation(
  ...args: Parameters<TeamManagementModule["resendAccountInvitation"]>
): ReturnType<TeamManagementModule["resendAccountInvitation"]> {
  const mod = await import("./team-management");
  return mod.resendAccountInvitation(...args);
}

export async function revokeAccountInvitation(
  ...args: Parameters<TeamManagementModule["revokeAccountInvitation"]>
): ReturnType<TeamManagementModule["revokeAccountInvitation"]> {
  const mod = await import("./team-management");
  return mod.revokeAccountInvitation(...args);
}

export async function updateUserAllowances(
  ...args: Parameters<TeamManagementModule["updateUserAllowances"]>
): ReturnType<TeamManagementModule["updateUserAllowances"]> {
  const mod = await import("./team-management");
  return mod.updateUserAllowances(...args);
}

export async function updateInviteAllowances(
  ...args: Parameters<TeamManagementModule["updateInviteAllowances"]>
): ReturnType<TeamManagementModule["updateInviteAllowances"]> {
  const mod = await import("./team-management");
  return mod.updateInviteAllowances(...args);
}

export async function setUserActiveState(
  ...args: Parameters<TeamManagementModule["setUserActiveState"]>
): ReturnType<TeamManagementModule["setUserActiveState"]> {
  const mod = await import("./team-management");
  return mod.setUserActiveState(...args);
}

export async function removeUserFromWorkspace(
  ...args: Parameters<TeamManagementModule["removeUserFromWorkspace"]>
): ReturnType<TeamManagementModule["removeUserFromWorkspace"]> {
  const mod = await import("./team-management");
  return mod.removeUserFromWorkspace(...args);
}

export async function createPasswordResetRequest(
  ...args: Parameters<TeamManagementModule["createPasswordResetRequest"]>
): ReturnType<TeamManagementModule["createPasswordResetRequest"]> {
  const mod = await import("./team-management");
  return mod.createPasswordResetRequest(...args);
}

export async function searchTeamWorkspaceUsers(
  ...args: Parameters<TeamManagementModule["searchTeamWorkspaceUsers"]>
): ReturnType<TeamManagementModule["searchTeamWorkspaceUsers"]> {
  const mod = await import("./team-management");
  return mod.searchTeamWorkspaceUsers(...args);
}

export async function getInvitationAcceptanceDetails(
  ...args: Parameters<TeamManagementModule["getInvitationAcceptanceDetails"]>
): ReturnType<TeamManagementModule["getInvitationAcceptanceDetails"]> {
  const mod = await import("./team-management");
  return mod.getInvitationAcceptanceDetails(...args);
}

export async function acceptAccountInvitation(
  ...args: Parameters<TeamManagementModule["acceptAccountInvitation"]>
): ReturnType<TeamManagementModule["acceptAccountInvitation"]> {
  const mod = await import("./team-management");
  return mod.acceptAccountInvitation(...args);
}

export async function getPasswordResetDetails(
  ...args: Parameters<TeamManagementModule["getPasswordResetDetails"]>
): ReturnType<TeamManagementModule["getPasswordResetDetails"]> {
  const mod = await import("./team-management");
  return mod.getPasswordResetDetails(...args);
}

export async function completePasswordReset(
  ...args: Parameters<TeamManagementModule["completePasswordReset"]>
): ReturnType<TeamManagementModule["completePasswordReset"]> {
  const mod = await import("./team-management");
  return mod.completePasswordReset(...args);
}
