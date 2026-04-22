"use client";

import {
  deleteSyncQueueEntry,
  getLocalReportDraft,
  getOfflineMeta,
  getSyncQueueEntry,
  listSyncQueueEntries,
  putLocalReportDraft,
  putOfflineMeta,
  putSyncQueueEntry
} from "./offline-db";
import type { LocalReportDraftRecord, SyncQueueEntry, SyncSummary } from "./offline-types";

const LAST_SYNC_META_KEY = "last-sync-at";

let syncStarted = false;
let syncInFlight: Promise<void> | null = null;
let intervalHandle: number | null = null;

function nowIso() {
  return new Date().toISOString();
}

function buildQueueId(reportId: string, operation: SyncQueueEntry["operation"]) {
  return `inspection_report:${reportId}:${operation}`;
}

function toConflictStatus(message: string | null | undefined) {
  return /locked|cannot edit|cannot be finalized|already finalized|already completed|does not have access/i.test(message ?? "");
}

async function syncReportAutosave(entry: SyncQueueEntry) {
  const response = await fetch("/api/reports/autosave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry.payload)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(new Error(payload.error ?? "Unable to sync report draft."), {
      syncConflict: response.status === 409 || toConflictStatus(payload.error)
    });
  }

  const reportId = String(entry.entityId);
  const local = await getLocalReportDraft(reportId);
  if (local) {
    await putLocalReportDraft({
      ...local,
      serverUpdatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : local.serverUpdatedAt,
      syncStatus: "synced",
      lastError: null
    });
  }
}

async function syncReportFinalize(entry: SyncQueueEntry) {
  const response = await fetch("/api/reports/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry.payload)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(new Error(payload.error ?? "Unable to finalize report."), {
      syncConflict: response.status === 409 || toConflictStatus(payload.error)
    });
  }

  const reportId = String(entry.entityId);
  const local = await getLocalReportDraft(reportId);
  if (local) {
    await putLocalReportDraft({
      ...local,
      reportStatus: "finalized",
      finalizedAt: typeof payload.finalizedAt === "string" ? payload.finalizedAt : nowIso(),
      pendingFinalize: false,
      syncStatus: "synced",
      lastError: null
    });
  }
}

async function markQueueEntryStatus(entry: SyncQueueEntry, status: SyncQueueEntry["status"], lastError: string | null) {
  await putSyncQueueEntry({
    ...entry,
    status,
    lastError,
    lastAttemptAt: nowIso(),
    updatedAt: nowIso(),
    retryCount: status === "failed" || status === "conflict" ? entry.retryCount + 1 : entry.retryCount
  });
}

export async function processSyncQueue() {
  if (!window.navigator.onLine) {
    return;
  }

  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    const entries = (await listSyncQueueEntries(["pending", "failed"])).sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

    for (const entry of entries) {
      const current = await getSyncQueueEntry(entry.id);
      if (!current || (current.status !== "pending" && current.status !== "failed")) {
        continue;
      }

      await markQueueEntryStatus(current, "syncing", null);

      try {
        if (current.operation === "report_autosave") {
          await syncReportAutosave(current);
        } else if (current.operation === "report_finalize") {
          await syncReportFinalize(current);
        }

        await deleteSyncQueueEntry(current.id);
        await putOfflineMeta(LAST_SYNC_META_KEY, nowIso());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to sync this change.";
        await markQueueEntryStatus(current, (error as { syncConflict?: boolean } | undefined)?.syncConflict ? "conflict" : "failed", message);

        const local = await getLocalReportDraft(current.entityId);
        if (local) {
          await putLocalReportDraft({
            ...local,
            syncStatus: (error as { syncConflict?: boolean } | undefined)?.syncConflict ? "conflict" : "failed",
            lastError: message
          });
        }
      }
    }
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export function startTechnicianSyncEngine() {
  if (syncStarted || typeof window === "undefined") {
    return;
  }

  syncStarted = true;
  void processSyncQueue();

  window.addEventListener("online", () => {
    void processSyncQueue();
  });

  intervalHandle = window.setInterval(() => {
    void processSyncQueue();
  }, 15000);
}

export function stopTechnicianSyncEngine() {
  if (intervalHandle) {
    window.clearInterval(intervalHandle);
    intervalHandle = null;
  }
  syncStarted = false;
}

export async function queueReportDraftSync(input: {
  reportId: string;
  inspectionReportId: string;
  contentJson: unknown;
  taskDisplayLabel: string | null;
}) {
  const entry: SyncQueueEntry = {
    id: buildQueueId(input.reportId, "report_autosave"),
    entityType: "inspection_report",
    entityId: input.reportId,
    operation: "report_autosave",
    payload: {
      inspectionReportId: input.inspectionReportId,
      contentJson: input.contentJson,
      taskDisplayLabel: input.taskDisplayLabel
    },
    status: "pending",
    retryCount: 0,
    lastError: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastAttemptAt: null
  };

  await putSyncQueueEntry(entry);
  void processSyncQueue();
}

export async function queueReportFinalizeSync(input: {
  reportId: string;
  inspectionReportId: string;
  contentJson: unknown;
  taskDisplayLabel: string | null;
}) {
  await putSyncQueueEntry({
    id: buildQueueId(input.reportId, "report_finalize"),
    entityType: "inspection_report",
    entityId: input.reportId,
    operation: "report_finalize",
    payload: {
      inspectionReportId: input.inspectionReportId,
      contentJson: input.contentJson,
      taskDisplayLabel: input.taskDisplayLabel
    },
    status: "pending",
    retryCount: 0,
    lastError: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastAttemptAt: null
  });
  void processSyncQueue();
}

export async function initializeLocalReportRecord(input: LocalReportDraftRecord) {
  const existing = await getLocalReportDraft(input.reportId);
  if (!existing) {
    await putLocalReportDraft(input);
    return input;
  }

  const existingUpdatedAt = Date.parse(existing.localUpdatedAt || existing.serverUpdatedAt);
  const incomingUpdatedAt = Date.parse(input.serverUpdatedAt || input.localUpdatedAt);
  if (Number.isFinite(existingUpdatedAt) && Number.isFinite(incomingUpdatedAt) && existingUpdatedAt > incomingUpdatedAt) {
    return existing;
  }

  const nextRecord = {
    ...input,
    draft: existing.pendingFinalize ? existing.draft : input.draft,
    taskDisplayLabel: existing.taskDisplayLabel || input.taskDisplayLabel,
    localUpdatedAt: existing.localUpdatedAt || input.localUpdatedAt,
    syncStatus: existing.syncStatus,
    pendingFinalize: existing.pendingFinalize,
    lastError: existing.lastError
  } satisfies LocalReportDraftRecord;

  await putLocalReportDraft(nextRecord);
  return nextRecord;
}

export async function buildSyncSummary(): Promise<SyncSummary> {
  const [entries, lastSync] = await Promise.all([
    listSyncQueueEntries(),
    getOfflineMeta(LAST_SYNC_META_KEY)
  ]);

  return {
    pending: entries.filter((entry) => entry.status === "pending").length,
    syncing: entries.filter((entry) => entry.status === "syncing").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    conflict: entries.filter((entry) => entry.status === "conflict").length,
    lastSyncAt: lastSync?.value ?? null,
    isOnline: typeof window !== "undefined" ? window.navigator.onLine : true
  };
}
