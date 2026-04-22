"use client";

import { useEffect, useState } from "react";

import { subscribeToOfflineChanges } from "./offline-db";
import { buildSyncSummary, startTechnicianSyncEngine } from "./offline-sync";
import type { SyncSummary } from "./offline-types";

const emptySummary: SyncSummary = {
  pending: 0,
  syncing: 0,
  failed: 0,
  conflict: 0,
  lastSyncAt: null,
  isOnline: true
};

export function useSyncSummary() {
  const [summary, setSummary] = useState<SyncSummary>(emptySummary);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const next = await buildSyncSummary();
      if (!cancelled) {
        setSummary(next);
      }
    };

    startTechnicianSyncEngine();
    void refresh();

    const unsubscribe = subscribeToOfflineChanges(() => {
      void refresh();
    });

    const handleOnlineState = () => {
      void refresh();
    };

    window.addEventListener("online", handleOnlineState);
    window.addEventListener("offline", handleOnlineState);

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("online", handleOnlineState);
      window.removeEventListener("offline", handleOnlineState);
    };
  }, []);

  return summary;
}
