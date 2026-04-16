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
  type CSSProperties,
  type MutableRefObject,
  type ReactNode
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { BrandLoader } from "@/app/brand-loader";

const READY_THRESHOLD = 66;
const MAX_PULL_DISTANCE = 124;
const REFRESH_HOLD_MS = 700;
const MIN_VISIBLE_PULL = 3;
const SHOW_REFRESH_DEBUG_STRIP = true;

type RefreshHandler = () => Promise<void> | void;

type MobileRefreshRegistration = {
  refreshHandler: RefreshHandler | null;
  blocked: boolean;
};

type MobileRefreshContextValue = {
  registerRefreshHandler: (handler: RefreshHandler | null) => () => void;
  setRefreshBlocked: (blocked: boolean) => void;
};

type RefreshDebugState = {
  enabled: boolean;
  routeEnabled: boolean;
  blocked: boolean;
  drawerOpen: boolean;
  stage:
    | "idle"
    | "touch-start"
    | "blocked"
    | "pulling"
    | "ready"
    | "refreshing"
    | "complete"
    | "cancelled";
  reason: string | null;
  scrollTop: number;
  pullDistance: number;
  thresholdReached: boolean;
  activeTouch: boolean;
};

declare global {
  interface Window {
    __tradeworxPtrDebug?: RefreshDebugState;
  }
}

const MobileRefreshContext = createContext<MobileRefreshContextValue | null>(null);

function isIPadLikeDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function isTouchRefreshDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const touchCapable = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
  if (!touchCapable) {
    return false;
  }

  if (isIPadLikeDevice()) {
    return true;
  }

  return window.matchMedia("(pointer: coarse), (hover: none)").matches || window.innerWidth <= 1366;
}

function getRefreshIndicatorOffset(container: HTMLElement | null) {
  if (!container) {
    return 6;
  }

  const containerStyle = window.getComputedStyle(container);
  const paddingTop = Number.parseFloat(containerStyle.paddingTop || "0");
  return Math.max(6, Math.min(20, paddingTop * 0.5));
}

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

function isTargetWithinBoundary(target: EventTarget | null, boundary: HTMLElement | null) {
  return target instanceof Node && Boolean(boundary?.contains(target));
}

