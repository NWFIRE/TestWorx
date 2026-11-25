"use client";

import { useEffect } from "react";

import { setJobTimeSyncUser, startTechnicianSyncEngine, stopTechnicianSyncEngine } from "./offline-sync";

export function TechnicianSyncBootstrap({ userId }: { userId?: string }) {
  useEffect(() => {
    setJobTimeSyncUser(userId ?? null);
    startTechnicianSyncEngine();
    return () => { stopTechnicianSyncEngine(); setJobTimeSyncUser(null); };
  }, [userId]);

  return null;
}
