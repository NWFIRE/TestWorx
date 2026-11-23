import { describe, expect, it, vi } from "vitest";
vi.mock("@testworx/lib", async () => import("../permissions"));
import { getAppNavItemsForRole, getCurrentAppNavItem } from "../../../../apps/web/src/app/app/app-nav-config";
import { filterAttentionQueue, isInAttentionWindow } from "../../../../apps/web/src/app/app/admin/attention-queue";
import { getDefaultDashboardPath } from "../auth";

describe("Home navigation", () => {
  it.each(["office_admin", "tenant_admin"])("keeps the %s bookmark and renames desktop/mobile/header labels", role => {
    const home = getCurrentAppNavItem(role, "/app/admin/dashboard");
    expect(home).toMatchObject({ label: "Home", shortLabel: "Home", href: "/app/admin/dashboard" });
    expect(getDefaultDashboardPath(role)).toBe("/app/admin");
    const links = getAppNavItemsForRole(role).map(item => item.href);
    expect(links).toContain("/app/admin/archive");
    expect(links).toContain("/app/admin/amendments");
    expect(links).toContain("/app/deficiencies");
  });
  it("preserves the technician landing and keeps office billing off their navigation", () => {
    expect(getDefaultDashboardPath("technician")).toBe("/app/tech");
    expect(getCurrentAppNavItem("technician", "/app/tech")?.label).toBe("Home");
    expect(getAppNavItemsForRole("technician").map(item => item.href)).not.toContain("/app/admin/billing");
  });
  it("uses the same unassigned, payment and linked predicates as destination lists", () => {
    const base = { status: "scheduled", scheduledStart: "2026-11-23T15:00:00Z", tasks: [], assignedTechnicianNames: [], customerCompany: {} };
    const rows = [base, { ...base, assignedTechnicianNames: ["Tech"], customerCompany: { paymentTermsCode: "due_on_receipt" }, amendments: [{ id: "amendment" }] }, { ...base, scheduledStart: "2028-01-01T00:00:00Z" }];
    const visible = rows.filter(row => isInAttentionWindow(row, new Date("2027-01-22T23:59:59Z")));
    expect(filterAttentionQueue(visible, "unassigned")).toEqual([base]);
    expect(filterAttentionQueue(visible, "payment")).toHaveLength(1);
    expect(filterAttentionQueue(visible, "linked")).toHaveLength(1);
  });
});
