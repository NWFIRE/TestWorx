import { describe, expect, it, vi } from "vitest";

import {
  assertWorkOrderLineItemTable,
  hasWorkOrderLineItemTable
} from "../work-order-line-item-table";

describe("work order line item table guard", () => {
  it("detects when the optional work order line item table exists", async () => {
    const db = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ exists: true }])
    };

    await expect(hasWorkOrderLineItemTable(db)).resolves.toBe(true);
  });

  it("returns false when the optional table has not been migrated yet", async () => {
    const db = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ exists: false }])
    };

    await expect(hasWorkOrderLineItemTable(db)).resolves.toBe(false);
  });

  it("throws a controlled feature-unavailable error instead of a Prisma table error", async () => {
    const db = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ exists: false }])
    };

    await expect(assertWorkOrderLineItemTable(db)).rejects.toThrow(
      "Work order line items are not enabled for this database yet."
    );
  });

  it("fails closed when the table check itself cannot run", async () => {
    const db = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("database unavailable"))
    };

    await expect(hasWorkOrderLineItemTable(db)).resolves.toBe(false);
  });
});
