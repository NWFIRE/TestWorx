import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  user: {
    findFirst: vi.fn()
  },
  inspectionReport: {
    findFirst: vi.fn()
  }
};

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

describe("report media authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("blocks customer users from accessing raw technician report media", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ customerCompanyId: "customer_1" });

    const { getAuthorizedReportMediaDownload } = await import("../report-service");

    await expect(
      getAuthorizedReportMediaDownload(
        { userId: "customer_user_1", role: "customer_user", tenantId: "tenant_1" },
        { inspectionReportId: "report_1", storageKey: "blob:tenant_1/photo/example.png" }
      )
    ).rejects.toThrow(/cannot access raw report media/i);

    expect(prismaMock.inspectionReport.findFirst).not.toHaveBeenCalled();
  }, 15000);
});
