"use client";

import { useRef, useState, type ReactNode } from "react";
import { reviewFieldServiceRequestAction } from "./actions";

export function RequestReviewForm({ children }: { children: ReactNode }) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return <form className="w-full space-y-3 rounded-2xl border border-slate-200 bg-white p-4 xl:max-w-sm" onSubmit={async (event) => {
    event.preventDefault();
    if (busy.current) return;
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submitter instanceof HTMLButtonElement)) return;
    data.set("status", submitter.value);
    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await reviewFieldServiceRequestAction(data);
      setMessage(result.message);
    } catch {
      setMessage("Connection interrupted. Your note is still here. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }}>
    <fieldset className="space-y-3" disabled={pending}>{children}</fieldset>
    {pending ? <p role="status" className="text-sm text-slate-600">Saving...</p> : null}
    {message ? <p role="status" className="text-sm text-slate-700">{message}</p> : null}
  </form>;
}
