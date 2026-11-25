"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CustomerOption, SiteOption, TechnicianOption } from "@testworx/types";
import { createInspectionAction } from "../actions";
import { InspectionSchedulerForm } from "../inspection-scheduler-form";
import styles from "./create-job-dialog.module.css";

export type CreateJobOptions = {
  customers: CustomerOption[];
  sites: SiteOption[];
  technicians: TechnicianOption[];
};

export function CreateJobDialog({ options, date, onClose, onCreated }: {
  options?: CreateJobOptions;
  date: string;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loadedOptions, setLoadedOptions] = useState(options ?? null);
  const [optionsError, setOptionsError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (options) return;
    const controller = new AbortController();
    void fetch("/api/admin/inspections/create-options", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Unable to load inspection options. Please retry.");
        const value = await response.json() as CreateJobOptions;
        if (!controller.signal.aborted) setLoadedOptions(value);
      }).catch(error => { if (!controller.signal.aborted) setOptionsError(error.message); });
    return () => controller.abort();
  }, [options, retry]);
  const [uploadFailure, setUploadFailure] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, []);
  function close() {
    if (busy) return;
    if (!uploadFailure && dirty.current && !window.confirm("Discard this unfinished inspection?")) return;
    onClose();
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="create-job-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <header className={styles.header}>
      <h2 id="create-job-title">Create inspection</h2>
      <button type="button" disabled={busy} onClick={close}>Close</button>
    </header>
    <div className={styles.content} onChangeCapture={() => { dirty.current = true; }}
      onClickCapture={event => { if ((event.target as HTMLElement).closest('button, [role="option"]')) dirty.current = true; }}>
      {uploadFailure ? <div role="alert">
        <h3>Inspection created; PDFs need attention</h3>
        <p>{uploadFailure.message}</p>
        <p>Your inspection was saved. Do not create it again. Upload the PDFs from its details.</p>
        <Link href={`/app/admin/inspections/${uploadFailure.id}`}>Open created inspection</Link>
      </div> : !loadedOptions ? <div role={optionsError ? "alert" : "status"}>
        {optionsError || "Loading inspection options..."}
        {optionsError ? <button type="button" onClick={() => { setOptionsError(""); setRetry(value => value + 1); }}>Retry</button> : null}
      </div> : <InspectionSchedulerForm
        {...loadedOptions} action={createInspectionAction} title="Create inspection" submitLabel="Create inspection"
        allowCustomOneTimeSite allowDocumentUpload autoSelectGenericSiteOnCustomerChange
        initiallyScheduled stayOnPage
        initialValues={{ inspectionMonth: date.slice(0, 7), scheduledStart: `${date}T09:00` }}
        onBusyChange={setBusy}
        onSuccess={result => {
          window.dispatchEvent(new Event("field-request-reviewed"));
          onCreated(result.success || "Inspection created.");
          onClose();
        }}
        onUploadError={(id, message) => {
          setBusy(false);
          setUploadFailure({ id, message });
          onCreated("Inspection created; PDFs still need to be uploaded.");
        }}
      />}
    </div>
  </dialog>;
}
