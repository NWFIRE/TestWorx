"use client";

import {
  deleteSyncQueueEntry,
  getLocalReportDraft,
  getLocalWorkOrderLineItem,
  getOfflineMeta,
  getSyncQueueEntry,
  listSyncQueueEntries,
  putLocalWorkOrderLineItem,
  putLocalReportDraft,
  putOfflineMeta,
  putSyncQueueEntry
} from "./offline-db";
import type { LocalReportDraftRecord, LocalWorkOrderLineItemRecord, SyncQueueEntry, SyncSummary } from "./offline-types";

const LAST_SYNC_META_KEY = "last-sync-at";
const STALE_SYNCING_ENTRY_MS = 30_000;

let syncStarted = false;
let syncInFlight: Promise<void> | null = null;
let intervalHandle: number | null = null;
let onlineHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;
let focusHandler: (() => void) | null = null;

function nowIso() {
  return new Date().toISOString();
}

function buildQueueId(reportId: string, operation: SyncQueueEntry["operation"]) {
  return `inspection_report:${reportId}:${operation}`;
}

function buildWorkOrderLineQueueId(lineItemId: string, operation: SyncQueueEntry["operation"]) {
  return `work_order_line_item:${lineItemId}:${operation}`;
}

function toConflictStatus(message: string | null | undefined) {
  return /locked|cannot edit|cannot be finalized|already finalized|already completed|closed inspections|does not have access/i.test(message ?? "");
}

function hasNewerQueueVersion(entry: SyncQueueEntry | null, syncMarker: string) {
  return Boolean(entry && entry.updatedAt > syncMarker);
}

function isStaleSyncingEntry(entry: SyncQueueEntry, now = Date.now()) {
  if (entry.status !== "syncing") {
    return false;
  }

  const marker = Date.parse(entry.lastAttemptAt ?? entry.updatedAt);
  if (!Number.isFinite(marker)) {
    return true;
  }

  return now - marker > STALE_SYNCING_ENTRY_MS;
}

function isProcessableQueueEntry(entry: SyncQueueEntry) {
  return entry.status === "pending" ||
    entry.status === "failed" ||
    isStaleSyncingEntry(entry) ||
    (entry.operation === "report_finalize" && entry.status === "conflict" && /already finalized|already completed/i.test(entry.lastError ?? ""));
}

function isFinalizationPendingOrComplete(record: LocalReportDraftRecord | null) {
  return Boolean(
    record &&
    (record.pendingFinalize || record.reportStatus === "submitted" || record.reportStatus === "finalized")
  );
}

async function upsertPendingQueueEntry(
  input: Omit<SyncQueueEntry, "status" | "retryCount" | "lastError" | "createdAt" | "updatedAt" | "lastAttemptAt">
) {
  const existing = await getSyncQueueEntry(input.id);
  const timestamp = nowIso();
  const nextEntry: SyncQueueEntry = {
    ...input,
    status: "pending",
    retryCount: existing?.retryCount ?? 0,
    lastError: null,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastAttemptAt: existing?.lastAttemptAt ?? null
  };

  await putSyncQueueEntry(nextEntry);
  return nextEntry;
}

async function syncReportAutosave(entry: SyncQueueEntry) {
  const reportId = String(entry.entityId);
  const existingLocal = await getLocalReportDraft(reportId);
  if (isFinalizationPendingOrComplete(existingLocal)) {
    return;
  }

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

  const local = await getLocalReportDraft(reportId);
  if (local && !isFinalizationPendingOrComplete(local)) {
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

async function syncWorkOrderLineUpsert(entry: SyncQueueEntry) {
  const response = await fetch("/api/work-orders/line-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upsert", ...entry.payload })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(new Error(payload.error ?? "Unable to sync work order line item."), {
      syncConflict: response.status === 409 || toConflictStatus(payload.error)
    });
  }

  const lineItem = payload.lineItem as LocalWorkOrderLineItemRecord | undefined;
  if (lineItem?.id) {
    await putLocalWorkOrderLineItem({
      ...lineItem,
      synced: true,
      syncStatus: "synced",
      localUpdatedAt: nowIso(),
      lastError: null
    });
  }
}

