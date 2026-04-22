"use client";

import type {
  LocalReportDraftRecord,
  LocalScreenSnapshotKey,
  OfflineMetaRecord,
  ScreenSnapshotRecord,
  SyncQueueEntry,
  SyncQueueStatus
} from "./offline-types";

const DATABASE_NAME = "tradeworx-technician-offline";
const DATABASE_VERSION = 1;
const SCREEN_SNAPSHOT_STORE = "screenSnapshots";
const REPORT_DRAFT_STORE = "reportDrafts";
const SYNC_QUEUE_STORE = "syncQueue";
const META_STORE = "meta";
const OFFLINE_CHANGE_EVENT = "tradeworx-offline-change";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(SCREEN_SNAPSHOT_STORE)) {
        database.createObjectStore(SCREEN_SNAPSHOT_STORE, { keyPath: "key" });
      }

      if (!database.objectStoreNames.contains(REPORT_DRAFT_STORE)) {
        database.createObjectStore(REPORT_DRAFT_STORE, { keyPath: "reportId" });
      }

      if (!database.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const store = database.createObjectStore(SYNC_QUEUE_STORE, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the offline database."));
  });

  return databasePromise;
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
) {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    executor(store, resolve, reject);
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline database transaction failed."));
  }));
}

function notifyOfflineChange() {
  window.dispatchEvent(new CustomEvent(OFFLINE_CHANGE_EVENT));
}

export function subscribeToOfflineChanges(callback: () => void) {
  window.addEventListener(OFFLINE_CHANGE_EVENT, callback);
  return () => window.removeEventListener(OFFLINE_CHANGE_EVENT, callback);
}

export async function putScreenSnapshot<T>(key: LocalScreenSnapshotKey, payload: T, updatedAt = new Date().toISOString()) {
  const record: ScreenSnapshotRecord<T> = { key, payload, updatedAt };
  await runTransaction<void>(SCREEN_SNAPSHOT_STORE, "readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  notifyOfflineChange();
}

export async function getScreenSnapshot<T>(key: LocalScreenSnapshotKey) {
  return runTransaction<ScreenSnapshotRecord<T> | null>(SCREEN_SNAPSHOT_STORE, "readonly", (store, resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve((request.result as ScreenSnapshotRecord<T> | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function putLocalReportDraft(record: LocalReportDraftRecord) {
  await runTransaction<void>(REPORT_DRAFT_STORE, "readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  notifyOfflineChange();
}

export async function getLocalReportDraft(reportId: string) {
  return runTransaction<LocalReportDraftRecord | null>(REPORT_DRAFT_STORE, "readonly", (store, resolve, reject) => {
    const request = store.get(reportId);
    request.onsuccess = () => resolve((request.result as LocalReportDraftRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function listLocalReportDrafts() {
  return runTransaction<LocalReportDraftRecord[]>(REPORT_DRAFT_STORE, "readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as LocalReportDraftRecord[] | undefined) ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function putSyncQueueEntry(entry: SyncQueueEntry) {
  await runTransaction<void>(SYNC_QUEUE_STORE, "readwrite", (store, resolve, reject) => {
    const request = store.put(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  notifyOfflineChange();
}

export async function getSyncQueueEntry(id: string) {
  return runTransaction<SyncQueueEntry | null>(SYNC_QUEUE_STORE, "readonly", (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as SyncQueueEntry | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function listSyncQueueEntries(statuses?: SyncQueueStatus[]) {
  return runTransaction<SyncQueueEntry[]>(SYNC_QUEUE_STORE, "readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = (request.result as SyncQueueEntry[] | undefined) ?? [];
      resolve(statuses?.length ? entries.filter((entry) => statuses.includes(entry.status)) : entries);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSyncQueueEntry(id: string) {
  await runTransaction<void>(SYNC_QUEUE_STORE, "readwrite", (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  notifyOfflineChange();
}

export async function putOfflineMeta(key: string, value: string, updatedAt = new Date().toISOString()) {
  const record: OfflineMetaRecord = { key, value, updatedAt };
  await runTransaction<void>(META_STORE, "readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  notifyOfflineChange();
}

export async function getOfflineMeta(key: string) {
  return runTransaction<OfflineMetaRecord | null>(META_STORE, "readonly", (store, resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve((request.result as OfflineMetaRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}
