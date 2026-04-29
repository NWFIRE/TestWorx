import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    complianceReportingFeeRule: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
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
    prismaMock.complianceReportingFeeRule.findMany.mockResolvedValue([{
      id: "rule_1",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      zipCode: null,
      normalizedCity: "CHICAGO",
      normalizedCounty: "",
      normalizedState: "IL",
      normalizedZipCode: "",
      feeAmount: 25
    }]);

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
      source: "city_state",
      ruleId: "rule_1",
      city: "Chicago",
      county: "Cook",
      state: "IL",
      zipCode: null
    });
  });

  it("returns zero when no matching fee exists", async () => {
    prismaMock.complianceReportingFeeRule.findMany.mockResolvedValue([]);

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

  it("skips mismatched city rules and applies the matching state-specific rule", async () => {
    prismaMock.complianceReportingFeeRule.findMany.mockResolvedValue([
      {
        id: "rule_mo",
        city: "Springfield",
        county: null,
        state: "MO",
        zipCode: null,
        normalizedCity: "SPRINGFIELD",
        normalizedCounty: "",
        normalizedState: "MO",
        normalizedZipCode: "",
        feeAmount: 19
      },
      {
        id: "rule_il",
        city: "Springfield",
        county: null,
        state: "IL",
        zipCode: null,
        normalizedCity: "SPRINGFIELD",
        normalizedCounty: "",
        normalizedState: "IL",
        normalizedZipCode: "",
        feeAmount: 27
      }
    ]);

    const resolved = await resolveComplianceReportingFeeTx(prismaMock as never, {
      tenantId: "tenant_1",
      division: "fire_extinguishers",
      location: {
        city: "Springfield",
        state: "IL"
      }
    });

    expect(resolved.feeAmount).toBe(27);
    expect(resolved.matched).toBe(true);
    expect(resolved.source).toBe("city_state");
  });

  it("prefers ZIP-specific rules over broader city rules", async () => {
    prismaMock.complianceReportingFeeRule.findMany.mockResolvedValue([
      {
        id: "rule_city",
        city: "Enid",
        county: null,
        state: "OK",
        zipCode: null,
        normalizedCity: "ENID",
        normalizedCounty: "",
        normalizedState: "OK",
        normalizedZipCode: "",
        feeAmount: 20
      },
      {
        id: "rule_zip",
        city: "Enid",
        county: null,
        state: "OK",
        zipCode: "73701",
        normalizedCity: "ENID",
        normalizedCounty: "",
        normalizedState: "OK",
        normalizedZipCode: "73701",
        feeAmount: 35
      }
    ]);

    const resolved = await resolveComplianceReportingFeeTx(prismaMock as never, {
      tenantId: "tenant_1",
      division: "fire_alarm",
      location: {
        city: "Enid",
        state: "OK",
        zipCode: "73701"
      }
    });

    expect(resolved).toEqual(expect.objectContaining({
      feeAmount: 35,
      matched: true,
      source: "zip",
      ruleId: "rule_zip",
      zipCode: "73701"
    }));
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
          zipCode: "",
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
      zipCode: null,
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
        zipCode: "",
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
        zipCode: null,
        normalizedZipCode: "",
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
          zipCode: "",
          feeAmount: 25,
          active: true
        }
      )
    ).rejects.toThrow(/already exists/i);
  });
});
