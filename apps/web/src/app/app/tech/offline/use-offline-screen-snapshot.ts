"use client";

import { useEffect, useState } from "react";

import { getScreenSnapshot, putScreenSnapshot } from "./offline-db";
import { startTechnicianSyncEngine } from "./offline-sync";
import { isCurrentTechnicianScreenSnapshot, markTechnicianScreenSnapshot } from "./screen-snapshot-version";
import type { LocalScreenSnapshotKey } from "./offline-types";

export function useOfflineScreenSnapshot<T>(key: LocalScreenSnapshotKey, initialData: T) {
  const [snapshot, setSnapshot] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      startTechnicianSyncEngine();
      const existing = await getScreenSnapshot<T>(key);
      if (existing?.payload && isCurrentTechnicianScreenSnapshot(existing.payload) && !cancelled) {
        setSnapshot(existing.payload);
      }

      const versionedInitialData = markTechnicianScreenSnapshot(initialData);
      await putScreenSnapshot(key, versionedInitialData);
      if (!cancelled) {
        setSnapshot(versionedInitialData);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [initialData, key]);

  return snapshot;
}
