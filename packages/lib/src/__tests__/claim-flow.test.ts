import { InspectionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { canTechnicianClaimInspection } from "../scheduling";

describe("unassigned claim flow", () => {
  it("allows claim when inspection is to be completed, claimable, and in the same tenant", () => {
    expect(
      canTechnicianClaimInspection({
        actorTenantId: "tenant_1",
        inspectionTenantId: "tenant_1",
        assignedTechnicianIds: [],
        claimable: true,
        status: InspectionStatus.to_be_completed
      })
    ).toBe(true);
  });

  it("continues allowing claim when inspection is explicitly scheduled", () => {
    expect(
      canTechnicianClaimInspection({
        actorTenantId: "tenant_1",
        inspectionTenantId: "tenant_1",
        assignedTechnicianIds: [],
        claimable: true,
        status: InspectionStatus.scheduled
      })
    ).toBe(true);
  });

  it("blocks claim when tenant isolation would be violated", () => {
    expect(
      canTechnicianClaimInspection({
        actorTenantId: "tenant_2",
        inspectionTenantId: "tenant_1",
        assignedTechnicianIds: [],
        claimable: true,
        status: InspectionStatus.scheduled
      })
    ).toBe(false);
  });

  it("blocks claim when the inspection is already assigned", () => {
    expect(
      canTechnicianClaimInspection({
        actorTenantId: "tenant_1",
        inspectionTenantId: "tenant_1",
        assignedTechnicianIds: ["tech_7"],
        claimable: true,
        status: InspectionStatus.scheduled
      })
    ).toBe(false);
  });
});
