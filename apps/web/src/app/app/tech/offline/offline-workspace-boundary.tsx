"use client";
import { useEffect, useState, type ReactNode } from "react";
import { configureOfflineWorkspace } from "./offline-db";
import { drainTechnicianSyncEngine } from "./offline-sync";

export function OfflineWorkspaceBoundary({ scope, children }: { scope: string; children: ReactNode }) {
  const [readyScope, setReadyScope] = useState<string | null>(null);
  const [failedScope, setFailedScope] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void drainTechnicianSyncEngine().then(() => configureOfflineWorkspace(scope)).then(() => {
      if (!cancelled) setReadyScope(scope);
    }).catch(() => { if (!cancelled) setFailedScope(scope); });
    return () => { cancelled = true; void drainTechnicianSyncEngine(); };
  }, [scope]);
  if (readyScope !== scope) return <div role="status" className="p-6 text-sm text-slate-600">{failedScope === scope ? "Offline workspace could not be opened. Reload this page or contact your administrator. Your saved drafts have not been deleted." : "Preparing your workspace..."}</div>;
  return children;
}
