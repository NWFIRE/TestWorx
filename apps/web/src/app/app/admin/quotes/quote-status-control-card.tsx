"use client";

import { useState, useTransition } from "react";
import { QuoteStatus } from "@prisma/client";

import { ActionButton } from "@/app/action-button";
import { useToast } from "@/app/toast-provider";
import { quoteStatusLabels } from "@testworx/lib";

import { updateQuoteStatusAction } from "./actions";

export function QuoteStatusControlCard({
  quoteId,
  status
}: {
  quoteId: string;
  status: QuoteStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [selectedStatus, setSelectedStatus] = useState<QuoteStatus>(status);
  const [note, setNote] = useState("");
  const { showToast } = useToast();

  function handleSave() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("quoteId", quoteId);
      formData.set("status", selectedStatus);
      formData.set("note", note);

      const result = await updateQuoteStatusAction(formData);
      if (result?.ok) {
        setNote("");
        showToast({ title: result.message ?? "Quote status updated", tone: "success" });
      } else if (result?.error) {
        showToast({ title: result.error, tone: "error" });
      }
    });
  }

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <h2 className="text-xl font-semibold text-slate-950">Manual status control</h2>
      <div className="mt-4 space-y-3">
        <select className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900" onChange={(event) => setSelectedStatus(event.target.value as QuoteStatus)} value={selectedStatus}>
          {Object.values(QuoteStatus).map((statusOption) => (
            <option key={statusOption} value={statusOption}>
              {quoteStatusLabels[statusOption]}
            </option>
          ))}
        </select>
        <textarea
          className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note for the audit trail"
          value={note}
        />
        <ActionButton className="w-full" onClick={handleSave} pending={pending} pendingLabel="Updating...">
          Update quote status
        </ActionButton>
      </div>
    </section>
  );
}