function getPrimaryScrollTop(container: HTMLElement | null) {
  const documentScrollTop = document.scrollingElement?.scrollTop ?? 0;
  const windowScrollTop = window.scrollY ?? 0;
  return Math.max(container?.scrollTop ?? 0, documentScrollTop, windowScrollTop);
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
  refreshing,
  topOffset
}: {
  pullDistance: number;
  ready: boolean;
  refreshing: boolean;
  topOffset: number;
}) {
  const visible = refreshing || pullDistance > MIN_VISIBLE_PULL;
  const opacity = refreshing ? 1 : Math.min(1, pullDistance / READY_THRESHOLD);
  const translateY = refreshing ? topOffset + 8 : topOffset + Math.min(18, pullDistance / 4.2);
  const style: CSSProperties = {
    opacity,
    transform: `translateY(${translateY}px)`
  };

  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
      style={style}
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

function RefreshDebugStrip({
  state
}: {
  state: RefreshDebugState;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex justify-center lg:bottom-4">
      <div className="w-full max-w-3xl rounded-2xl border-2 border-amber-300 bg-white/96 px-3 py-2.5 text-[11px] font-semibold text-slate-900 shadow-[0_18px_36px_rgba(15,23,42,0.18)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold uppercase tracking-[0.18em] text-amber-700">PTR Debug</span>
          <span>enabled: {state.enabled ? "yes" : "no"}</span>
          <span>route: {state.routeEnabled ? "yes" : "no"}</span>
          <span>blocked: {state.blocked ? "yes" : "no"}</span>
          <span>drawer: {state.drawerOpen ? "open" : "closed"}</span>
          <span>touch: {state.activeTouch ? "active" : "idle"}</span>
          <span>stage: {state.stage}</span>
          <span>scrollTop: {Math.round(state.scrollTop)}</span>
          <span>pull: {Math.round(state.pullDistance)}</span>
          <span>ready: {state.thresholdReached ? "yes" : "no"}</span>
          {state.reason ? <span>reason: {state.reason}</span> : null}
        </div>
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
  gestureRef,
  drawerOpen
}: {
  children: ReactNode;
  containerRef: MutableRefObject<HTMLElement | null>;
  gestureRef?: MutableRefObject<HTMLElement | null>;
  drawerOpen: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const routeEnabled = isSupportedMobileRoute(pathname) && !isBlockedMobileRoute(pathname);
  const [, startTransition] = useTransition();
  const [pullDistance, setPullDistance] = useState(0);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshEnabled, setRefreshEnabled] = useState(false);
  const [indicatorTopOffset, setIndicatorTopOffset] = useState(6);
  const [debugState, setDebugState] = useState<RefreshDebugState>({
    enabled: false,
    routeEnabled,
    blocked: false,
    drawerOpen,
    stage: "idle",
    reason: null,
    scrollTop: 0,
    pullDistance: 0,
    thresholdReached: false,
    activeTouch: false
  });

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
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    setDebugState((current) => ({
      ...current,
      enabled: refreshEnabled,
      routeEnabled,
      blocked: registrationRef.current.blocked,
      drawerOpen,
      thresholdReached: ready,
      pullDistance,
      stage: refreshing ? "refreshing" : current.stage
    }));
  }, [drawerOpen, pullDistance, ready, refreshEnabled, refreshing, routeEnabled]);

  useEffect(() => {
    if (typeof window === "undefined" || !SHOW_REFRESH_DEBUG_STRIP) {
      return;
    }

    window.__tradeworxPtrDebug = debugState;
    window.dispatchEvent(new CustomEvent("tradeworx:ptr-debug", { detail: debugState }));
  }, [debugState]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const pointerQuery = window.matchMedia("(pointer: coarse), (hover: none)");
    const updateEnabled = () => {
      const nextEnabled = isTouchRefreshDevice();
      enabledRef.current = nextEnabled;
      setRefreshEnabled(nextEnabled);
      setIndicatorTopOffset(getRefreshIndicatorOffset(containerRef.current));
      setDebugState((current) => ({
        ...current,
        enabled: nextEnabled
      }));
    };

    updateEnabled();
    window.addEventListener("resize", updateEnabled);
    if (typeof pointerQuery.addEventListener === "function") {
      pointerQuery.addEventListener("change", updateEnabled);
    } else if (typeof pointerQuery.addListener === "function") {
      pointerQuery.addListener(updateEnabled);
    }

    return () => {
      window.removeEventListener("resize", updateEnabled);
      if (typeof pointerQuery.removeEventListener === "function") {
        pointerQuery.removeEventListener("change", updateEnabled);
      } else if (typeof pointerQuery.removeListener === "function") {
        pointerQuery.removeListener(updateEnabled);
      }
    };
  }, [containerRef]);

  const reset = useCallback(() => {
    trackingRef.current = false;
    startYRef.current = 0;
    startXRef.current = 0;
    activeTouchIdRef.current = null;
    activePointerIdRef.current = null;
    setPullDistance(0);
    setReady(false);
    setDebugState((current) => ({
      ...current,
      activeTouch: false,
      pullDistance: 0,
      thresholdReached: false
    }));
  }, []);

  const runRefresh = useCallback(async () => {
    const registeredRefresh = registrationRef.current.refreshHandler;

    setRefreshing(true);
    reset();
    setDebugState((current) => ({
      ...current,
      stage: "refreshing",
      reason: null
    }));

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
        setDebugState((current) => ({
          ...current,
          stage: "complete",
          activeTouch: false
        }));
      }, REFRESH_HOLD_MS);
    }
  }, [reset, router, startTransition]);

  useEffect(() => {
    const container = containerRef.current;
    const gestureTarget = gestureRef?.current ?? container;
    if (!container || !gestureTarget) {
      return;
    }

    const startTracking = (input: {
      target: EventTarget | null;
      clientX: number;
      clientY: number;
      touchId?: number | null;
      pointerId?: number | null;
    }) => {
      const scrollTop = getPrimaryScrollTop(container);
      let blockedReason: string | null = null;

      if (!enabledRef.current) {
        blockedReason = "disabled";
      } else if (!routeEnabled) {
        blockedReason = "route-off";
      } else if (drawerOpen) {
        blockedReason = "drawer-open";
      } else if (registrationRef.current.blocked) {
        blockedReason = "route-blocked";
      } else if (refreshingRef.current) {
        blockedReason = "already-refreshing";
      } else if (!isTargetWithinBoundary(input.target, gestureTarget)) {
        blockedReason = "outside-shell";
      } else if (scrollTop > 0) {
        blockedReason = "not-at-top";
      } else if (isInteractiveTarget(input.target)) {
        blockedReason = "interactive-target";
      } else if (hasHorizontalScrollAncestor(input.target, container)) {
        blockedReason = "horizontal-scroll";
      } else if (hasNestedVerticalScroll(input.target, container)) {
        blockedReason = "nested-scroll";
      }

      if (blockedReason) {
        trackingRef.current = false;
        setDebugState((current) => ({
          ...current,
          stage: "blocked",
          reason: blockedReason,
          scrollTop,
          activeTouch: false
        }));
        return;
      }

      trackingRef.current = true;
      activeTouchIdRef.current = input.touchId ?? null;
      activePointerIdRef.current = input.pointerId ?? null;
      startYRef.current = input.clientY;
      startXRef.current = input.clientX;
      setPullDistance(0);
      setReady(false);
      setDebugState((current) => ({
        ...current,
        stage: "touch-start",
        reason: null,
        scrollTop,
        activeTouch: true,
        pullDistance: 0,
        thresholdReached: false
      }));
    };

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length !== 1) {
        return;
      }

      startTracking({
        target: event.target,
        clientX: touch.clientX,
        clientY: touch.clientY,
        touchId: touch.identifier
      });
    };

    const updatePull = (input: {
      target: EventTarget | null;
      clientX: number;
      clientY: number;
      preventDefault?: () => void;
    }) => {
      if (!trackingRef.current || refreshingRef.current) {
        return;
      }

      const scrollTop = getPrimaryScrollTop(container);
      if (scrollTop > 0) {
        setDebugState((current) => ({
          ...current,
          stage: "cancelled",
          reason: "scroll-left-top",
          scrollTop
        }));
        reset();
        return;
      }

      const deltaX = input.clientX - startXRef.current;
      const deltaY = input.clientY - startYRef.current;

      if (Math.abs(deltaX) > Math.abs(deltaY) * 0.9) {
        setDebugState((current) => ({
          ...current,
          stage: "cancelled",
          reason: "horizontal-gesture",
          scrollTop
        }));
        reset();
        return;
      }

      if (deltaY <= 0) {
        setPullDistance(0);
        setReady(false);
        setDebugState((current) => ({
          ...current,
          stage: "pulling",
          reason: "reverse-or-upward",
          scrollTop,
          pullDistance: 0,
          thresholdReached: false
        }));
        return;
      }

      const resistedDistance = Math.min(MAX_PULL_DISTANCE, deltaY * 0.5 + Math.sqrt(deltaY) * 1.55);
      setPullDistance(resistedDistance);
      setReady(resistedDistance >= READY_THRESHOLD);
      setDebugState((current) => ({
        ...current,
        stage: resistedDistance >= READY_THRESHOLD ? "ready" : "pulling",
        reason: null,
        scrollTop,
        pullDistance: resistedDistance,
        thresholdReached: resistedDistance >= READY_THRESHOLD,
        activeTouch: true
      }));
      input.preventDefault?.();
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = Array.from(event.touches).find((entry) => entry.identifier === activeTouchIdRef.current);
      if (!touch) {
        setDebugState((current) => ({
          ...current,
          stage: "cancelled",
          reason: "touch-lost"
        }));
        reset();
        return;
      }

      updatePull({
        target: event.target,
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => event.preventDefault()
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        return;
      }

      startTracking({
        target: event.target,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || activePointerIdRef.current !== event.pointerId) {
        return;
      }

      updatePull({
        target: event.target,
        clientX: event.clientX,
        clientY: event.clientY,
        preventDefault: () => event.preventDefault()
      });
    };

    const handleTouchEnd = () => {
      if (!trackingRef.current) {
        return;
      }

      if (readyRef.current && !refreshingRef.current) {
        void runRefresh();
        return;
      }

      setDebugState((current) => ({
        ...current,
        stage: "cancelled",
        reason: "released-before-threshold"
      }));
      reset();
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || activePointerIdRef.current !== event.pointerId) {
        return;
      }

      handleTouchEnd();
    };

    const handleScroll = () => {
      if (getPrimaryScrollTop(container) > 0 && !refreshingRef.current) {
        setDebugState((current) => ({
          ...current,
          stage: current.activeTouch ? "cancelled" : current.stage,
          reason: current.activeTouch ? "container-scrolled" : current.reason,
          scrollTop: getPrimaryScrollTop(container)
        }));
        reset();
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });
    document.addEventListener("pointerdown", handlePointerDown, { passive: true, capture: true });
    document.addEventListener("pointermove", handlePointerMove, { passive: false, capture: true });
    container.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true, capture: true });
    document.addEventListener("pointerup", handlePointerEnd, { passive: true, capture: true });
    document.addEventListener("pointercancel", handlePointerEnd, { passive: true, capture: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart, true);
      document.removeEventListener("touchmove", handleTouchMove, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      container.removeEventListener("scroll", handleScroll);
      document.removeEventListener("touchend", handleTouchEnd, true);
      document.removeEventListener("touchcancel", handleTouchEnd, true);
      document.removeEventListener("pointerup", handlePointerEnd, true);
      document.removeEventListener("pointercancel", handlePointerEnd, true);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [containerRef, drawerOpen, gestureRef, reset, routeEnabled, runRefresh]);

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
  const showRefreshAffordance = refreshEnabled && routeEnabled && !drawerOpen;

  return (
    <MobileRefreshContext.Provider value={contextValue}>
      <div className="relative min-h-0 flex-1 overflow-visible">
        {SHOW_REFRESH_DEBUG_STRIP ? <RefreshDebugStrip state={debugState} /> : null}
        <PullIndicator pullDistance={pullDistance} ready={ready} refreshing={refreshing} topOffset={indicatorTopOffset} />
        {showRefreshAffordance ? (
          <button
            aria-label={refreshing ? "Refreshing current view" : "Refresh current view"}
            className="absolute right-3 top-3 z-10 inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[color:var(--border-default)] bg-white/94 text-[color:var(--text-secondary)] shadow-[0_12px_24px_rgba(15,23,42,0.08)] backdrop-blur transition hover:text-slate-950 disabled:cursor-wait disabled:opacity-70"
            disabled={refreshing}
            onClick={() => {
              if (!refreshingRef.current) {
                void runRefresh();
              }
            }}
            type="button"
          >
            {refreshing ? (
              <BrandLoader label="Refreshing" size="sm" tone="muted" />
            ) : (
              <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
                <path
                  d="M13 8a5 5 0 1 1-1.46-3.54M13 3.5v3.25H9.75"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.65"
                />
              </svg>
            )}
          </button>
        ) : null}
        <div
          className="min-h-0 flex-1 will-change-transform"
          style={{
            transform: contentOffset > 0 ? `translateY(${contentOffset}px)` : undefined,
            transition: refreshing || pullDistance === 0 ? "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined
          }}
        >
          {children}
        </div>
      </div>
    </MobileRefreshContext.Provider>
  );
}
