"use client";

import { useEffect, useState } from "react";

import { getScreenSnapshot, putScreenSnapshot } from "./offline-db";
import { startTechnicianSyncEngine } from "./offline-sync";
import type { LocalScreenSnapshotKey } from "./offline-types";

export function useOfflineScreenSnapshot<T>(key: LocalScreenSnapshotKey, initialData: T) {
  const [snapshot, setSnapshot] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      startTechnicianSyncEngine();
      const existing = await getScreenSnapshot<T>(key);
      if (existing?.payload && !cancelled) {
        setSnapshot(existing.payload);
      }

      await putScreenSnapshot(key, initialData);
      if (!cancelled) {
        setSnapshot(initialData);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [initialData, key]);

  return snapshot;
}
