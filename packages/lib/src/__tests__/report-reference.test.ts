import { describe, expect, it } from "vitest";
import { formatReportReference, parseReportNumber, isReportReferenceSearch, reportReferenceSearchWhere } from "../report-reference";

describe("public report references", () => {
  it("formats stable references without replacing internal IDs", () => {
    expect(formatReportReference({ id: "internal", reportNumber: 1234 })).toBe("R-001234");
    expect(formatReportReference({ id: "internal", reportNumber: 1234567 })).toBe("R-1234567");
    expect(formatReportReference({ id: "legacy" })).toBe("legacy");
  });
  it.each(["R-001234", "r1234", " R 1234 ", "001234", "1234"])("accepts %s", (query) => {
    expect(parseReportNumber(query)).toBe(1234);
    expect(isReportReferenceSearch(query)).toBe(true);
  });
  it.each(["", "R-0", "-12", "1.2", "customer", "2147483648"])("rejects %s", (query) => {
    expect(parseReportNumber(query)).toBeNull();
  });
  it("searches both legacy IDs and the numbered reference", () => {
    expect(reportReferenceSearchWhere("R-001234")).toEqual({ OR: [
      { id: { contains: "R-001234", mode: "insensitive" } }, { reportNumber: 1234 }
    ] });
    expect(reportReferenceSearchWhere("legacy")).toEqual({ OR: [
      { id: { contains: "legacy", mode: "insensitive" } }
    ] });
    expect(isReportReferenceSearch("c123456789012345678901234")).toBe(true);
  });
});
