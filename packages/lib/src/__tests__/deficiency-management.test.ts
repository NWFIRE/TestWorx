import { ReportStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, buildFileDownloadResponseMock } = vi.hoisted(() => {
  const txMock = {
    inspectionReport: {
      update: vi.fn(),
      findUniqueOrThrow: vi.fn()
    },
    attachment: {
      deleteMany: vi.fn(),
      createMany: vi.fn()
    },
    signature: {
      deleteMany: vi.fn(),
      createMany: vi.fn()
    },
    deficiency: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  };

  return {
    prismaMock: {
      inspectionReport: {
        findFirst: vi.fn()
      },
      asset: {
        findMany: vi.fn()
      },
      deficiency: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn()
      },
      site: {
        findMany: vi.fn()
      },
      user: {
        findFirst: vi.fn()
      },
      auditLog: {
        create: vi.fn()
      },
      $transaction: vi.fn()
    },
    txMock,
    buildFileDownloadResponseMock: vi.fn()
  };
});

vi.mock("@testworx/db", () => ({
  prisma: prismaMock
}));

vi.mock("../storage", () => ({
  buildFileDownloadResponse: buildFileDownloadResponseMock,
  assertStorageKeyBelongsToTenant: vi.fn(),
  assertStorageKeyCategory: vi.fn(),
  buildStoredFilePayload: vi.fn(),
  decodeStoredFile: vi.fn(),
  deleteStoredFile: vi.fn()
}));

import { buildInitialReportDraft, validateDraftForTemplate } from "../report-engine";
import { getAuthorizedDeficiencyPhotoDownload, updateDeficiencyStatus } from "../deficiency-service";
import { saveReportDraft } from "../report-service";

const fireAlarmAssets = [
  {
    id: "asset_panel",
    name: "Main fire alarm panel",
    assetTag: "FAP-100",
    metadata: {
      alarmRole: "control_panel",
      location: "Electrical room",
      panelName: "Main fire alarm panel",
      manufacturer: "Notifier",
      model: "NFS2-3030"
    }
  },
  {
    id: "asset_device",
    name: "Lobby pull station",
    assetTag: "FAI-101",
    metadata: {
      alarmRole: "initiating_device",
      location: "Lobby north exit",
      deviceType: "pull_station"
    }
  },
  {
    id: "asset_notification",
    name: "Lobby horn strobe",
    assetTag: "FAN-201",
    metadata: {
      alarmRole: "notification_appliance",
      location: "Main lobby",
      applianceType: "horn_strobe",
      applianceQuantity: 2
    }
  }
];

function buildEditableFireAlarmReport() {
  return {
    id: "report_1",
    tenantId: "tenant_1",
    inspectionId: "inspection_1",
    inspectionTaskId: "task_1",
    status: ReportStatus.draft,
    attachments: [],
    signatures: [],
    deficiencies: [],
    inspection: {
      id: "inspection_1",
      tenantId: "tenant_1",
      siteId: "site_1",
      customerCompanyId: "customer_1",
      assignedTechnicianId: "tech_1",
      scheduledStart: new Date("2026-03-20T15:00:00.000Z")
    },
    task: {
      id: "task_1",
      inspectionType: "fire_alarm"
    }
  };
}

function buildFailingFireAlarmDraft() {
  const draft = buildInitialReportDraft({
    inspectionType: "fire_alarm",
    siteName: "Pinecrest Tower",
    customerName: "Pinecrest Property Management",
    scheduledDate: "2026-03-20T15:00:00.000Z",
    assetCount: fireAlarmAssets.length,
    assets: fireAlarmAssets
  });

  const row = (draft.sections["initiating-devices"]?.fields.initiatingDevices as Array<Record<string, unknown>>)[0];
  row.functionalTestResult = "fail";
  row.physicalCondition = "good";
  row.sensitivityOrOperationResult = "fail";
  row.deficiencySeverity = "high";
  row.deficiencyNotes = "Pull station failed to activate alarm.";
  row.deficiencyPhoto = "blob:tenant_1/photo/deficiency-1.png";

  return validateDraftForTemplate(draft, "fire_alarm", fireAlarmAssets);
}

