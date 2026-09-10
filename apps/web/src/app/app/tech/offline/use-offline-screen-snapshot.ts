"use client";

import { useEffect, useState } from "react";

import { getScreenSnapshot, putScreenSnapshot, subscribeToScreenChanges } from "./offline-db";
import { startTechnicianSyncEngine } from "./offline-sync";
import { runTechnicianFullSync } from "./technician-full-sync";
import { isCurrentTechnicianScreenSnapshot, markTechnicianScreenSnapshot } from "./screen-snapshot-version";
import type { LocalScreenSnapshotKey } from "./offline-types";

export function useOfflineScreenSnapshot<T>(key: LocalScreenSnapshotKey, initialData: T) {
  const [snapshot, setSnapshot] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    let readVersion = 0;

    async function readSnapshot() {
      const version = ++readVersion;
      const existing = await getScreenSnapshot<T>(key);
      if (!cancelled && version === readVersion && existing?.payload && isCurrentTechnicianScreenSnapshot(existing.payload)) {
        setSnapshot(existing.payload);
      }
    }

    function refresh(event?: Event) {
      if (!cancelled && window.navigator.onLine && document.visibilityState !== "hidden") {
        // Keep the last usable snapshot if the network is unavailable.
        void runTechnicianFullSync(event?.type === "job-time-changed").catch(() => {});
      }
    }
    const unsubscribe = subscribeToScreenChanges(key, () => { void readSnapshot().catch(() => {}); });
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("job-time-changed", refresh);
    document.addEventListener("visibilitychange", refresh);

    async function hydrate() {
      startTechnicianSyncEngine();
      const existing = await getScreenSnapshot<T>(key);
      if (!window.navigator.onLine && existing?.payload && isCurrentTechnicianScreenSnapshot(existing.payload) && !cancelled) {
        setSnapshot(existing.payload);
        return;
      }

      const versionedInitialData = markTechnicianScreenSnapshot(initialData);
      if (cancelled) return;
      await putScreenSnapshot(key, versionedInitialData);
      if (!cancelled) {
        setSnapshot(versionedInitialData);
      }
      refresh();
    }

    void hydrate().catch(() => { if (!cancelled) setSnapshot(initialData); });

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("job-time-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [initialData, key]);

  return snapshot;
}
