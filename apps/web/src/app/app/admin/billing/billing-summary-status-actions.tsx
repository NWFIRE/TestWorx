"use client";

import { useFormStatus } from "react-dom";

type BillingSummaryStatusActionsProps = {
  summaryId: string;
  inspectionId: string;
  summaryStatus: "draft" | "reviewed" | "invoiced";
  quickbooksSendStatus: "not_sent" | "sent" | "send_failed" | "send_skipped";
  hasVerifiedQuickBooksInvoice: boolean;
  canUseQuickBooksActions: boolean;
  hasMissingPrices: boolean;
  summaryModeMismatch: boolean;
  syncBillingSummaryToQuickBooksAction: (formData: FormData) => void | Promise<void>;
  sendQuickBooksInvoiceAction: (formData: FormData) => void | Promise<void>;
  updateBillingSummaryStatusAction: (formData: FormData) => void | Promise<void>;
};

function BillingActionButton({
  idleLabel,
  pendingLabel,
  tone = "secondary",
  disabled = false,
  active = false
}: {
  idleLabel: string;
  pendingLabel: string;
  tone?: "primary" | "secondary";
  disabled?: boolean;
  active?: boolean;
}) {
  const { pending } = useFormStatus();
  const baseClass = tone === "primary"
    ? "bg-slateblue text-white"
    : active
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border border-slate-200 text-slateblue";

  return (
    <button
      className={`pressable ${tone === "primary" ? "pressable-filled" : ""} inline-flex min-h-11 w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${baseClass}`}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function BillingSummaryStatusActions({
  summaryId,
  inspectionId,
  summaryStatus,
  quickbooksSendStatus,
  hasVerifiedQuickBooksInvoice,
  canUseQuickBooksActions,
  hasMissingPrices,
  summaryModeMismatch,
  syncBillingSummaryToQuickBooksAction,
  sendQuickBooksInvoiceAction,
  updateBillingSummaryStatusAction
}: BillingSummaryStatusActionsProps) {
  return (
    <div className="mt-4 grid gap-3">
      <form action={syncBillingSummaryToQuickBooksAction}>
        <input name="inspectionId" type="hidden" value={inspectionId} />
        <BillingActionButton
          disabled={hasVerifiedQuickBooksInvoice || hasMissingPrices || !canUseQuickBooksActions}
          idleLabel={hasVerifiedQuickBooksInvoice ? "Already synced to QuickBooks" : "Sync invoice to QuickBooks"}
          pendingLabel="Syncing invoice..."
          tone="primary"
        />
      </form>
      {hasVerifiedQuickBooksInvoice && !summaryModeMismatch && canUseQuickBooksActions && quickbooksSendStatus !== "sent" ? (
        <form action={sendQuickBooksInvoiceAction}>
          <input name="inspectionId" type="hidden" value={inspectionId} />
          <BillingActionButton
            idleLabel={quickbooksSendStatus === "send_failed" ? "Retry QuickBooks send" : quickbooksSendStatus === "send_skipped" ? "Send from QuickBooks" : "Send from QuickBooks"}
            pendingLabel="Sending invoice..."
          />
        </form>
      ) : null}
      <form action={updateBillingSummaryStatusAction}>
        <input name="summaryId" type="hidden" value={summaryId} />
        <input name="inspectionId" type="hidden" value={inspectionId} />
        <input name="status" type="hidden" value="draft" />
        <BillingActionButton
          active={summaryStatus === "draft"}
          idleLabel={summaryStatus === "draft" ? "Currently draft" : "Move to draft"}
          pendingLabel="Moving to draft..."
        />
      </form>
      <form action={updateBillingSummaryStatusAction}>
        <input name="summaryId" type="hidden" value={summaryId} />
        <input name="inspectionId" type="hidden" value={inspectionId} />
        <input name="status" type="hidden" value="reviewed" />
        <BillingActionButton
          active={summaryStatus === "reviewed"}
          idleLabel={summaryStatus === "reviewed" ? "Currently reviewed" : "Mark reviewed"}
          pendingLabel="Marking reviewed..."
        />
      </form>
      <form action={updateBillingSummaryStatusAction}>
        <input name="summaryId" type="hidden" value={summaryId} />
        <input name="inspectionId" type="hidden" value={inspectionId} />
        <input name="status" type="hidden" value="reviewed" />
        <BillingActionButton
          idleLabel="Create invoice draft"
          pendingLabel="Creating invoice draft..."
        />
      </form>
      <form action={updateBillingSummaryStatusAction}>
        <input name="summaryId" type="hidden" value={summaryId} />
        <input name="inspectionId" type="hidden" value={inspectionId} />
        <input name="status" type="hidden" value="invoiced" />
        <BillingActionButton
          active={summaryStatus === "invoiced"}
          idleLabel={summaryStatus === "invoiced" ? "Currently invoiced" : "Mark invoiced"}
          pendingLabel="Marking invoiced..."
          tone="primary"
        />
      </form>
      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Buttons show progress immediately while TradeWorx saves the action. The current summary status stays highlighted after the page reloads.
      </p>
    </div>
  );
}
