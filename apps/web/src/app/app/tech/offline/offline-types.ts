export type SyncQueueStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";

export type SyncQueueEntityType = "inspection_report";

export type SyncQueueOperation = "report_autosave" | "report_finalize";

export type LocalScreenSnapshotKey =
  | "technician-home"
  | "technician-work"
  | "technician-inspections"
  | "technician-profile";

export type ScreenSnapshotRecord<T = unknown> = {
  key: LocalScreenSnapshotKey;
  payload: T;
  updatedAt: string;
};

export type LocalReportDraftRecord = {
  reportId: string;
  inspectionId: string;
  taskId: string;
  draft: unknown;
  taskDisplayLabel: string | null;
  reportStatus: "draft" | "submitted" | "finalized";
  serverUpdatedAt: string;
  localUpdatedAt: string;
  finalizedAt: string | null;
  syncStatus: SyncQueueStatus;
  pendingFinalize: boolean;
  lastError: string | null;
};

export type SyncQueueEntry = {
  id: string;
  entityType: SyncQueueEntityType;
  entityId: string;
  operation: SyncQueueOperation;
  payload: Record<string, unknown>;
  status: SyncQueueStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt: string | null;
};

export type OfflineMetaRecord = {
  key: string;
  value: string;
  updatedAt: string;
};

export type SyncSummary = {
  pending: number;
  syncing: number;
  failed: number;
  conflict: number;
  lastSyncAt: string | null;
  isOnline: boolean;
};
