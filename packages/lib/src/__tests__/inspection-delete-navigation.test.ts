import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const list = "/app/admin/inspections?status=open";
const detail = "/app/admin/inspections/inspection-1";
const dashboard = "/app/admin/dashboard";

describe("inspection deletion navigation", () => {
  beforeEach(() => {
    vi.resetModules();
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
      history: { length: 10 },
      location: { origin: "https://tradeworx.test" }
    });
    vi.stubGlobal("document", { referrer: "" });
  });
  afterEach(() => vi.unstubAllGlobals());

  async function setup() {
    const nav = await import("../../../../apps/web/src/app/smart-navigation");
    for (const href of [dashboard, list, detail, `${detail}?tab=report`]) {
      nav.rememberNavigationRoute(href, { initial: false });
    }
    return nav;
  }

  it("does not use browser Back after a successful detail deletion", async () => {
    const nav = await setup();
    nav.forgetDeletedInspectionRoutes(["inspection-1"]);
    nav.rememberNavigationRoute(list, { initial: false });
    expect(nav.hasSafeBrowserBackTarget(dashboard)).toBe(false);
    expect(nav.takeRepairedBackTarget(list)).toBe(dashboard);
    nav.rememberNavigationRoute(dashboard, { initial: false });
    expect(nav.takeRepairedBackTarget(dashboard)).toBeNull();
  });

  it("prunes inspection/report/billing routes from a list-page deletion", async () => {
    const nav = await setup();
    nav.rememberNavigationRoute("/app/admin/reports/inspection-1/fire_alarm", { initial: false });
    nav.rememberNavigationRoute("/app/admin/billing/inspection-1", { initial: false });
    nav.rememberNavigationRoute(list, { initial: false });
    nav.forgetDeletedInspectionRoutes(["inspection-1"]);
    expect(nav.getStoredPreviousRoute(list)).toBe(dashboard);
    expect(nav.isDeletedInspectionRoute(`${detail}#documents`)).toBe(true);
    expect(nav.isDeletedInspectionRoute("/app/admin/inspections/inspection-10")).toBe(false);
  });

  it("protects all deleted future occurrences but keeps unrelated inspections", async () => {
    const nav = await setup();
    nav.forgetDeletedInspectionRoutes(["inspection-1", "future-2"]);
    expect(nav.isDeletedInspectionRoute("/app/tech/reports/future-2/fire_alarm/review")).toBe(true);
    expect(nav.isDeletedInspectionRoute("/app/admin/inspections/unrelated")).toBe(false);
    nav.rememberNavigationRoute("/app/admin/inspections/unrelated", { initial: false });
    expect(nav.isDeletedInspectionRoute("/app/admin/billing/future-2")).toBe(true);
  });

  it("does not let a browser revisit reinsert a deleted route", async () => {
    const nav = await setup();
    nav.forgetDeletedInspectionRoutes(["inspection-1"]);
    nav.rememberNavigationRoute(list, { initial: false });
    nav.rememberNavigationRoute(detail, { initial: true });
    expect(nav.getStoredPreviousRoute(list)).toBe(dashboard);
  });

  it("leaves normal and unsuccessful-delete navigation unchanged", async () => {
    const nav = await setup();
    expect(nav.hasSafeBrowserBackTarget(list)).toBe(true);
    expect(nav.takeRepairedBackTarget(detail)).toBeUndefined();
  });

  it("preserves normal subsequent navigation and persists the deleted routes on reload", async () => {
    const nav = await setup();
    nav.forgetDeletedInspectionRoutes(["inspection-1"]);
    nav.rememberNavigationRoute(list, { initial: false });
    const other = "/app/admin/inspections/other";
    nav.rememberNavigationRoute(other, { initial: false });
    expect(nav.takeRepairedBackTarget(other)).toBe(list);
    nav.rememberNavigationRoute(list, { initial: false });
    expect(nav.takeRepairedBackTarget(list)).toBe(dashboard);
    vi.resetModules();
    const reloaded = await import("../../../../apps/web/src/app/smart-navigation");
    expect(reloaded.isDeletedInspectionRoute(detail)).toBe(true);
  });

  it("keeps deletion protection if session storage cannot be written", async () => {
    const nav = await setup();
    window.sessionStorage.setItem = () => { throw new Error("quota"); };
    nav.forgetDeletedInspectionRoutes(["inspection-1"]);
    expect(nav.isDeletedInspectionRoute(detail)).toBe(true);
    expect(nav.hasSafeBrowserBackTarget(list)).toBe(false);
  });
});
