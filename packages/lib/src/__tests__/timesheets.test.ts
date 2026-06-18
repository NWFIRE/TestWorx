import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: {
      findUnique: vi.fn()
    },
    timeEntry: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn()
    },
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  }
}));

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

import {
  calculateTimeEntryMinutes,
  clockInEmployee,
  clockOutEmployee,
  correctTimeEntry,
  createAdminTimeEntry,
  getAdminTimesheetWorkspace,
  getEmployeeTimesheet
} from "../timesheets";

const technicianActor = { userId: "tech_1", role: "technician", tenantId: "tenant_1" };
const adminActor = { userId: "admin_1", role: "office_admin", tenantId: "tenant_1" };

describe("timesheets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tenant.findUnique.mockResolvedValue({ timezone: "America/Chicago" });
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it("calculates gross, lunch deduction, and net minutes without going below zero", () => {
    expect(calculateTimeEntryMinutes(new Date("2026-05-04T13:00:00Z"), new Date("2026-05-04T22:00:00Z"))).toEqual({
      grossMinutes: 540,
      lunchDeductionMinutes: 30,
      netMinutes: 510
    });
    expect(calculateTimeEntryMinutes(new Date("2026-05-04T13:00:00Z"), new Date("2026-05-04T13:20:00Z"))).toEqual({
      grossMinutes: 20,
      lunchDeductionMinutes: 20,
      netMinutes: 0
    });
  });

  it("prevents duplicate active clock-ins", async () => {
    prismaMock.timeEntry.findFirst.mockResolvedValue({ id: "entry_open", clockInAt: new Date("2026-05-04T13:00:00Z") });

    await expect(clockInEmployee(technicianActor, new Date("2026-05-04T14:00:00Z"))).rejects.toThrow("already clocked in");
    expect(prismaMock.timeEntry.create).not.toHaveBeenCalled();
  });

  it("creates an open entry when an employee clocks in", async () => {
    const now = new Date("2026-05-04T13:00:00Z");
    prismaMock.timeEntry.findFirst.mockResolvedValue(null);
    prismaMock.timeEntry.create.mockResolvedValue({ id: "entry_1", clockInAt: now });

    await clockInEmployee(technicianActor, now);

    expect(prismaMock.timeEntry.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant_1",
        employeeId: "tech_1",
        clockInAt: now,
        lunchDeductionMinutes: 30,
        status: "open"
      }
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "time_entry.clock_in",
        entityId: "entry_1"
      })
    }));
  });

  it("closes an active entry and stores calculated totals", async () => {
    const clockInAt = new Date("2026-05-04T13:00:00Z");
    const clockOutAt = new Date("2026-05-04T22:00:00Z");
    prismaMock.timeEntry.findFirst.mockResolvedValue({ id: "entry_1", clockInAt });
    prismaMock.timeEntry.update.mockResolvedValue({ id: "entry_1", clockInAt, clockOutAt });

    await clockOutEmployee(technicianActor, clockOutAt);

    expect(prismaMock.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "entry_1" },
      data: expect.objectContaining({
        clockOutAt,
        grossMinutes: 540,
        lunchDeductionMinutes: 30,
        netMinutes: 510,
        status: "closed"
      })
    });
  });

  it("builds Monday-Sunday weekly rows and applies one lunch deduction per worked day", async () => {
    prismaMock.timeEntry.findFirst.mockResolvedValue(null);
    prismaMock.timeEntry.findMany.mockResolvedValue([
      {
        id: "entry_morning",
        clockInAt: new Date("2026-05-04T13:00:00Z"),
        clockOutAt: new Date("2026-05-04T17:00:00Z"),
        grossMinutes: 240,
        lunchDeductionMinutes: 30,
        netMinutes: 210,
        status: "closed",
        notes: null
      },
      {
        id: "entry_afternoon",
        clockInAt: new Date("2026-05-04T18:00:00Z"),
        clockOutAt: new Date("2026-05-04T22:00:00Z"),
        grossMinutes: 240,
        lunchDeductionMinutes: 30,
        netMinutes: 210,
        status: "closed",
        notes: "Returned after parts run"
      }
    ]);

    const timesheet = await getEmployeeTimesheet(technicianActor, "2026-05-04");

    expect(timesheet.rows).toHaveLength(7);
    expect(timesheet.rows[0]).toEqual(expect.objectContaining({
      grossMinutes: 480,
      lunchDeductionMinutes: 30,
      netMinutes: 450
    }));
    expect(timesheet.totals.netMinutes).toBe(450);
  });

  it("lets admins correct entries with an audit trail", async () => {
    const previousClockInAt = new Date("2026-05-04T14:00:00Z");
    const clockInAt = new Date("2026-05-04T13:00:00Z");
    const clockOutAt = new Date("2026-05-04T22:00:00Z");
    prismaMock.timeEntry.findFirst.mockResolvedValue({
      id: "entry_1",
      tenantId: "tenant_1",
      employeeId: "tech_1",
      clockInAt: previousClockInAt,
      clockOutAt: null
    });
    prismaMock.timeEntry.update.mockResolvedValue({ id: "entry_1" });

    await correctTimeEntry(adminActor, {
      timeEntryId: "entry_1",
      clockInAt,
      clockOutAt,
      notes: "Forgot to clock in at arrival.",
      correctionReason: "Admin correction from signed service ticket."
    });

    expect(prismaMock.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "entry_1" },
      data: expect.objectContaining({
        grossMinutes: 540,
        lunchDeductionMinutes: 30,
        netMinutes: 510,
        status: "corrected",
        correctedByUserId: "admin_1",
        correctionReason: "Admin correction from signed service ticket."
      })
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "time_entry.corrected",
        entityId: "entry_1"
      })
    }));
  });

  it("lets admins add missing employee time entries with calculated totals and audit history", async () => {
    const clockInAt = new Date("2026-05-04T13:00:00Z");
    const clockOutAt = new Date("2026-05-04T22:00:00Z");
    prismaMock.user.findFirst.mockResolvedValue({ id: "tech_1" });
    prismaMock.timeEntry.create.mockResolvedValue({ id: "entry_manual" });

    await createAdminTimeEntry(adminActor, {
      employeeId: "tech_1",
      clockInAt,
      clockOutAt,
      notes: "Added from signed service ticket.",
      correctionReason: "Employee forgot to clock in."
    });

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: "tech_1",
        tenantId: "tenant_1",
        isActive: true,
        role: { in: ["tenant_admin", "office_admin", "technician"] }
      },
      select: { id: true }
    });
    expect(prismaMock.timeEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant_1",
        employeeId: "tech_1",
        grossMinutes: 540,
        lunchDeductionMinutes: 30,
        netMinutes: 510,
        status: "corrected",
        correctedByUserId: "admin_1",
        correctionReason: "Employee forgot to clock in."
      })
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "time_entry.admin_created",
        entityId: "entry_manual"
      })
    }));
  });

  it("returns admin weekly summaries for active internal employees", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "tech_1", name: "Eli Rodriguez", email: "eli@example.com", role: "technician" }
    ]);
    prismaMock.timeEntry.findMany.mockResolvedValue([]);

    const workspace = await getAdminTimesheetWorkspace(adminActor, { week: "2026-05-04" });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: "tenant_1",
        isActive: true,
        role: { in: ["tenant_admin", "office_admin", "technician"] }
      })
    }));
    expect(workspace.employeeSummaries).toHaveLength(1);
    expect(workspace.employeeSummaries[0].rows).toHaveLength(7);
  });
});
