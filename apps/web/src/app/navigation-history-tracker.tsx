"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buildRouteHref, isDeletedInspectionRoute, rememberNavigationRoute } from "./smart-navigation";

export function NavigationHistoryTracker() {
  const pathname = usePathname();
  const router = useRouter();
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
    if (isDeletedInspectionRoute(currentHref)) {
      const fallback = pathname.startsWith("/app/tech/") ? "/app/tech/inspections" : pathname.startsWith("/app/customer/") ? "/app/customer" : "/app/admin/inspections";
      router.replace(fallback);
      return;
    }
    rememberNavigationRoute(currentHref, { initial: !initializedRef.current });
    initializedRef.current = true;
  }, [currentHref, pathname, router]);

  return null;
}
