import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    complianceReportingFeeRule: {
      findFirst: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    auditLog: { create: vi.fn() }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

import {
  createComplianceReportingFeeRule,
  resolveComplianceReportingFeeTx,
  updateComplianceReportingFeeRule
} from "../compliance-reporting-fees";

describe("compliance reporting fee resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the matching active fee by city and division", async () => {
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue({
      id: "rule_1",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      feeAmount: 25
    });

    const resolved = await resolveComplianceReportingFeeTx(prismaMock as never, {
      tenantId: "tenant_1",
      division: "fire_alarm",
      location: {
        city: "Chicago",
        state: "IL"
      }
    });

    expect(resolved).toEqual({
      division: "fire_alarm",
      feeAmount: 25,
      matched: true,
      source: "city",
      ruleId: "rule_1",
      city: "Chicago",
      county: "Cook",
      state: "IL"
    });
  });

  it("returns zero when no matching fee exists", async () => {
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);

    const resolved = await resolveComplianceReportingFeeTx(prismaMock as never, {
      tenantId: "tenant_1",
      division: "fire_sprinkler",
      location: {
        city: "Naperville",
        state: "IL"
      }
    });

    expect(resolved).toEqual({
      division: "fire_sprinkler",
      feeAmount: 0,
      matched: false,
      source: "none"
    });
  });

  it("ignores a city match when the stored state does not match", async () => {
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue({
      id: "rule_1",
      city: "Springfield",
      county: null,
      state: "MO",
      feeAmount: 19
    });

    const resolved = await resolveComplianceReportingFeeTx(prismaMock as never, {
      tenantId: "tenant_1",
      division: "fire_extinguishers",
      location: {
        city: "Springfield",
        state: "IL"
      }
    });

    expect(resolved.feeAmount).toBe(0);
    expect(resolved.matched).toBe(false);
  });
});

describe("compliance reporting fee rule validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.auditLog.create.mockResolvedValue(undefined);
  });

  it("blocks duplicate active rules for the same city and division on create", async () => {
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue({ id: "existing_rule" });

    await expect(
      createComplianceReportingFeeRule(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        {
          division: "fire_alarm",
          city: "Chicago",
          county: "Cook",
          state: "IL",
          feeAmount: 18,
          active: true
        }
      )
    ).rejects.toThrow(/already exists/i);
  });

  it("allows inactive duplicates because they do not compete in live resolution", async () => {
    prismaMock.complianceReportingFeeRule.findFirst.mockResolvedValue(null);
    prismaMock.complianceReportingFeeRule.create.mockResolvedValue({
      id: "rule_new",
      division: "fire_alarm",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      feeAmount: 18,
      active: false
    });

    const created = await createComplianceReportingFeeRule(
      { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
      {
        division: "fire_alarm",
        city: "Chicago",
        county: "Cook",
        state: "IL",
        feeAmount: 18,
        active: false
      }
    );

    expect(created.id).toBe("rule_new");
  });

  it("blocks updates that would collide with another active rule", async () => {
    prismaMock.complianceReportingFeeRule.findFirst
      .mockResolvedValueOnce({
        id: "rule_1",
        tenantId: "tenant_1",
        division: "fire_alarm",
        city: "Chicago",
        normalizedCity: "CHICAGO",
        county: "Cook",
        normalizedCounty: "COOK",
        state: "IL",
        normalizedState: "IL",
        feeAmount: 18,
        active: true
      })
      .mockResolvedValueOnce({ id: "rule_2" });

    await expect(
      updateComplianceReportingFeeRule(
        { userId: "office_1", role: "office_admin", tenantId: "tenant_1" },
        {
          ruleId: "rule_1",
          division: "fire_alarm",
          city: "Chicago",
          county: "",
          state: "IL",
          feeAmount: 25,
          active: true
        }
      )
    ).rejects.toThrow(/already exists/i);
  });
});
