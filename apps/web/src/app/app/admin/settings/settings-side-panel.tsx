"use client";

import { useId, useRef, type ReactNode } from "react";

export function SettingsSidePanel({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  return (
    <>
      <button ref={trigger} type="button" aria-haspopup="dialog"
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-4 text-left transition hover:bg-slate-50 focus-visible:outline-blue-500"
        onClick={() => dialog.current?.showModal()}>
        <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span>
        <span aria-hidden="true" className="text-slate-400">&rsaquo;</span>
      </button>
      <dialog ref={dialog} aria-labelledby={titleId}
        className="fixed inset-y-0 left-auto right-0 m-0 h-[100dvh] max-h-[100dvh] w-full max-w-2xl overscroll-contain border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/30"
        onClose={() => trigger.current?.focus({ preventScroll: true })}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right) event.currentTarget.close();
        }}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button type="button" aria-label={`Close ${title}`} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-medium" onClick={() => dialog.current?.close()}>Close</button>
        </div>
        <div className="min-w-0 p-4 sm:p-6 [&>form]:p-0 [&>form]:shadow-none">{children}</div>
      </dialog>
    </>
  );
}
