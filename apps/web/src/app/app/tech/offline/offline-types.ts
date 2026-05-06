export type SyncQueueStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";

export type SyncQueueEntityType = "inspection_report" | "work_order_line_item";

export type SyncQueueOperation = "report_autosave" | "report_finalize" | "work_order_line_upsert" | "work_order_line_delete";

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

export type LocalWorkOrderLineItemRecord = {
  id: string;
  inspectionId: string;
  catalogItemId: string | null;
  itemType: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  taxable: boolean;
  billableStatus: string;
  technicianNotes: string | null;
  source: string;
  quickBooksItemId: string | null;
  synced: boolean;
  invoiced: boolean;
  localUpdatedAt: string;
  syncStatus: SyncQueueStatus;
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
