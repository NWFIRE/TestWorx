"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buildRouteHref, rememberNavigationRoute } from "./smart-navigation";

export function NavigationHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initializedRef = useRef(false);
  const [hash, setHash] = useState("");
  const currentHref = `${buildRouteHref(pathname, searchParams.toString())}${hash}`;

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash || "");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    rememberNavigationRoute(currentHref, { initial: !initializedRef.current });
    initializedRef.current = true;
  }, [currentHref]);

  return null;
}
