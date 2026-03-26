import { describe, expect, it } from "vitest";
import { InspectionStatus } from "@prisma/client";

import {
  defaultScheduledStartForMonth,
  genericInspectionSiteOptionValue,
  getDefaultInspectionRecurrenceFrequency,
  withInspectionTaskDisplayLabels,
  getInspectionDisplayStatus,
  isInspectionPastDue,
  nextDueFrom,
  parseCreateInspectionFormData,
  pickEarliestNextDueAt,
  scheduleInspectionSchema
} from "../scheduling";

describe("schedule creation parsing", () => {
  it("requires at least one inspection type", () => {
    const formData = new FormData();
    formData.set("customerCompanyId", "customer_1");
    formData.set("siteId", "site_1");
    formData.set("scheduledStart", "2026-03-15T09:00:00.000Z");

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(false);
  });

  it("normalizes missing customer and site values before validation", () => {
    const formData = new FormData();
    formData.set("scheduledStart", "2026-03-15T09:00:00.000Z");
    formData.set("type:fire_extinguisher", "true");
    formData.set("frequency:fire_extinguisher", "ANNUAL");

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Select a customer before creating the inspection.");
    }
  });

  it("returns a clear message when the site is missing", () => {
    const formData = new FormData();
    formData.set("customerCompanyId", "customer_1");
    formData.set("scheduledStart", "2026-03-15T09:00:00.000Z");
    formData.set("type:fire_extinguisher", "true");
    formData.set("frequency:fire_extinguisher", "ANNUAL");

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.siteId).toBe(genericInspectionSiteOptionValue);
    }
  });

  it("accepts duplicate inspection types in a visit payload", () => {
    const result = scheduleInspectionSchema.safeParse({
      customerCompanyId: "customer_1",
      siteId: "site_1",
      scheduledStart: new Date("2026-03-15T09:00:00.000Z"),
      scheduledEnd: null,
      assignedTechnicianIds: [],
      status: "scheduled",
      notes: "Bring replacement tags.",
      tasks: [
        { inspectionType: "fire_extinguisher", frequency: "ANNUAL" },
        { inspectionType: "fire_extinguisher", frequency: "ANNUAL" }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("rejects an inspection end time before the start time", () => {
    const formData = new FormData();
    formData.set("customerCompanyId", "customer_1");
    formData.set("siteId", "site_1");
    formData.set("scheduledStart", "2026-03-15T09:00:00.000Z");
    formData.set("scheduledEnd", "2026-03-15T08:30:00.000Z");
    formData.set("type:fire_extinguisher", "true");
    formData.set("frequency:fire_extinguisher", "ANNUAL");

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(false);
  });

  it("defaults scheduled start to the first of the selected month when no explicit start is provided", () => {
    const formData = new FormData();
    formData.set("customerCompanyId", "customer_1");
    formData.set("siteId", "site_1");
    formData.set("inspectionMonth", "2026-03");
    formData.set("type:fire_extinguisher", "true");
    formData.set("frequency:fire_extinguisher", "ANNUAL");

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduledStart.getFullYear()).toBe(2026);
      expect(result.data.scheduledStart.getMonth()).toBe(2);
      expect(result.data.scheduledStart.getDate()).toBe(1);
      expect(result.data.scheduledStart.getHours()).toBe(9);
      expect(result.data.scheduledStart.getMinutes()).toBe(0);
    }
  });

  it("preserves a manually entered scheduled start even when an inspection month is present", () => {
    const formData = new FormData();
    formData.set("customerCompanyId", "customer_1");
    formData.set("siteId", "site_1");
    formData.set("inspectionMonth", "2026-03");
    formData.set("scheduledStart", "2026-03-12T13:30");
    formData.set("type:fire_extinguisher", "true");
    formData.set("frequency:fire_extinguisher", "ANNUAL");

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduledStart.getMonth()).toBe(2);
      expect(result.data.scheduledStart.getDate()).toBe(12);
      expect(result.data.scheduledStart.getHours()).toBe(13);
      expect(result.data.scheduledStart.getMinutes()).toBe(30);
    }
  });

  it("supports assigning multiple technicians from the scheduling form", () => {
    const formData = new FormData();
    formData.set("customerCompanyId", "customer_1");
    formData.set("siteId", "site_1");
    formData.set("scheduledStart", "2026-03-12T13:30");
    formData.append("assignedTechnicianIds", "tech_1");
    formData.append("assignedTechnicianIds", "tech_2");
    formData.set("type:fire_extinguisher", "true");
    formData.set("frequency:fire_extinguisher", "ANNUAL");

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignedTechnicianIds).toEqual(["tech_1", "tech_2"]);
    }
  });

  it("defaults newly created inspections to to be completed when no explicit status is provided", () => {
    const formData = new FormData();
    formData.set("customerCompanyId", "customer_1");
    formData.set("siteId", "site_1");
    formData.set("inspectionMonth", "2026-03");
    formData.set("type:fire_extinguisher", "true");
    formData.set("frequency:fire_extinguisher", "ANNUAL");

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe(InspectionStatus.to_be_completed);
    }
  });
});

