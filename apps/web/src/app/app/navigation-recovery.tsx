"use client";

import { useEffect, useReducer } from "react";

// Next 15's bundled React can lose a Flight render ping. A bounded state update
// wakes that render without another request, reload, or loss of entered work.
export function NavigationRecovery() {
  const [, wake] = useReducer((version: number) => version + 1, 0);
  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const cancel = () => { timers.forEach(clearTimeout); timers = []; };
    const start = (event: Event) => {
      cancel();
      const destination = new URL((event as CustomEvent<string>).detail, window.location.href);
      if (destination.origin !== window.location.origin) return;
      timers = [300, 1200, 3000].map(delay => setTimeout(() => {
        if (window.location.pathname + window.location.search !== destination.pathname + destination.search) wake();
      }, delay));
    };
    window.addEventListener("tradeworx-navigation-start", start);
    window.addEventListener("popstate", cancel);
    return () => { cancel(); window.removeEventListener("tradeworx-navigation-start", start); window.removeEventListener("popstate", cancel); };
  }, []);
  return null;
}
