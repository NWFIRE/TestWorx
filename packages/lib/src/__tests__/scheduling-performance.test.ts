import { describe, expect, it } from "vitest";
import { filterSubsetDuplicateOperationalInspections } from "../scheduling";

const task = (inspectionType: "fire_alarm" | "kitchen_suppression", seriesId?: string) => ({ inspectionType, dueMonth: "2026-11", recurrence: seriesId ? { seriesId } : null });
const row = (id: string, tasks = [task("fire_alarm")], overrides = {}) => ({ id, customerCompanyId: "customer-a", siteId: "site-a", scheduledStart: new Date("2026-11-24T15:00:00Z"), tasks, ...overrides });

describe("scope-indexed operational duplicate detection", () => {
  it("preserves the first exact duplicate and keeps unrelated sites and customers", () => {
    const rows = [row("first"), row("duplicate"), row("other-site", undefined, { siteId: "site-b" }), row("other-customer", undefined, { customerCompanyId: "customer-b" })];
    expect(filterSubsetDuplicateOperationalInspections(rows).map(item => item.id)).toEqual(["first", "other-site", "other-customer"]);
  });
  it("preserves the existing strict-subset and recurrence-source rules", () => {
    expect(filterSubsetDuplicateOperationalInspections([row("subset"), row("full", [task("fire_alarm"), task("kitchen_suppression")])]).map(item => item.id)).toEqual(["full"]);
    expect(filterSubsetDuplicateOperationalInspections([
      row("original", [task("fire_alarm", "series-a")]),
      row("repeat", [task("fire_alarm", "series-a")], { scheduledStart: new Date("2026-11-25T15:00:00Z") })
    ]).map(item => item.id)).toEqual(["original"]);
  });
  it("retains separate months, differing start times, and repeated equipment quantities", () => {
    const rows = [row("november"), row("december", [{ ...task("fire_alarm"), dueMonth: "2026-12" }], { scheduledStart: new Date("2026-12-24T15:00:00Z") }), row("different-time", undefined, { scheduledStart: new Date("2026-11-25T15:00:00Z") })];
    expect(filterSubsetDuplicateOperationalInspections(rows)).toEqual(rows);
    expect(filterSubsetDuplicateOperationalInspections([row("one"), row("two", [task("fire_alarm"), task("fire_alarm")])]).map(item => item.id)).toEqual(["two"]);
  });
  it("calculates scope once per row instead of comparing every unrelated customer", () => {
    let reads = 0;
    const rows = Array.from({ length: 3000 }, (_, i) => ({ ...row(String(i)), customerCompanyId: `customer-${i}`, get scheduledStart() { reads++; return new Date("2026-11-24T15:00:00Z"); } }));
    expect(filterSubsetDuplicateOperationalInspections(rows)).toHaveLength(3000);
    expect(reads).toBe(3000);
  });
});