async function syncWorkOrderLineDelete(entry: SyncQueueEntry) {
  const response = await fetch("/api/work-orders/line-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", ...entry.payload })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Object.assign(new Error(payload.error ?? "Unable to remove work order line item."), {
      syncConflict: response.status === 409 || toConflictStatus(payload.error)
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
    const entries = (await listSyncQueueEntries()).filter(isProcessableQueueEntry).sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

    for (const entry of entries) {
      const current = await getSyncQueueEntry(entry.id);
      if (!current || !isProcessableQueueEntry(current)) {
        continue;
      }

      if (current.operation === "report_autosave") {
        const local = await getLocalReportDraft(current.entityId);
        if (isFinalizationPendingOrComplete(local)) {
          await deleteSyncQueueEntry(current.id);
          continue;
        }
      }

      const syncMarker = nowIso();
      await putSyncQueueEntry({
        ...current,
        status: "syncing",
        lastError: null,
        lastAttemptAt: syncMarker,
        updatedAt: syncMarker
      });

      try {
        if (current.operation === "report_autosave") {
          await syncReportAutosave(current);
        } else if (current.operation === "report_finalize") {
          await syncReportFinalize(current);
        } else if (current.operation === "work_order_line_upsert") {
          await syncWorkOrderLineUpsert(current);
        } else if (current.operation === "work_order_line_delete") {
          await syncWorkOrderLineDelete(current);
        }

        const latest = await getSyncQueueEntry(current.id);
        if (hasNewerQueueVersion(latest, syncMarker)) {
          await putSyncQueueEntry({
            ...latest!,
            status: "pending",
            lastError: null
          });

          const local = await getLocalReportDraft(current.entityId);
          if (local) {
            await putLocalReportDraft({
              ...local,
              syncStatus: "pending",
              lastError: null
            });
          }
        } else {
          await deleteSyncQueueEntry(current.id);
          await putOfflineMeta(LAST_SYNC_META_KEY, nowIso());
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to sync this change.";
        const latest = await getSyncQueueEntry(current.id);
        if (hasNewerQueueVersion(latest, syncMarker)) {
          await putSyncQueueEntry({
            ...latest!,
            status: "pending",
            lastError: null
          });

          const local = await getLocalReportDraft(current.entityId);
          if (local) {
            await putLocalReportDraft({
              ...local,
              syncStatus: "pending",
              lastError: null
            });
          }
        } else {
          await markQueueEntryStatus(current, (error as { syncConflict?: boolean } | undefined)?.syncConflict ? "conflict" : "failed", message);

          const local = await getLocalReportDraft(current.entityId);
          if (local) {
            await putLocalReportDraft({
              ...local,
              syncStatus: (error as { syncConflict?: boolean } | undefined)?.syncConflict ? "conflict" : "failed",
              lastError: message
            });
          }
          if (current.entityType === "work_order_line_item") {
            const localLine = await getLocalWorkOrderLineItem(current.entityId);
            if (localLine) {
              await putLocalWorkOrderLineItem({
                ...localLine,
                syncStatus: (error as { syncConflict?: boolean } | undefined)?.syncConflict ? "conflict" : "failed",
                lastError: message,
                localUpdatedAt: nowIso()
              });
            }
          }
        }
      }
    }
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export async function recordSuccessfulSync(timestamp = nowIso()) {
  await putOfflineMeta(LAST_SYNC_META_KEY, timestamp);
}

export function startTechnicianSyncEngine() {
  if (syncStarted || typeof window === "undefined") {
    return;
  }

  syncStarted = true;
  void processSyncQueue();

  onlineHandler = () => {
    void processSyncQueue();
  };
  window.addEventListener("online", onlineHandler);

  visibilityHandler = () => {
    if (document.visibilityState === "visible") {
      void processSyncQueue();
    }
  };
  focusHandler = () => {
    void processSyncQueue();
  };

  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("focus", focusHandler);

  intervalHandle = window.setInterval(() => {
    void processSyncQueue();
  }, 15000);
}

export function stopTechnicianSyncEngine() {
  if (intervalHandle) {
    window.clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  if (focusHandler) {
    window.removeEventListener("focus", focusHandler);
    focusHandler = null;
  }
  if (onlineHandler) {
    window.removeEventListener("online", onlineHandler);
    onlineHandler = null;
  }
  syncStarted = false;
}

export async function queueReportDraftSync(input: {
  reportId: string;
  inspectionReportId: string;
  contentJson: unknown;
  taskDisplayLabel: string | null;
}) {
  const local = await getLocalReportDraft(input.reportId);
  if (isFinalizationPendingOrComplete(local)) {
    return;
  }

  await upsertPendingQueueEntry({
    id: buildQueueId(input.reportId, "report_autosave"),
    entityType: "inspection_report",
    entityId: input.reportId,
    operation: "report_autosave",
    payload: {
      inspectionReportId: input.inspectionReportId,
      contentJson: input.contentJson,
      taskDisplayLabel: input.taskDisplayLabel
    }
  });
  void processSyncQueue();
}

export async function queueReportFinalizeSync(input: {
  reportId: string;
  inspectionReportId: string;
  contentJson: unknown;
  taskDisplayLabel: string | null;
}) {
  await deleteSyncQueueEntry(buildQueueId(input.reportId, "report_autosave"));
  await upsertPendingQueueEntry({
    id: buildQueueId(input.reportId, "report_finalize"),
    entityType: "inspection_report",
    entityId: input.reportId,
    operation: "report_finalize",
    payload: {
      inspectionReportId: input.inspectionReportId,
      contentJson: input.contentJson,
      taskDisplayLabel: input.taskDisplayLabel
    }
  });
  void processSyncQueue();
}

export async function queueWorkOrderLineItemUpsert(input: {
  id: string;
  inspectionId: string;
  catalogItemId: string;
  quantity: number;
  unitPrice: number | null;
  billableStatus: string;
  technicianNotes: string | null;
}) {
  await deleteSyncQueueEntry(buildWorkOrderLineQueueId(input.id, "work_order_line_delete"));
  await upsertPendingQueueEntry({
    id: buildWorkOrderLineQueueId(input.id, "work_order_line_upsert"),
    entityType: "work_order_line_item",
    entityId: input.id,
    operation: "work_order_line_upsert",
    payload: input
  });
  void processSyncQueue();
}

export async function queueWorkOrderLaborLineItemUpsert(input: {
  id: string;
  inspectionId: string;
  laborTypeId: string;
  laborHours: number;
  billableStatus: string;
  technicianNotes: string | null;
}) {
  await deleteSyncQueueEntry(buildWorkOrderLineQueueId(input.id, "work_order_line_delete"));
  await upsertPendingQueueEntry({
    id: buildWorkOrderLineQueueId(input.id, "work_order_line_upsert"),
    entityType: "work_order_line_item",
    entityId: input.id,
    operation: "work_order_line_upsert",
    payload: {
      ...input,
      action: "upsert_labor"
    }
  });
  void processSyncQueue();
}

export async function queueWorkOrderLineItemDelete(input: {
  id: string;
  inspectionId: string;
}) {
  await deleteSyncQueueEntry(buildWorkOrderLineQueueId(input.id, "work_order_line_upsert"));
  await upsertPendingQueueEntry({
    id: buildWorkOrderLineQueueId(input.id, "work_order_line_delete"),
    entityType: "work_order_line_item",
    entityId: input.id,
    operation: "work_order_line_delete",
    payload: {
      id: input.id,
      lineItemId: input.id,
      inspectionId: input.inspectionId
    }
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

  const staleSyncingEntries = entries.filter(isStaleSyncingEntry);

  return {
    pending: entries.filter((entry) => entry.status === "pending").length + staleSyncingEntries.length,
    syncing: entries.filter((entry) => entry.status === "syncing" && !isStaleSyncingEntry(entry)).length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    conflict: entries.filter((entry) => entry.status === "conflict").length,
    lastSyncAt: lastSync?.value ?? null,
    isOnline: typeof window !== "undefined" ? window.navigator.onLine : true
  };
}
