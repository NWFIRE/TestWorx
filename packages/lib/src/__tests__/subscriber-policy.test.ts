import { describe, expect, it } from "vitest";
import { subscriptionAccess, supportPagePath, supportTicketNumber } from "../subscriber-policy";

const now = new Date("2026-11-25T12:00:00Z");
const tenant = { subscriptionManaged: true, stripeSubscriptionStatus: "active", stripeCurrentPeriodEndsAt: new Date("2026-12-25T12:00:00Z"), paymentFailedAt: null };
describe("subscriber access policy", () => {
  it("does not activate subscription enforcement for existing businesses", () => expect(subscriptionAccess({ ...tenant, subscriptionManaged: false, stripeSubscriptionStatus: "canceled" }, now)).toBe(true));
  it("honors paid access and rejects an expired period", () => {
    expect(subscriptionAccess(tenant, now)).toBe(true);
    expect(subscriptionAccess({ ...tenant, stripeCurrentPeriodEndsAt: now }, now)).toBe(false);
  });
  it("bounds past-due access to the original failure grace period", () => {
    const failed = { ...tenant, stripeSubscriptionStatus: "past_due", paymentFailedAt: new Date("2026-11-20T12:00:00Z") };
    expect(subscriptionAccess(failed, now, 7)).toBe(true);
    expect(subscriptionAccess(failed, now, 3)).toBe(false);
    expect(subscriptionAccess({ ...failed, paymentFailedAt: null }, now)).toBe(false);
    expect(subscriptionAccess(failed, now, NaN)).toBe(false);
  });
  it("requires confirmed activation and stops canceled subscriptions", () => {
    for (const status of [null, "incomplete", "unpaid", "canceled", "incomplete_expired"]) expect(subscriptionAccess({ ...tenant, stripeSubscriptionStatus: status }, now)).toBe(false);
  });
  it("keeps diagnostic page references free of query tokens", () => {
    expect(supportPagePath("/app/tech/reports/123?token=secret#details")).toBe("/app/tech/reports/123");
    expect(supportPagePath("https://attacker.test")).toBe("/app");
    expect(supportPagePath(undefined)).toBe("/app");
    expect(supportTicketNumber(12)).toBe("SUP-000012");
  });
});
