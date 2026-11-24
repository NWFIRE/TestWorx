"use client";

import { useRef } from "react";
import { resizedScheduleEnd } from "@testworx/lib/scheduler-shared";
import styles from "./scheduler.module.css";

export function ResizeHandle({ start, end, label, vertical = false, disabled, onPreview, onCommit }: {
  start: string; end: string; label: string; vertical?: boolean; disabled: boolean;
  onPreview: (end: string | null) => void;
  onCommit: (end: string) => void;
}) {
  const drag = useRef<{ coordinate: number; minutesPerPixel: number; end: string; next: string; commit: (end: string) => void } | null>(null);
  return <button type="button" className={vertical ? styles.resizeVertical : styles.resize}
    aria-label={`Resize ${label}`} title="Drag to change duration in 15-minute steps. Arrow keys adjust by 15 minutes."
    disabled={disabled}
    onClick={event => event.stopPropagation()}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary || disabled || drag.current) return;
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.focus({preventScroll:true});
      const timeline = event.currentTarget.closest('[data-day-minutes]') as HTMLElement | null;
      const minutesPerPixel = vertical ? 15 / 16 : Number(timeline?.dataset.dayMinutes) / (timeline?.getBoundingClientRect().width || 1);
      if (!Number.isFinite(minutesPerPixel)) return;
      drag.current = { coordinate: vertical ? event.clientY : event.clientX, minutesPerPixel, end, next: end, commit: onCommit };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const state = drag.current;
      if (!state) return;
      state.next = resizedScheduleEnd(start, state.end, ((vertical ? event.clientY : event.clientX) - state.coordinate) * state.minutesPerPixel);
      onPreview(state.next);
    }}
    onPointerUp={event => {
      const state = drag.current;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      onPreview(null);
      if (state && state.next !== state.end) state.commit(state.next);
    }}
    onPointerCancel={() => { drag.current = null; onPreview(null); }}
    onLostPointerCapture={() => { if (drag.current) { drag.current = null; onPreview(null); } }}
    onKeyDown={event => {
      if (event.key === "Escape") { drag.current = null; onPreview(null); return; }
      if (drag.current) return;
      if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const next = resizedScheduleEnd(start, end, ["ArrowRight", "ArrowDown"].includes(event.key) ? 15 : -15);
      if (next !== end) onCommit(next);
    }}><span aria-hidden="true">{vertical ? "=" : "||"}</span></button>;
}
