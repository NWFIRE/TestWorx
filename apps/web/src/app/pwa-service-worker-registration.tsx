"use client";

import { useEffect } from "react";

const TECHNICIAN_CACHE_URLS = [
  "/app",
  "/app/tech",
  "/app/tech/work",
  "/app/tech/inspections",
  "/app/tech/manuals",
  "/app/tech/profile"
];

export function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      return;
    }

    let cancelled = false;

    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (cancelled) {
          return;
        }

        const worker = registration.active ?? registration.waiting ?? registration.installing;
        const postWarmCacheMessage = () => {
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

        worker?.addEventListener("statechange", () => {
          if (worker.state === "activated") {
            postWarmCacheMessage();
          }
        });
      } catch (error) {
        console.warn("TradeWorx offline app shell registration failed", error);
      }
    }

    void registerServiceWorker();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
