export type TeamActionState = {
  error: string | null;
  success: string | null;
  inviteUrl?: string | null;
  resetUrl?: string | null;
};

export const initialTeamActionState: TeamActionState = {
  error: null,
  success: null,
  inviteUrl: null,
  resetUrl: null
};
