"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { formatQuoteReminderStage, quoteReminderTypeLabels } from "@testworx/lib";

import { ActionButton } from "@/app/action-button";
import { useToast } from "@/app/toast-provider";

import { sendQuoteReminderNowAction, updateQuoteReminderControlAction } from "./actions";

type QuoteReminderDispatchRecord = {
  id: string;
  reminderType: string;
  status: string;
  recipientEmail: string | null;
  sentAt: Date | null;
  attemptedAt: Date | null;
  error: string | null;
};

function formatDateTime(value: Date | null | undefined) {
  return value ? format(value, "MMM d, yyyy h:mm a") : "—";
}

export function QuoteReminderAutomationCard({
  quoteId,
  remindersPausedAt,
  remindersEnabled,
  nextReminderAt,
  reminderStage,
  lastReminderAt,
  reminderDispatches
}: {
  quoteId: string;
  remindersPausedAt: Date | null;
  remindersEnabled: boolean;
  nextReminderAt: Date | null;
  reminderStage: string | null;
  lastReminderAt: Date | null;
  reminderDispatches: QuoteReminderDispatchRecord[];
}) {
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [state, setState] = useState({
    remindersPausedAt,
    remindersEnabled,
    nextReminderAt,
    reminderStage,
    lastReminderAt,
    reminderDispatches
  });
  const { showToast } = useToast();

  function runAction(key: string, reminderAction?: "pause" | "resume" | "disable" | "enable") {
    setActiveAction(key);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("quoteId", quoteId);
      if (reminderAction) {
        formData.set("reminderAction", reminderAction);
      }

      const result = reminderAction
        ? await updateQuoteReminderControlAction(formData)
        : await sendQuoteReminderNowAction(formData);

      if (result?.ok && result.detail) {
        setState({
          remindersPausedAt: result.detail.remindersPausedAt,
          remindersEnabled: result.detail.remindersEnabled,
          nextReminderAt: result.detail.nextReminderAt,
          reminderStage: result.detail.reminderStage,
          lastReminderAt: result.detail.lastReminderAt,
          reminderDispatches: result.detail.reminderDispatches
        });
        showToast({ title: result.message ?? "Reminder updated", tone: "success" });
      } else if (result?.error) {
        showToast({ title: result.error, tone: "error" });
      }

      setActiveAction(null);
    });
  }

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <h2 className="text-xl font-semibold text-slate-950">Reminder automation</h2>
      <p className="mt-2 text-sm text-slate-500">Control quote follow-up without interrupting the hosted approval workflow. Automatic reminders stop when quotes are approved, declined, cancelled, expired, or converted.</p>
      <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
        <p><span className="font-semibold text-slate-950">Automation:</span> {state.remindersPausedAt ? "Paused" : state.remindersEnabled ? "Enabled" : "Disabled"}</p>
        <p><span className="font-semibold text-slate-950">Next reminder:</span> {formatDateTime(state.nextReminderAt)}</p>
        <p><span className="font-semibold text-slate-950">Reminder stage:</span> {formatQuoteReminderStage(state.reminderStage)}</p>
        <p><span className="font-semibold text-slate-950">Last reminder:</span> {formatDateTime(state.lastReminderAt)}</p>
      </div>
      <div className="mt-4 grid gap-3">
        <ActionButton className="w-full" onClick={() => runAction("send")} pending={pending && activeAction === "send"} pendingLabel="Sending..." tone="primary">
          Send reminder now
        </ActionButton>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionButton onClick={() => runAction("pause", state.remindersPausedAt ? "resume" : "pause")} pending={pending && activeAction === "pause"} pendingLabel={state.remindersPausedAt ? "Resuming..." : "Pausing..."}>
            {state.remindersPausedAt ? "Resume reminders" : "Pause reminders"}
          </ActionButton>
          <ActionButton onClick={() => runAction("enabled", state.remindersEnabled ? "disable" : "enable")} pending={pending && activeAction === "enabled"} pendingLabel={state.remindersEnabled ? "Disabling..." : "Enabling..."}>
            {state.remindersEnabled ? "Disable reminders" : "Enable reminders"}
          </ActionButton>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <p className="text-sm font-semibold text-slate-950">Reminder history</p>
        {state.reminderDispatches.length === 0 ? (
          <p className="text-sm text-slate-500">No reminder activity recorded yet.</p>
        ) : state.reminderDispatches.map((dispatch) => (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4" key={dispatch.id}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{quoteReminderTypeLabels[dispatch.reminderType as keyof typeof quoteReminderTypeLabels] ?? dispatch.reminderType.replaceAll("_", " ")}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{dispatch.status}</p>
            </div>
            <p className="mt-1 text-sm text-slate-500">Recipient: {dispatch.recipientEmail ?? "—"}</p>
            <p className="mt-1 text-sm text-slate-500">Sent: {dispatch.sentAt ? formatDateTime(dispatch.sentAt) : dispatch.attemptedAt ? formatDateTime(dispatch.attemptedAt) : "—"}</p>
            {dispatch.error ? <p className="mt-1 text-sm text-rose-600">{dispatch.error}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
