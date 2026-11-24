"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./inspection-dialog.module.css";

/** Reuse the authenticated inspection route, including all of its existing actions. */
export function InspectionDialog({ inspectionId, customer, onClose }: {
  inspectionId: string;
  customer: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const detach = useRef<() => void>(() => {});
  const dirty = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  function close() {
    if (dirty.current && !window.confirm("Close this inspection? Make sure your changes have finished saving. Unsaved changes will be lost.")) return;
    closeRef.current();
  }
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      detach.current();
      element?.close();
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, []);
  function loadedFrame() {
    detach.current();
    setLoaded(true);
    const document = frame.current?.contentDocument;
    if (!document) return;
    const changed = () => { dirty.current = true; };
    // Escape inside the frame does not reach the outer dialog. Respect nested dialogs/menus first.
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('dialog[open], [aria-modal="true"], [aria-expanded="true"]')) return;
      event.preventDefault();
      close();
    };
    document.addEventListener("input", changed, true);
    document.addEventListener("change", changed, true);
    document.addEventListener("submit", changed, true);
    document.addEventListener("keydown", keydown);
    detach.current = () => {
      document.removeEventListener("input", changed, true);
      document.removeEventListener("change", changed, true);
      document.removeEventListener("submit", changed, true);
      document.removeEventListener("keydown", keydown);
    };
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="inspection-popup-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <header className={styles.header}>
      <div><h2 id="inspection-popup-title">Inspection details</h2><p>{customer}</p></div>
      <button type="button" onClick={close} aria-label="Close inspection">Close</button>
    </header>
    {!loaded && <p role="status" className={styles.loading}>Loading inspection...</p>}
    <iframe ref={frame} data-inspection-popup="true" title={`Inspection for ${customer}`}
      src={`/app/admin/inspections/${encodeURIComponent(inspectionId)}`} onLoad={loadedFrame}
      className={styles.frame} />
  </dialog>;
}
