"use client";

import { putScreenSnapshot } from "./offline-db";
import { buildSyncSummary, processSyncQueue, recordSuccessfulSync, startTechnicianSyncEngine } from "./offline-sync";
import type { SyncSummary } from "./offline-types";

type TechnicianSyncPayload = {
  dashboard: unknown;
  manuals: unknown;
  user: {
    name: string | null;
    email: string | null;
  };
  syncedAt: string;
};

export type TechnicianManualSyncResult = {
  summary: SyncSummary;
  syncedAt: string;
};

async function fetchTechnicianUpdates() {
  const response = await fetch("/api/tech/sync", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin"
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Unable to pull technician updates.");
  }

  return payload as TechnicianSyncPayload;
}

export async function runTechnicianFullSync(): Promise<TechnicianManualSyncResult> {
  startTechnicianSyncEngine();

  if (!window.navigator.onLine) {
    throw new Error("Offline right now. Changes are saved locally and will sync when service returns.");
  }

  await processSyncQueue();
  const payload = await fetchTechnicianUpdates();

  await Promise.all([
    putScreenSnapshot("technician-home", { dashboard: payload.dashboard, manuals: payload.manuals }, payload.syncedAt),
    putScreenSnapshot("technician-work", { dashboard: payload.dashboard }, payload.syncedAt),
    putScreenSnapshot("technician-inspections", { dashboard: payload.dashboard }, payload.syncedAt),
    putScreenSnapshot("technician-profile", {
      dashboard: payload.dashboard,
      manuals: payload.manuals,
      user: payload.user
    }, payload.syncedAt),
    recordSuccessfulSync(payload.syncedAt)
  ]);

  await processSyncQueue();

  return {
    summary: await buildSyncSummary(),
    syncedAt: payload.syncedAt
  };
}
