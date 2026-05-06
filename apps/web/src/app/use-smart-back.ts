"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import {
  buildRouteHref,
  getStoredPreviousRoute,
  hasSafeBrowserBackTarget,
  resolveSmartBackFallback
} from "./smart-navigation";

function closeActiveOverlay() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const event = new Event("tradeworx:before-smart-back", { cancelable: true });
  if (!window.dispatchEvent(event)) {
    return true;
  }

  const explicitClose = document.querySelector<HTMLElement>("[data-smart-back-close]");
  if (explicitClose) {
    explicitClose.click();
    return true;
  }

  const openDialog = document.querySelector<HTMLDialogElement>("dialog[open]");
  if (openDialog) {
    openDialog.close();
    return true;
  }

  const openOverlayClose = document.querySelector<HTMLElement>(
    "[role='dialog'] [aria-label='Close'], [role='dialog'] button[data-close], [data-overlay='open'] [aria-label='Close']"
  );
  if (openOverlayClose) {
    openOverlayClose.click();
    return true;
  }

  return false;
}

export function useSmartBack(defaultFallbackHref?: string | null) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = buildRouteHref(pathname, searchParams.toString());

  return useCallback((overrideFallbackHref?: string | null) => {
    if (closeActiveOverlay()) {
      return;
    }

    const previousRoute = getStoredPreviousRoute(currentHref);
    if (hasSafeBrowserBackTarget(previousRoute)) {
      router.back();
      return;
    }

    if (previousRoute) {
      router.push(previousRoute);
      return;
    }

    router.push(resolveSmartBackFallback(pathname, overrideFallbackHref ?? defaultFallbackHref));
  }, [currentHref, defaultFallbackHref, pathname, router]);
}
