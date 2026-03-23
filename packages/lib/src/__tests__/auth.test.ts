import { describe, expect, it } from "vitest";

import { getDefaultDashboardPath } from "../auth";

describe("dashboard routing", () => {
  it("routes technicians to the technician workspace", () => {
    expect(getDefaultDashboardPath("technician")).toBe("/app/tech");
  });

  it("routes customer users to the customer portal", () => {
    expect(getDefaultDashboardPath("customer_user")).toBe("/app/customer");
  });
});

