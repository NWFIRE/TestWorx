export function subscriberFeaturesEnabled() {
  return process.env.SUBSCRIBER_FEATURES_ENABLED === "true";
}

export function subscriptionAccess(tenant: {
  subscriptionManaged: boolean; stripeSubscriptionStatus: string | null;
  stripeCurrentPeriodEndsAt: Date | null; paymentFailedAt: Date | null;
}, now = new Date(), graceDays = Number(process.env.SUBSCRIPTION_GRACE_DAYS ?? "7")) {
  if (!tenant.subscriptionManaged) return true;
  const status = tenant.stripeSubscriptionStatus;
  if (["active", "trialing"].includes(status ?? "")) {
    return !!tenant.stripeCurrentPeriodEndsAt && tenant.stripeCurrentPeriodEndsAt > now;
  }
  if (status === "past_due" && tenant.paymentFailedAt) {
    const days = Number.isFinite(graceDays) ? Math.max(0, Math.min(30, graceDays)) : 0;
    return now.getTime() < tenant.paymentFailedAt.getTime() + days * 86400000;
  }
  return false;
}

export function supportPagePath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/app/") || value.startsWith("//")) return "/app";
  return (value.split(/[?#]/)[0] ?? "/app").slice(0, 300);
}

export function supportTicketNumber(number: number) {
  return `SUP-${String(number).padStart(6, "0")}`;
}
