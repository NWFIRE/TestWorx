"use client";

import { useActionState, type ReactNode } from "react";

export function BillingLineForm({ children, className, saveAction, removeAction }: {
  children: ReactNode;
  className?: string;
  saveAction: (data: FormData) => Promise<void>;
  removeAction: (data: FormData) => Promise<void>;
}) {
  const [result, action, pending] = useActionState<{ error?: string; message?: string }, FormData>(async (_previous, data) => {
    try {
      const remove = data.get("intent") === "remove";
      await (remove ? removeAction : saveAction)(data);
      return { message: remove ? "Line removed." : "Billing line saved." };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to save this line. Try again." };
    }
  }, {});

  return <form action={action}>
    <fieldset disabled={pending} className={`${className ?? ""} disabled:opacity-60`}>
      {children}
    </fieldset>
    <p role={result.error ? "alert" : "status"} className={`mt-2 text-sm ${result.error ? "text-rose-700" : "text-emerald-700"}`}>
      {pending ? "Saving..." : result.error ?? result.message}
    </p>
  </form>;
}
