import { describe, expect, it } from "vitest";

import { SignatureKind } from "@prisma/client";

import { formatDateTime as formatPdfV2DateTime } from "../pdf-v2/formatters";
import { formatDateTime as formatSpecializedPdfDateTime } from "../pdf-v2/core/formatting/dates";
import { normalizeSignaturePayload } from "../report-engine";
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

  it("formats PDF signature timestamps in the tenant timezone", () => {
    const signedAt = "2026-07-01T01:47:00.000Z";

    expect(formatPdfV2DateTime(signedAt, "America/Chicago")).toBe("Jun 30, 2026, 8:47 PM");
    expect(formatSpecializedPdfDateTime(signedAt, "America/Chicago")).toBe("Jun 30, 2026, 8:47 PM");
  });

  it("normalizes invalid signature timestamps to the current completion instant", () => {
    const before = Date.now();
    const signature = normalizeSignaturePayload(SignatureKind.technician, {
      signerName: "Eli Rodriguez",
      imageDataUrl: "blob:test-signature",
      signedAt: "not-a-date"
    });
    const after = Date.now();
    const normalized = new Date(signature.signedAt).getTime();

    expect(signature.signerName).toBe("Eli Rodriguez");
    expect(Number.isNaN(normalized)).toBe(false);
    expect(normalized).toBeGreaterThanOrEqual(before);
    expect(normalized).toBeLessThanOrEqual(after);
  });
});
