"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const READY_THRESHOLD = 72;
const MAX_PULL_DISTANCE = 108;

function getScrollTop() {
  if (typeof document === "undefined") {
    return 0;
  }

  return document.scrollingElement?.scrollTop ?? window.scrollY ?? 0;
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
  const visible = refreshing || pullDistance > 4;
  const opacity = refreshing ? 1 : Math.min(1, pullDistance / READY_THRESHOLD);
  const offsetY = refreshing ? 14 : Math.min(18, pullDistance / 3);

  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{ opacity, transform: `translateY(${offsetY}px)` }}
    >
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 shadow-lg shadow-slate-900/10 backdrop-blur">
        {refreshing ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[rgb(var(--tenant-primary-rgb))]" />
        ) : (
          <span
            className="text-sm font-semibold text-[rgb(var(--tenant-primary-rgb))] transition-transform duration-150"
            style={{ transform: ready ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            ↓
          </span>
        )}
        <span className="text-xs font-medium text-slate-600">
          {refreshing ? "Refreshing" : ready ? "Release to refresh" : "Pull to refresh"}
        </span>
      </div>
    </div>
  );
}

export function MobilePullToRefresh() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pullDistance, setPullDistance] = useState(0);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const enabledRef = useRef(false);
  const trackingRef = useRef(false);
  const startYRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const readyRef = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(pointer: coarse) and (max-width: 1024px)");
    const updateEnabled = () => {
      enabledRef.current = mediaQuery.matches;
    };

    updateEnabled();
    mediaQuery.addEventListener("change", updateEnabled);

    const reset = () => {
      trackingRef.current = false;
      startYRef.current = 0;
      setPullDistance(0);
      setReady(false);
    };

    const beginRefresh = () => {
      setRefreshing(true);
      reset();
      startTransition(() => {
        router.refresh();
      });

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setRefreshing(false);
      }, 900);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (!enabledRef.current || refreshingRef.current || event.touches.length !== 1 || getScrollTop() > 0) {
        trackingRef.current = false;
        return;
      }

      trackingRef.current = true;
      startYRef.current = event.touches[0]?.clientY ?? 0;
      setPullDistance(0);
      setReady(false);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!trackingRef.current || refreshingRef.current) {
        return;
      }

      if (event.touches.length !== 1) {
        reset();
        return;
      }

      if (getScrollTop() > 0) {
        reset();
        return;
      }

      const currentY = event.touches[0]?.clientY ?? 0;
      const deltaY = currentY - startYRef.current;
      if (deltaY <= 0) {
        setPullDistance(0);
        setReady(false);
        return;
      }

      const resistedDistance = Math.min(MAX_PULL_DISTANCE, deltaY * 0.5);
      setPullDistance(resistedDistance);
      setReady(resistedDistance >= READY_THRESHOLD);
      event.preventDefault();
    };

    const handleTouchEnd = () => {
      if (!trackingRef.current) {
        return;
      }

      if (readyRef.current && !refreshingRef.current) {
        beginRefresh();
        return;
      }

      reset();
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      mediaQuery.removeEventListener("change", updateEnabled);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [router]);

  return <PullIndicator pullDistance={pullDistance} ready={ready} refreshing={refreshing} />;
}
