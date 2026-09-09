"use client";

import { useEffect, useState } from "react";

export function useRequestBadge(role: string, pathname: string) {
  const [count, setCount] = useState(0);
  const enabled = ["office_admin", "tenant_admin", "platform_admin"].includes(role);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/admin/service-requests/count", { cache: "no-store", signal: request.signal });
        if (!response.ok) return;
        const data = await response.json() as { count?: number };
        if (!disposed && !request.signal.aborted && typeof data.count === "number" && Number.isSafeInteger(data.count) && data.count >= 0) setCount(data.count);
      } catch {
        // Keep the last known count during a temporary network failure.
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("field-request-reviewed", refresh);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("field-request-reviewed", refresh);
    };
  }, [enabled, pathname]);
  return enabled ? count : 0;
}
