"use client";
import { useEffect, useState, type ReactNode } from "react";
import { configureOfflineWorkspace } from "./offline-db";
import { drainTechnicianSyncEngine } from "./offline-sync";

export function OfflineWorkspaceBoundary({ scope, children }: { scope: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void drainTechnicianSyncEngine().then(() => configureOfflineWorkspace(scope)).then(() => {
      if (!cancelled) setReady(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; void drainTechnicianSyncEngine(); };
  }, [scope]);
  if (!ready) return <div role="status" className="p-6 text-sm text-slate-600">{failed ? "Offline workspace could not be opened. Reload this page or contact your administrator. Your saved drafts have not been deleted." : "Preparing your workspace..."}</div>;
  return children;
}
