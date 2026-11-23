"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";

export function BillingLineForm({ children, className, saveAction, removeAction }: {
  children: ReactNode;
  className?: string;
  saveAction: (data: FormData) => Promise<void>;
  removeAction: (data: FormData) => Promise<void>;
}) {
  const [result, setResult] = useState<{ error?: string; message?: string }>({});
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    submitting.current = true;
    // React form actions reset uncontrolled fields even when a caught save fails.
    // Handle submission explicitly so a failed request retains the user's edits.
    startTransition(async () => {
      try {
        const remove = data.get("intent") === "remove";
        await (remove ? removeAction : saveAction)(data);
        setResult({ message: remove ? "Line removed." : "Billing line saved." });
      } catch (error) {
        setResult({ error: error instanceof Error ? error.message : "Unable to save this line. Try again." });
      } finally {
        submitting.current = false;
      }
    });
  }

  return <form onSubmit={submit}>
    <fieldset disabled={pending} className={`${className ?? ""} disabled:opacity-60`}>
      {children}
    </fieldset>
    <p role={result.error ? "alert" : "status"} className={`mt-2 text-sm ${result.error ? "text-rose-700" : "text-emerald-700"}`}>
      {pending ? "Saving..." : result.error ?? result.message}
    </p>
  </form>;
}
