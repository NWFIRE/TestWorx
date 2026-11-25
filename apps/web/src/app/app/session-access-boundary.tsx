"use client";
import { useEffect } from "react";
import { drainTechnicianSyncEngine } from "./tech/offline/offline-sync";
import { configureOfflineWorkspace } from "./tech/offline/offline-db";

export function SessionAccessBoundary({ userId, tenantId, role }: { userId?: string; tenantId?: string | null; role: string }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SUBSCRIBER_FEATURES_ENABLED !== "true") return;
    let cancelled = false, checking = false;
    const scopeKey = "tradeworx-active-workspace";
    const scope = userId ? `${tenantId}:${userId}:${role}` : "signed-out";
    const clearNavigationCache = async () => {
      navigator.serviceWorker?.controller?.postMessage({ type: "TRADEWORX_RESET_WORKSPACE" });
      if ("caches" in window) await Promise.all((await caches.keys()).filter(key => key.startsWith("tradeworx-pwa-") && key.endsWith(":app-shell")).map(key => caches.delete(key)));
    };
    try {
      if (localStorage.getItem(scopeKey) !== scope) {
        localStorage.setItem(scopeKey, scope);
        void clearNavigationCache().catch(() => undefined);
      }
    } catch { /* Server access checks still apply when device storage is unavailable. */ }
    const changed = (event: StorageEvent) => {
      if (event.key === scopeKey && event.newValue !== scope) window.location.replace("/login?session=changed");
    };
    window.addEventListener("storage", changed);
    const verify = async () => {
      if (!userId || checking || !navigator.onLine || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return;
        const session = await response.json();
        if (!cancelled && (session.user?.id !== userId || (session.user?.tenantId ?? null) !== (tenantId ?? null) || session.user?.role !== role)) {
          cancelled = true;
          await drainTechnicianSyncEngine();
          await configureOfflineWorkspace("revoked").catch(() => undefined);
          await clearNavigationCache().catch(() => undefined);
          window.location.replace("/login?session=changed");
        }
      } catch { /* Offline field work remains available until access can be verified. */ }
      finally { checking = false; }
    };
    const timer = window.setInterval(() => { void verify(); }, 30000);
    const visible = () => { void verify(); };
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); window.removeEventListener("storage", changed); };
  }, [userId, tenantId, role]);
  return null;
}
