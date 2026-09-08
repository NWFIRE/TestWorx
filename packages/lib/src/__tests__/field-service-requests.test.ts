import { describe, expect, it } from "vitest";
import { fieldServiceRequestReviewSchema, fieldServiceRequestSchema } from "../field-service-requests";

describe("field service request validation", () => {
  it("accepts a detailed technician request without a site", () => {
    const result = fieldServiceRequestSchema.parse({
      customerCompanyId: "customer_1",
      siteId: "",
      requestType: "service_ticket",
      priority: "urgent",
      title: "Replace damaged pull station",
      description: "The east hallway pull station is cracked and needs replacement.",
      equipmentContext: "First floor, east exit",
      preferredTiming: "Before Friday"
    });
    expect(result.siteId).toBeNull();
    expect(result.priority).toBe("urgent");
  });

  it("rejects requests without actionable field details", () => {
    expect(() => fieldServiceRequestSchema.parse({
      customerCompanyId: "customer_1",
      requestType: "work_order",
      priority: "normal",
      title: "Fix",
      description: "Broken"
    })).toThrow();
  });

  it("only allows office workflow statuses during review", () => {
    expect(() => fieldServiceRequestReviewSchema.parse({ requestId: "request_1", status: "pending" })).toThrow();
    expect(fieldServiceRequestReviewSchema.parse({ requestId: "request_1", status: "resolved" }).status).toBe("resolved");
  });
});
