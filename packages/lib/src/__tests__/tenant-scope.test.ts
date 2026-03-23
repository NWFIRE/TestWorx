import { describe, expect, it } from "vitest";

import { assertTenantContext } from "../permissions";

describe("tenant context", () => {
  it("requires tenant context for non-platform users", () => {
    expect(() => assertTenantContext("office_admin", null)).toThrow(/Tenant context/);
  });

  it("allows platform admins without a tenant", () => {
    expect(() => assertTenantContext("platform_admin", null)).not.toThrow();
  });
});

