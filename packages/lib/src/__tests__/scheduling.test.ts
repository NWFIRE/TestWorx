import { describe, expect, it } from "vitest";
import { InspectionClassification, InspectionStatus } from "@prisma/client";

import {
  defaultScheduledStartForMonth,
  formatCustomerFacingInspectionAddress,
  genericInspectionSiteOptionValue,
  getCustomerFacingSiteLabel,
  getInspectionDisplayLabels,
  isUserFacingSiteLabel,
  getDefaultInspectionRecurrenceFrequency,
  withInspectionTaskDisplayLabels,
  getInspectionDisplayStatus,
  isInspectionPastDue,
  nextDueFrom,
  parseCreateInspectionFormData,
  pickEarliestNextDueAt,
  scheduleInspectionSchema
} from "../scheduling";

function setCurrentVisitServiceLine(formData: FormData, overrides?: Partial<{
  inspectionType: string;
  frequency: string;
  assignedTechnicianId: string | null;
  dueMonth: string | null;
  dueDate: string | null;
  schedulingStatus: string;
  notes: string | null;
}>) {
  formData.set(
    "serviceLinesJson",
    JSON.stringify([
      {
        inspectionType: overrides?.inspectionType ?? "fire_extinguisher",
        frequency: overrides?.frequency ?? "ANNUAL",
        assignedTechnicianId: overrides?.assignedTechnicianId ?? "tech_1",
        dueMonth: overrides?.dueMonth ?? "2026-03",
        dueDate: overrides?.dueDate ?? "2026-03-15T00:00",
        schedulingStatus: overrides?.schedulingStatus ?? "scheduled_now",
        notes: overrides?.notes ?? null
      }
    ])
  );
}

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
    setCurrentVisitServiceLine(formData);

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
        {
          inspectionType: "fire_extinguisher",
          frequency: "ANNUAL",
          assignedTechnicianId: "tech_1",
          dueMonth: "2026-03",
          dueDate: new Date("2026-03-15T00:00:00.000Z"),
          schedulingStatus: "scheduled_now"
        },
        {
          inspectionType: "fire_extinguisher",
          frequency: "ANNUAL",
          assignedTechnicianId: "tech_1",
          dueMonth: "2026-09",
          dueDate: new Date("2026-09-15T00:00:00.000Z"),
          schedulingStatus: "scheduled_future"
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("accepts multiple identical report types scheduled on the same visit", () => {
    const result = scheduleInspectionSchema.safeParse({
      customerCompanyId: "customer_1",
      siteId: "site_1",
      scheduledStart: new Date("2026-03-15T09:00:00.000Z"),
      scheduledEnd: null,
      assignedTechnicianIds: [],
      status: "scheduled",
      notes: "Two separate hood systems on the same visit.",
      tasks: [
        {
          inspectionType: "kitchen_suppression",
          frequency: "SEMI_ANNUAL",
          assignedTechnicianId: "tech_1",
          dueMonth: "2026-03",
          dueDate: new Date("2026-03-15T00:00:00.000Z"),
          schedulingStatus: "scheduled_now",
          notes: "Main kitchen"
        },
        {
          inspectionType: "kitchen_suppression",
          frequency: "SEMI_ANNUAL",
          assignedTechnicianId: "tech_1",
          dueMonth: "2026-03",
          dueDate: new Date("2026-03-15T00:00:00.000Z"),
          schedulingStatus: "scheduled_now",
          notes: "Secondary kitchen"
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("allows current-visit service lines to remain unassigned for the shared technician queue", () => {
    const result = scheduleInspectionSchema.safeParse({
      customerCompanyId: "customer_1",
      siteId: "site_1",
      scheduledStart: new Date("2026-03-15T09:00:00.000Z"),
      scheduledEnd: null,
      assignedTechnicianIds: [],
      status: "scheduled",
      notes: "Leave this open for the first available technician.",
      tasks: [
        {
          inspectionType: "fire_extinguisher",
          frequency: "ANNUAL",
          assignedTechnicianId: null,
          dueMonth: "2026-03",
          dueDate: new Date("2026-03-15T00:00:00.000Z"),
          schedulingStatus: "scheduled_now"
        }
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
    setCurrentVisitServiceLine(formData);

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(false);
  });

  it("defaults scheduled start to the first of the selected month when no explicit start is provided", () => {
    const formData = new FormData();
    formData.set("customerCompanyId", "customer_1");
    formData.set("siteId", "site_1");
    formData.set("inspectionMonth", "2026-03");
    setCurrentVisitServiceLine(formData, {
      dueMonth: "2026-03",
      dueDate: "2026-03-01T00:00"
    });

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
    setCurrentVisitServiceLine(formData, {
      dueMonth: "2026-03",
      dueDate: "2026-03-12T00:00"
    });

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
    setCurrentVisitServiceLine(formData, {
      assignedTechnicianId: "tech_1"
    });

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
    setCurrentVisitServiceLine(formData, {
      dueMonth: "2026-03",
      dueDate: "2026-03-01T00:00"
    });

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe(InspectionStatus.to_be_completed);
    }
  });

  it("defaults inspection classification to standard and priority to off", () => {
    const formData = new FormData();
    formData.set("customerCompanyId", "customer_1");
    formData.set("siteId", "site_1");
    formData.set("inspectionMonth", "2026-03");
    setCurrentVisitServiceLine(formData, {
      dueMonth: "2026-03",
      dueDate: "2026-03-01T00:00"
    });

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inspectionClassification).toBe(InspectionClassification.standard);
      expect(result.data.isPriority).toBe(false);
    }
  });

  it("parses inspection classification and priority separately from status", () => {
    const formData = new FormData();
    formData.set("customerCompanyId", "customer_1");
    formData.set("siteId", "site_1");
    formData.set("inspectionMonth", "2026-03");
    formData.set("inspectionClassification", "emergency");
    formData.set("isPriority", "on");
    formData.set("status", "scheduled");
    setCurrentVisitServiceLine(formData, {
      dueMonth: "2026-03",
      dueDate: "2026-03-01T00:00"
    });

    const result = parseCreateInspectionFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inspectionClassification).toBe(InspectionClassification.emergency);
      expect(result.data.isPriority).toBe(true);
      expect(result.data.status).toBe(InspectionStatus.scheduled);
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

  it("prefers a custom display label over the generated duplicate label", () => {
    expect(withInspectionTaskDisplayLabels([
      { id: "task_1", inspectionType: "kitchen_suppression", customDisplayLabel: "Kitchen Hood Line A" },
      { id: "task_2", inspectionType: "kitchen_suppression" },
      { id: "task_3", inspectionType: "kitchen_suppression", customDisplayLabel: "Kitchen Hood Line C" }
    ])).toEqual([
      {
        id: "task_1",
        inspectionType: "kitchen_suppression",
        customDisplayLabel: "Kitchen Hood Line A",
        displayLabel: "Kitchen Hood Line A"
      },
      {
        id: "task_2",
        inspectionType: "kitchen_suppression",
        displayLabel: "Kitchen suppression 2"
      },
      {
        id: "task_3",
        inspectionType: "kitchen_suppression",
        customDisplayLabel: "Kitchen Hood Line C",
        displayLabel: "Kitchen Hood Line C"
      }
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

  it("shows customer-first labels for generic-site inspections", () => {
    expect(
      getInspectionDisplayLabels({
        siteName: "General / No Fixed Site",
        customerName: "NW Fire",
        customerServiceAddressLine1: "800 Harbor Dr",
        customerServiceCity: "Chicago",
        customerServiceState: "IL",
        customerServicePostalCode: "60611"
      })
    ).toEqual({
      isGenericSite: true,
      customerLabel: "NW Fire",
      locationLabel: "800 Harbor Dr, Chicago IL 60611",
      primaryTitle: "NW Fire",
      secondaryTitle: null
    });
  });

  it("keeps real site names as the primary label for normal inspections", () => {
    expect(
      getInspectionDisplayLabels({
        siteName: "Main Campus",
        customerName: "NW Fire"
      })
    ).toEqual({
      isGenericSite: false,
      customerLabel: "NW Fire",
      locationLabel: "Main Campus",
      primaryTitle: "Main Campus",
      secondaryTitle: "NW Fire"
    });
  });

  it("hides the generic site label from customer-facing displays", () => {
    expect(getCustomerFacingSiteLabel("General / No Fixed Site")).toBeNull();
    expect(getCustomerFacingSiteLabel("No fixed service address")).toBeNull();
    expect(getCustomerFacingSiteLabel("No fixed service address on file")).toBeNull();
    expect(isUserFacingSiteLabel("No fixed service address")).toBe(false);
    expect(getCustomerFacingSiteLabel("Main Campus")).toBe("Main Campus");
  });

  it("does not fall back to generic site address placeholders when no customer address exists", () => {
    expect(
      formatCustomerFacingInspectionAddress({
        siteName: "General / No Fixed Site",
        siteAddressLine1: "No fixed service address",
        siteCity: "Unknown",
        siteState: "Unknown",
        sitePostalCode: "Unknown"
      })
    ).toBe("");
  });

  it("uses the customer address for generic-site customer-facing address output", () => {
    expect(
      formatCustomerFacingInspectionAddress({
        siteName: "General / No Fixed Site",
        siteAddressLine1: "No fixed service address",
        siteCity: "Unknown",
        siteState: "Unknown",
        sitePostalCode: "Unknown",
        customerServiceAddressLine1: "800 Harbor Dr",
        customerServiceCity: "Chicago",
        customerServiceState: "IL",
        customerServicePostalCode: "60611"
      })
    ).toBe("800 Harbor Dr, Chicago IL 60611");
  });
});