describe("deficiency management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) => callback(txMock));
    prismaMock.inspectionReport.findFirst.mockResolvedValue(buildEditableFireAlarmReport());
    prismaMock.asset.findMany.mockResolvedValue(fireAlarmAssets);
    txMock.inspectionReport.update.mockResolvedValue(undefined);
    txMock.attachment.deleteMany.mockResolvedValue(undefined);
    txMock.signature.deleteMany.mockResolvedValue(undefined);
    txMock.deficiency.findMany.mockResolvedValue([]);
    txMock.deficiency.upsert.mockResolvedValue(undefined);
    txMock.deficiency.deleteMany.mockResolvedValue(undefined);
    txMock.auditLog.create.mockResolvedValue(undefined);
    txMock.inspectionReport.findUniqueOrThrow.mockResolvedValue({ id: "report_1", status: ReportStatus.draft });
    buildFileDownloadResponseMock.mockReturnValue({ ok: true, type: "photo-download" });
  });

  it("creates a detected deficiency from a failed fire alarm row during autosave", async () => {
    const draft = buildFailingFireAlarmDraft();

    await saveReportDraft({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, {
      inspectionReportId: "report_1",
      contentJson: draft
    });

    expect(txMock.deficiency.upsert).toHaveBeenCalledTimes(1);
    const input = txMock.deficiency.upsert.mock.calls[0][0];
    expect(input.create).toMatchObject({
      tenantId: "tenant_1",
      siteId: "site_1",
      inspectionId: "inspection_1",
      inspectionReportId: "report_1",
      reportType: "fire_alarm",
      section: "initiating-devices",
      source: "detected",
      assetId: "asset_device",
      assetTag: "FAI-101",
      location: "Lobby north exit",
      deviceType: "pull_station",
      severity: "high",
      status: "open",
      notes: "Pull station failed to activate alarm.",
      photoStorageKey: "blob:tenant_1/photo/deficiency-1.png"
    });
    expect(input.create.sourceRowKey).toBeTruthy();
    expect(txMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          deficiencyCount: 1
        })
      })
    }));
  });

  it("updates an existing detected deficiency without creating duplicates when the same row stays failed", async () => {
    const draft = buildFailingFireAlarmDraft();
    const row = (draft.sections["initiating-devices"]?.fields.initiatingDevices as Array<Record<string, unknown>>)[0];
    const rowKey = String(row.__rowId);
    row.deficiencySeverity = "critical";
    row.deficiencyNotes = "Escalated after retest.";

    txMock.deficiency.findMany.mockResolvedValue([
      {
        id: "def_1",
        inspectionReportId: "report_1",
        source: "detected",
        section: "initiating-devices",
        sourceRowKey: rowKey,
        status: "quoted"
      }
    ]);

    await saveReportDraft({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, {
      inspectionReportId: "report_1",
      contentJson: draft
    });

    expect(txMock.deficiency.upsert).toHaveBeenCalledTimes(1);
    const input = txMock.deficiency.upsert.mock.calls[0][0];
    expect(input.where.inspectionReportId_source_section_sourceRowKey).toMatchObject({
      inspectionReportId: "report_1",
      source: "detected",
      section: "initiating-devices",
      sourceRowKey: rowKey
    });
    expect(input.update).toMatchObject({
      severity: "critical",
      notes: "Escalated after retest.",
      status: "quoted"
    });
    expect(txMock.deficiency.deleteMany).not.toHaveBeenCalled();
  });

  it("removes a previously detected deficiency when the source row no longer fails", async () => {
    const draft = buildFailingFireAlarmDraft();
    const row = (draft.sections["initiating-devices"]?.fields.initiatingDevices as Array<Record<string, unknown>>)[0];
    const rowKey = String(row.__rowId);
    row.functionalTestResult = "pass";
    row.deficiencySeverity = "";
    row.deficiencyNotes = "";
    row.deficiencyPhoto = "";

    txMock.deficiency.findMany.mockResolvedValue([
      {
        id: "def_1",
        inspectionReportId: "report_1",
        source: "detected",
        section: "initiating-devices",
        sourceRowKey: rowKey,
        status: "open"
      }
    ]);

    await saveReportDraft({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, {
      inspectionReportId: "report_1",
      contentJson: draft
    });

    expect(txMock.deficiency.upsert).not.toHaveBeenCalled();
    expect(txMock.deficiency.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant_1",
        id: { in: ["def_1"] }
      }
    });
  });

  it("only allows administrators to update deficiency status and writes an audit log", async () => {
    prismaMock.deficiency.findFirst.mockResolvedValue({
      id: "def_1",
      tenantId: "tenant_1",
      status: "open"
    });
    prismaMock.deficiency.update.mockResolvedValue({
      id: "def_1",
      status: "resolved"
    });
    prismaMock.auditLog.create.mockResolvedValue(undefined);

    await expect(
      updateDeficiencyStatus({ userId: "tech_1", role: "technician", tenantId: "tenant_1" }, "def_1", "resolved")
    ).rejects.toThrow(/only administrators/i);

    await updateDeficiencyStatus({ userId: "office_1", role: "office_admin", tenantId: "tenant_1" }, "def_1", "resolved");

    expect(prismaMock.deficiency.findFirst).toHaveBeenCalledWith({
      where: { id: "def_1", tenantId: "tenant_1" }
    });
    expect(prismaMock.deficiency.update).toHaveBeenCalledWith({
      where: { id: "def_1" },
      data: { status: "resolved" }
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "deficiency.status_updated",
        entityId: "def_1"
      })
    }));
  });

  it("keeps deficiency photo downloads tenant scoped and allows matching finalized customer access", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      customerCompanyId: "customer_1"
    });
    prismaMock.deficiency.findFirst.mockResolvedValue({
      id: "def_1",
      tenantId: "tenant_1",
      photoStorageKey: "blob:tenant_1/photo/deficiency-1.png",
      inspectionReport: {
        status: ReportStatus.finalized,
        inspection: {
          assignedTechnicianId: "tech_1",
          customerCompanyId: "customer_1"
        }
      }
    });

    const customerResult = await getAuthorizedDeficiencyPhotoDownload(
      { userId: "customer_user_1", role: "customer_user", tenantId: "tenant_1" },
      "def_1"
    );

    expect(customerResult).toEqual({ ok: true, type: "photo-download" });
    expect(buildFileDownloadResponseMock).toHaveBeenCalledWith({
      storageKey: "blob:tenant_1/photo/deficiency-1.png",
      fileName: "deficiency-def_1.png",
      fallbackMimeType: "image/png"
    });

    await expect(
      getAuthorizedDeficiencyPhotoDownload(
        { userId: "customer_user_2", role: "customer_user", tenantId: "tenant_2" },
        "def_1"
      )
    ).rejects.toThrow(/do not have access/i);
  });
});
