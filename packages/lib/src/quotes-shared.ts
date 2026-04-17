const quoteStatusValues = [
  "draft",
  "ready_to_send",
  "sent",
  "viewed",
  "approved",
  "declined",
  "converted",
  "expired",
  "cancelled"
] as const;

function formatQuoteStatusLabel(status: (typeof quoteStatusValues)[number]) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export const quoteStatusLabels = Object.fromEntries(
  quoteStatusValues.map((status) => [status, formatQuoteStatusLabel(status)])
) as Record<(typeof quoteStatusValues)[number], string>;

export const hostedQuoteStateLabels = {
  available: "Available",
  approved: "Approved",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
  unavailable: "Unavailable"
} as const;

export const quoteReminderTypeLabels = {
  sent_not_viewed_first: "Sent, not viewed",
  sent_not_viewed_second: "Sent, not viewed follow-up",
  viewed_pending_first: "Viewed, pending approval",
  viewed_pending_second: "Viewed, pending follow-up",
  expiring_soon: "Expiring soon",
  expired_follow_up: "Expired",
  manual_follow_up: "Manual follow-up"
} as const;

const quoteReminderStageLabels = {
  sent_not_viewed_first: "Awaiting first review",
  sent_not_viewed_second: "Second review follow-up scheduled",
  viewed_pending_first: "Viewed, awaiting approval",
  viewed_pending_second: "Approval follow-up scheduled",
  expiring_soon: "Expiring soon",
  expired_follow_up: "Expired follow-up scheduled",
  paused: "Paused",
  disabled: "Disabled",
  expired_closed: "Expired"
} as const;

function normalizeNullableString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

export function formatQuoteReminderStage(stage: string | null | undefined) {
  const normalized = normalizeNullableString(stage);
  if (!normalized) {
    return "\u2014";
  }

  return quoteReminderStageLabels[normalized as keyof typeof quoteReminderStageLabels]
    ?? normalized.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}
