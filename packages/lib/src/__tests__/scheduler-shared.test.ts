import { describe, expect, it } from "vitest";
import { fieldProgress, localDateTime, resizedScheduleEnd, scheduleLanes, scheduleDurationHours, scheduleEndForDuration, schedulerInstant, schedulerRange, shiftSchedulerDate, type SchedulerJob } from "../scheduler-shared";
const job: SchedulerJob = { id: "one", customer: "Customer", site: "Site", address: "", types: [], technicianIds: ["a"], scheduledStart: "2026-11-19T15:00:00Z", scheduledEnd: "2026-11-19T16:00:00Z", updatedAt: "2026-11-19T12:00:00Z", status: "to_be_completed", sessions: [] };
describe("scheduler dates and layout", () => {
  it("stacks readable short cards without changing their actual time intervals", () => {
    const start = +new Date("2026-11-19T06:00:00Z"), end = start + 86400000;
    const short = {...job,scheduledEnd:"2026-11-19T15:30:00Z"};
    const next = {...short,id:"next",scheduledStart:"2026-11-19T15:30:00Z",scheduledEnd:"2026-11-19T16:00:00Z"};
    expect(scheduleLanes([short,next],start,end,20).map(item=>item.lane)).toEqual([0,1]);
    expect(scheduleLanes([short,next],start,end).map(item=>item.lane)).toEqual([0,0]);
  });
  it("calculates duration ends across midnight and DST using company time", () => {
    expect(scheduleEndForDuration("2026-11-24T23:30",1.5,"America/Chicago")).toBe("2026-11-25T01:00");
    expect(scheduleEndForDuration("2026-03-08T01:30",1.5,"America/Chicago")).toBe("2026-03-08T04:00");
    expect(scheduleDurationHours("2026-03-08T01:30","2026-03-08T04:00","America/Chicago")).toBe("1.5");
    expect(scheduleDurationHours("2026-11-24T09:00","2026-11-24T09:45","America/Chicago")).toBe("0.75");
    expect(scheduleDurationHours("2026-11-24T09:00","","America/Chicago")).toBe("");
    expect(scheduleEndForDuration("2026-11-24T09:00",0.5)).toBe("2026-11-24T09:30");
    const custom = scheduleDurationHours("2026-11-24T09:00","2026-11-24T09:53","America/Chicago");
    expect(scheduleEndForDuration("2026-11-24T09:00",Number(custom),"America/Chicago")).toBe("2026-11-24T09:53");
  });
  it.each(["2026-11-19T15:00:00Z", "2026-11-19T17:45:00Z"])("positions a start-only visit at its saved time %s without changing data", scheduledStart => {
    const startOnly = {...job, scheduledStart, scheduledEnd:null};
    const range = schedulerRange("2026-11-19", "day", "America/Chicago");
    const lanes = scheduleLanes([startOnly], +range.start, +range.end);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].left).toBe((+new Date(scheduledStart) - +range.start) / (+range.end - +range.start) * 100);
    expect(lanes[0].job.scheduledEnd).toBeNull();
    expect(startOnly.scheduledStart).toBe(scheduledStart);
    expect(scheduleLanes([startOnly], +range.end, +range.end + 86400000)).toEqual([]);
  });
  it("keeps start-only markers separate from overlapping appointments", () => {
    const range = schedulerRange("2026-11-19", "day", "America/Chicago");
    const lanes = scheduleLanes([job, {...job,id:"start-only",scheduledEnd:null}], +range.start, +range.end);
    expect(lanes.map(lane => lane.lane)).toEqual([0,1]);
  });
  it("snaps resized ends to quarters and bounds duration", () => {
    expect(resizedScheduleEnd(job.scheduledStart, job.scheduledEnd!, 22)).toBe("2026-11-19T16:15:00.000Z");
    expect(resizedScheduleEnd(job.scheduledStart, job.scheduledEnd!, -300)).toBe("2026-11-19T15:15:00.000Z");
    expect(resizedScheduleEnd(job.scheduledStart, job.scheduledEnd!, 20000)).toBe("2026-11-26T15:00:00.000Z");
  });
  it("uses tenant time rather than browser time", () => {
    expect(schedulerInstant("2026-11-19T09:00", "America/Chicago").toISOString()).toBe(new Date(job.scheduledStart).toISOString());
    expect(localDateTime(job.scheduledStart, "America/Chicago")).toBe("2026-11-19T09:00");
  });
  it.each(["2026-03-08T02:30", "2026-11-01T01:30"])("rejects ambiguous/nonexistent time %s", (time) => {
    expect(() => schedulerInstant(time, "America/Chicago")).toThrow("daylight-saving");
  });
  it.each([["2026-03-08", 23], ["2026-11-01", 25]] as const)("sizes DST day %s correctly", (day, hours) => {
    const range = schedulerRange(day, "day", "America/Chicago");
    expect((+range.end - +range.start) / 3600000).toBe(hours);
  });
  it("starts weeks Monday and crosses year boundaries", () => {
    expect(schedulerRange("2027-01-01", "week", "America/Chicago").days).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
    expect(() => shiftSchedulerDate("2026-02-30", 0)).toThrow();
  });
  it("stacks overlaps and reuses lanes for adjacent visits", () => {
    const lanes = scheduleLanes([job, { ...job, id: "two" }, { ...job, id: "three", scheduledStart: job.scheduledEnd!, scheduledEnd: "2026-11-19T17:00:00Z" }], +new Date(job.scheduledStart), +new Date("2026-11-19T18:00:00Z"));
    expect(lanes.map((l) => l.lane)).toEqual([0, 1, 0]);
    expect(lanes[0]?.width).toBeCloseTo(100 / 3);
  });
  it("never completes a visit merely because planned end passed", () => {
    const now = +new Date("2026-11-19T16:15:00Z");
    expect(fieldProgress(job, now)).toBe("Not started");
    expect(fieldProgress({ ...job, sessions: [{ technicianId: "a", startedAt: job.scheduledStart, endedAt: null, endReason: null }] }, now)).toBe("In progress · 15 min over");
  });
  it("requires all assigned technicians to finish for aggregate progress", () => {
    const work = { ...job, technicianIds: ["a", "b"], sessions: [{ technicianId: "a", startedAt: job.scheduledStart, endedAt: job.scheduledEnd, endReason: "field_finished" }] };
    expect(fieldProgress(work, Date.now())).toBe("1 of 2 technicians finished");
    expect(fieldProgress(work, Date.now(), "a")).toBe("Work finished");
    expect(fieldProgress(work, Date.now(), "b")).toBe("Not started");
  });
});
