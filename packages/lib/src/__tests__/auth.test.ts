import { describe, expect, it } from "vitest";

import { getDefaultDashboardPath } from "../auth";
import { canAccessQuoteWorkspace } from "../permissions";

describe("dashboard routing", () => {
  it("routes technicians to the technician workspace", () => {
    expect(getDefaultDashboardPath("technician")).toBe("/app/tech");
  });

  it("routes customer users to the customer portal", () => {
    expect(getDefaultDashboardPath("customer_user")).toBe("/app/customer");
  });
});

describe("quote workspace access", () => {
  it("allows technicians only when quote access is granted", () => {
    expect(canAccessQuoteWorkspace("technician")).toBe(false);
    expect(canAccessQuoteWorkspace("technician", { quoteAccess: true })).toBe(true);
  });

  it("keeps office admins enabled by default unless quote access is turned off", () => {
    expect(canAccessQuoteWorkspace("office_admin")).toBe(true);
    expect(canAccessQuoteWorkspace("office_admin", { quoteAccess: false })).toBe(false);
  });
});

