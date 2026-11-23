import { describe, expect, it } from "vitest";
import { technicianHomeSchedule } from "../home-schedule";

const now = new Date("2026-11-23T18:00:00Z");
const job = (id: string, scheduledStart: string, status = "scheduled") => ({ id, scheduledStart, status });

describe("Home schedule", () => {
  it("uses the company's day rather than UTC and excludes other days and canceled jobs", () => {
    const rows = [job("yesterday", "2026-11-23T04:00:00Z"), job("late", "2026-11-24T04:00:00Z"), job("tomorrow", "2026-11-24T12:00:00Z"), job("cancelled", "2026-11-23T20:00:00Z", "cancelled")];
    expect(technicianHomeSchedule(rows, "America/Chicago", now).map(row => row.id)).toEqual(["late"]);
  });
  it("puts a current job ahead of the next stop, without mutating source records", () => {
    const rows = [job("next", "2026-11-23T20:00:00Z"), job("current", "2026-11-23T16:00:00Z", "in_progress"), job("old", "2026-11-23T15:00:00Z")];
    const before = JSON.stringify(rows);
    expect(technicianHomeSchedule(rows, "America/Chicago", now).map(row => row.id)).toEqual(["current", "old", "next"]);
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("promotes the next job and keeps the rest chronological, without duplicates", () => {
    const old = job("old", "2026-11-23T15:00:00Z");
    expect(technicianHomeSchedule([old, job("later", "2026-11-23T22:00:00Z"), job("next", "2026-11-23T20:00:00Z"), old], "America/Chicago", now).map(row => row.id)).toEqual(["next", "old", "later"]);
  });
  it("handles empty days and invalid saved dates", () => {
    expect(technicianHomeSchedule([], "America/Chicago", now)).toEqual([]);
    expect(technicianHomeSchedule([job("bad", "invalid")], "America/Chicago", now)).toEqual([]);
  });
  it("keeps an actually running overnight job first, but not a paused prior job", () => {
    const running = { ...job("running", "2026-11-22T22:00:00Z", "in_progress"), jobTimeSessions: [{ endedAt: null }] };
    const paused = { ...job("paused", "2026-11-22T21:00:00Z", "in_progress"), jobTimeSessions: [{ endedAt: now }] };
    expect(technicianHomeSchedule([paused, running, job("next", "2026-11-23T20:00:00Z")], "America/Chicago", now).map(row => row.id)).toEqual(["running", "next"]);
  });
});