describe("recurrence logic", () => {
  it("adds numbered display labels when an inspection has duplicate report types", () => {
    expect(withInspectionTaskDisplayLabels([
      { id: "task_1", inspectionType: "fire_alarm" },
      { id: "task_2", inspectionType: "fire_alarm" },
      { id: "task_3", inspectionType: "fire_extinguisher" }
    ])).toEqual([
      { id: "task_1", inspectionType: "fire_alarm", displayLabel: "Fire alarm 1" },
      { id: "task_2", inspectionType: "fire_alarm", displayLabel: "Fire alarm 2" },
      { id: "task_3", inspectionType: "fire_extinguisher", displayLabel: "Fire extinguisher" }
    ]);
  });

  it("defaults kitchen and industrial suppression to semi-annual recurrence", () => {
    expect(getDefaultInspectionRecurrenceFrequency("kitchen_suppression")).toBe("SEMI_ANNUAL");
    expect(getDefaultInspectionRecurrenceFrequency("industrial_suppression")).toBe("SEMI_ANNUAL");
  });

  it("computes the next due date for quarterly recurrence", () => {
    const start = new Date("2026-03-15T09:00:00.000Z");
    expect(nextDueFrom(start, "QUARTERLY")?.toISOString()).toBe("2026-06-15T09:00:00.000Z");
  });

  it("returns null for one-time visits", () => {
    const start = new Date("2026-03-15T09:00:00.000Z");
    expect(nextDueFrom(start, "ONCE")).toBeNull();
  });

  it("picks the earliest valid due date from a task list", () => {
    const earliest = pickEarliestNextDueAt([
      null,
      new Date("2026-07-01T09:00:00.000Z"),
      undefined,
      new Date("2026-05-01T09:00:00.000Z")
    ]);

    expect(earliest?.toISOString()).toBe("2026-05-01T09:00:00.000Z");
  });
});

describe("month defaults and past-due status", () => {
  it("builds the first day of the month while preserving time if present", () => {
    expect(defaultScheduledStartForMonth("2026-03", "2026-03-19T14:45")).toBe("2026-03-01T14:45");
  });

  it("marks incomplete inspections as past due after month end", () => {
    expect(
      isInspectionPastDue({
        status: InspectionStatus.scheduled,
        scheduledStart: new Date("2026-03-01T09:00:00.000Z"),
        now: new Date("2026-04-01T06:00:00.000Z")
      })
    ).toBe(true);
  });

  it("does not mark completed inspections as past due", () => {
    expect(
      isInspectionPastDue({
        status: InspectionStatus.completed,
        scheduledStart: new Date("2026-03-01T09:00:00.000Z"),
        now: new Date("2026-04-01T00:00:00.000Z")
      })
    ).toBe(false);
  });

  it("keeps current-month incomplete inspections out of past due status", () => {
    expect(
      getInspectionDisplayStatus({
        status: InspectionStatus.scheduled,
        scheduledStart: new Date("2026-03-01T09:00:00.000Z"),
        now: new Date("2026-03-20T00:00:00.000Z")
      })
    ).toBe("scheduled");
  });
});
