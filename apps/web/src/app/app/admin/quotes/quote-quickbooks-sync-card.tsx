"use client";

import { useState, useTransition } from "react";

import { ActionButton } from "@/app/action-button";
import { useToast } from "@/app/toast-provider";

import { syncQuoteAction } from "./actions";

export function QuoteQuickBooksSyncCard({
  quoteId,
  quickbooksEstimateId,
  lineItems
}: {
  quoteId: string;
  quickbooksEstimateId: string | null;
  lineItems: Array<{
    id: string;
    title: string;
    mappingState: { status: string; reason?: string | null; suggestions: Array<{ qbItemName: string }> };
  }>;
}) {
  const [pending, startTransition] = useTransition();
  const [estimateId, setEstimateId] = useState(quickbooksEstimateId);
  const { showToast } = useToast();

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <h2 className="text-xl font-semibold text-slate-950">QuickBooks sync</h2>
      <p className="mt-2 text-sm text-slate-500">Sync this quote as a QuickBooks estimate using stored item ids and the cached item catalog.</p>
      <ActionButton
        className="mt-4 w-full"
        onClick={() => startTransition(async () => {
          const formData = new FormData();
          formData.set("quoteId", quoteId);
          const result = await syncQuoteAction(formData);
          if (result?.ok && result.detail) {
            setEstimateId(result.detail.quickbooksEstimateId);
            showToast({ title: result.message ?? "Quote synced to QuickBooks", tone: "success" });
          } else if (result?.error) {
            showToast({ title: result.error, tone: "error" });
          }
        })}
        pending={pending}
        pendingLabel="Syncing..."
      >
        {estimateId ? "Resync estimate" : "Sync to QuickBooks"}
      </ActionButton>
      {lineItems.some((line) => line.mappingState.status === "needs_mapping") ? (
        <div className="mt-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
          <p className="font-semibold">QuickBooks mapping attention</p>
          {lineItems
            .filter((line) => line.mappingState.status === "needs_mapping")
            .map((line) => (
              <p key={line.id}>
                {line.title}: {line.mappingState.reason?.replaceAll("_", " ") ?? "needs mapping"}
                {line.mappingState.suggestions.length > 0 ? ` • Suggestions: ${line.mappingState.suggestions.slice(0, 3).map((item) => item.qbItemName).join(", ")}` : ""}
              </p>
            ))}
        </div>
      ) : null}
    </section>
  );
}
