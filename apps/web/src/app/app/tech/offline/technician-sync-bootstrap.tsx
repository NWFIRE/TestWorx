"use client";

import { useEffect } from "react";

import { startTechnicianSyncEngine } from "./offline-sync";

export function TechnicianSyncBootstrap() {
  useEffect(() => {
    startTechnicianSyncEngine();
  }, []);

  return null;
}
