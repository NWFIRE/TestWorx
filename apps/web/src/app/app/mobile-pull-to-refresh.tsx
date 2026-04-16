"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
  type ReactNode
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { BrandLoader } from "@/app/brand-loader";

const READY_THRESHOLD = 74;
const MAX_PULL_DISTANCE = 116;
const REFRESH_HOLD_MS = 700;

type RefreshHandler = () => Promise<void> | void;

type MobileRefreshRegistration = {
  refreshHandler: RefreshHandler | null;
  blocked: boolean;
};

type MobileRefreshContextValue = {
  registerRefreshHandler: (handler: RefreshHandler | null) => () => void;
  setRefreshBlocked: (blocked: boolean) => void;
};

const MobileRefreshContext = createContext<MobileRefreshContextValue | null>(null);

function isSupportedMobileRoute(pathname: string) {
  return (
    pathname === "/app/admin/dashboard" ||
    pathname === "/app/admin/inspections" ||
    pathname.startsWith("/app/admin/inspections/") ||
    pathname === "/app/admin/reports" ||
    pathname === "/app/deficiencies" ||
    pathname === "/app/admin/billing" ||
    pathname.startsWith("/app/admin/billing/") ||
    pathname.startsWith("/app/admin/clients/")
  );
}

function isBlockedMobileRoute(pathname: string) {
  return (
    pathname.startsWith("/app/tech/reports/") ||
    pathname.includes("/documents/") ||
    pathname.startsWith("/app/admin/reports/") ||
    pathname.includes("/quotes/new")
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (
    target.closest(
      [
        "input",
        "textarea",
        "select",
        "button",
        "[contenteditable='true']",
        "[data-mobile-refresh-block='true']"
      ].join(",")
    )
  ) {
    return true;
  }

  return false;
}

function hasHorizontalScrollAncestor(target: EventTarget | null, boundary: HTMLElement | null) {
  let node = target instanceof HTMLElement ? target : null;

  while (node && node !== boundary && node !== document.body) {
    const style = window.getComputedStyle(node);
    const canScrollHorizontally =
      (style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 4;

    if (canScrollHorizontally) {
      return true;
    }

    node = node.parentElement;
  }

  return false;
}

function hasNestedVerticalScroll(target: EventTarget | null, boundary: HTMLElement | null) {
  let node = target instanceof HTMLElement ? target : null;

  while (node && node !== boundary && node !== document.body) {
    const style = window.getComputedStyle(node);
    const canScrollVertically =
      (style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight + 4;

    if (canScrollVertically) {
      return true;
    }

    node = node.parentElement;
  }

  return false;
}

function PullIndicator({
  pullDistance,
  ready,
  refreshing
}: {
  pullDistance: number;
  ready: boolean;
  refreshing: boolean;
}) {
  const visible = refreshing || pullDistance > 6;
  const opacity = refreshing ? 1 : Math.min(1, pullDistance / READY_THRESHOLD);
  const translateY = refreshing ? 16 : Math.min(22, pullDistance / 3.4);

  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
      style={{ opacity, transform: `translateY(${translateY}px)` }}
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-default)] bg-white/94 px-3.5 py-2 shadow-[0_14px_28px_rgba(15,23,42,0.08)] backdrop-blur">
        {refreshing ? (
          <BrandLoader className="opacity-95" label="Refreshing" size="sm" />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 items-center justify-center text-[rgb(var(--tenant-primary-rgb))] transition-transform duration-150"
            style={{ transform: ready ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16">
              <path
                d="M8 3.25v8M4.75 8.75 8 12l3.25-3.25"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.7"
              />
            </svg>
          </span>
        )}
        <span className="text-xs font-semibold text-[color:var(--text-secondary)]">
          {refreshing ? "Refreshing" : ready ? "Release to refresh" : "Pull to refresh"}
        </span>
      </div>
    </div>
  );
}

export function useMobilePullToRefreshRegistration(handler: RefreshHandler | null, options?: { blocked?: boolean }) {
  const context = useContext(MobileRefreshContext);

  useEffect(() => {
    if (!context || !handler) {
      return;
    }

    return context.registerRefreshHandler(handler);
  }, [context, handler]);

  useEffect(() => {
    if (!context) {
      return;
    }

    context.setRefreshBlocked(Boolean(options?.blocked));

    return () => {
      context.setRefreshBlocked(false);
    };
  }, [context, options?.blocked]);
}

export function MobilePullToRefresh({
  children,
  containerRef,
  drawerOpen
}: {
  children: ReactNode;
  containerRef: MutableRefObject<HTMLElement | null>;
  drawerOpen: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pullDistance, setPullDistance] = useState(0);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const registrationRef = useRef<MobileRefreshRegistration>({
    refreshHandler: null,
    blocked: false
  });
  const enabledRef = useRef(false);
  const trackingRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const readyRef = useRef(false);
  const refreshingRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);

  const routeEnabled = isSupportedMobileRoute(pathname) && !isBlockedMobileRoute(pathname);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(pointer: coarse) and (max-width: 1024px)");
    const updateEnabled = () => {
      enabledRef.current = mediaQuery.matches;
    };

    updateEnabled();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateEnabled);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(updateEnabled);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", updateEnabled);
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(updateEnabled);
      }
    };
  }, []);

  const reset = useCallback(() => {
    trackingRef.current = false;
    startYRef.current = 0;
    startXRef.current = 0;
    activeTouchIdRef.current = null;
    setPullDistance(0);
    setReady(false);
  }, []);

  const runRefresh = useCallback(async () => {
    const registeredRefresh = registrationRef.current.refreshHandler;

    setRefreshing(true);
    reset();

    try {
      if (registeredRefresh) {
        await registeredRefresh();
      } else {
        startTransition(() => {
          router.refresh();
        });
      }
    } finally {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setRefreshing(false);
      }, REFRESH_HOLD_MS);
    }
  }, [reset, router, startTransition]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      if (
        !enabledRef.current ||
        !routeEnabled ||
        drawerOpen ||
        registrationRef.current.blocked ||
        refreshingRef.current ||
        event.touches.length !== 1 ||
        container.scrollTop > 0 ||
        isInteractiveTarget(event.target) ||
        hasHorizontalScrollAncestor(event.target, container) ||
        hasNestedVerticalScroll(event.target, container)
      ) {
        trackingRef.current = false;
        return;
      }

      trackingRef.current = true;
      activeTouchIdRef.current = touch.identifier;
      startYRef.current = touch.clientY;
      startXRef.current = touch.clientX;
      setPullDistance(0);
      setReady(false);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!trackingRef.current || refreshingRef.current) {
        return;
      }

      const touch = Array.from(event.touches).find((entry) => entry.identifier === activeTouchIdRef.current);
      if (!touch) {
        reset();
        return;
      }

      if (container.scrollTop > 0) {
        reset();
        return;
      }

      const deltaX = touch.clientX - startXRef.current;
      const deltaY = touch.clientY - startYRef.current;

      if (Math.abs(deltaX) > Math.abs(deltaY) * 0.9) {
        reset();
        return;
      }

      if (deltaY <= 0) {
        setPullDistance(0);
        setReady(false);
        return;
      }

      const resistedDistance = Math.min(MAX_PULL_DISTANCE, deltaY * 0.42 + Math.sqrt(deltaY) * 1.8);
      setPullDistance(resistedDistance);
      setReady(resistedDistance >= READY_THRESHOLD);
      event.preventDefault();
    };

    const handleTouchEnd = () => {
      if (!trackingRef.current) {
        return;
      }

      if (readyRef.current && !refreshingRef.current) {
        void runRefresh();
        return;
      }

      reset();
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [containerRef, drawerOpen, reset, routeEnabled, runRefresh]);

  const contextValue = useMemo<MobileRefreshContextValue>(
    () => ({
      registerRefreshHandler(handler) {
        registrationRef.current.refreshHandler = handler;

        return () => {
          if (registrationRef.current.refreshHandler === handler) {
            registrationRef.current.refreshHandler = null;
          }
        };
      },
      setRefreshBlocked(blocked) {
        registrationRef.current.blocked = blocked;
      }
    }),
    []
  );

  const contentOffset = refreshing ? 52 : pullDistance > 0 ? Math.min(44, pullDistance * 0.45) : 0;

  return (
    <MobileRefreshContext.Provider value={contextValue}>
      <PullIndicator pullDistance={pullDistance} ready={ready} refreshing={refreshing} />
      <div
        className="min-h-0 flex-1 will-change-transform"
        style={{
          transform: contentOffset > 0 ? `translateY(${contentOffset}px)` : undefined,
          transition: refreshing || pullDistance === 0 ? "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined
        }}
      >
        {children}
      </div>
    </MobileRefreshContext.Provider>
  );
}
