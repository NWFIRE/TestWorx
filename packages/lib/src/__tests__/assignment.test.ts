import { describe, expect, it } from "vitest";

import { getAssignmentAuditAction } from "../scheduling";

describe("assignment audit logic", () => {
  it("emits assign when an inspection gains a technician", () => {
    expect(getAssignmentAuditAction(null, "tech_1")).toBe("inspection.assigned");
  });

  it("emits unassign when an inspection is returned to the shared queue", () => {
    expect(getAssignmentAuditAction("tech_1", null)).toBe("inspection.unassigned");
  });

  it("does not emit an action when the assignee is unchanged", () => {
    expect(getAssignmentAuditAction("tech_1", "tech_1")).toBeNull();
  });
});