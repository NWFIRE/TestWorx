"use client";

import { useEffect } from "react";

import { setJobTimeSyncUser, startTechnicianSyncEngine } from "./offline-sync";

export function TechnicianSyncBootstrap({ userId }: { userId?: string }) {
  useEffect(() => {
    setJobTimeSyncUser(userId ?? null);
    startTechnicianSyncEngine();
    return () => setJobTimeSyncUser(null);
  }, [userId]);

  return null;
}
