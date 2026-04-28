import { describe, expect, it } from "vitest";

import { DEFAULT_TENANT_TIMEZONE, formatTenantDateTime, normalizeTenantTimezone } from "../timezone";

describe("tenant timezone formatting", () => {
  it("formats timestamps in the selected tenant timezone", () => {
    const timestamp = new Date("2026-04-28T20:19:00.000Z");

    expect(formatTenantDateTime(timestamp, "America/Chicago")).toBe("Apr 28, 2026, 3:19 PM");
    expect(formatTenantDateTime(timestamp, "America/New_York")).toBe("Apr 28, 2026, 4:19 PM");
  });

  it("falls back to the default timezone for invalid values", () => {
    expect(normalizeTenantTimezone("not-a-timezone")).toBe(DEFAULT_TENANT_TIMEZONE);
  });
});
