"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const TECHNICIAN_CACHE_URLS = [
  "/app",
  "/app/tech",
  "/app/tech/work",
  "/app/tech/inspections",
  "/app/tech/profile"
];

export function PwaServiceWorkerRegistration({ canWarmTechnicianCache = false }: { canWarmTechnicianCache?: boolean }) {
  const pathname = usePathname();
  const shouldWarm = canWarmTechnicianCache && (pathname === "/app/tech" || pathname.startsWith("/app/tech/"));
  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      return;
    }

    let cancelled = false;
    let removeStateListener: (() => void) | undefined;

    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (cancelled || !shouldWarm) {
          return;
        }

        const worker = registration.active ?? registration.waiting ?? registration.installing;
        const postWarmCacheMessage = () => {
          if (cancelled) return;
          const target = registration.active ?? navigator.serviceWorker.controller ?? worker;
          target?.postMessage({
            type: "TRADEWORX_WARM_TECH_CACHE",
            urls: TECHNICIAN_CACHE_URLS
          });
        };

        if (registration.active || navigator.serviceWorker.controller) {
          postWarmCacheMessage();
          return;
        }

        const onStateChange = () => {
          if (worker?.state === "activated") {
            postWarmCacheMessage();
          }
        };
        worker?.addEventListener("statechange", onStateChange);
        removeStateListener = () => worker?.removeEventListener("statechange", onStateChange);
      } catch (error) {
        console.warn("TradeWorx offline app shell registration failed", error);
      }
    }

    void registerServiceWorker();

    return () => {
      cancelled = true;
      removeStateListener?.();
    };
  }, [shouldWarm]);

  return null;
}
