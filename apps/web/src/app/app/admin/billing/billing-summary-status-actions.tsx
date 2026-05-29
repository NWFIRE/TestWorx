"use client";

import { useState, useTransition } from "react";

import { ActionButton } from "@/app/action-button";
import { useToast } from "@/app/toast-provider";
import { buildQuickBooksInvoiceAppUrl } from "@testworx/lib";

type BillingSummaryActionResult = {
  ok: boolean;
  error: string | null;
  message: string | null;
  detail: {
    status: "draft" | "reviewed" | "invoiced";
    quickbooksSyncStatus: string | null;
    quickbooksInvoiceNumber: string | null;
    quickbooksInvoiceId: string | null;
    quickbooksConnectionMode: string | null;
    quickbooksSyncedAt: Date | null;
    quickbooksSendStatus: string | null;
    quickbooksSentAt: Date | null;
    quickbooksSyncError: string | null;
    quickbooksSendError: string | null;
  } | null;
};

type BillingSummaryStatusActionsProps = {
  summaryId: string;
  inspectionId: string;
  summaryStatus: "draft" | "reviewed" | "invoiced";
  quickbooksSyncStatus: string | null;
  quickbooksSendStatus: "not_sent" | "sent" | "send_failed" | "send_skipped";
  quickbooksInvoiceNumber: string | null;
  quickbooksInvoiceId: string | null;
  quickbooksMode: "sandbox" | "live" | null;
  quickbooksAppModeLabel: string;
  connectedCompany: string | null;
  connectedRealm: string | null;
  quickbooksSyncedAt: Date | null;
  quickbooksSentAt: Date | null;
  quickbooksSyncError: string | null;
  quickbooksSendError: string | null;
  canUseQuickBooksActions: boolean;
  hasMissingPrices: boolean;
  summaryModeMismatch: boolean;
  syncBillingSummaryToQuickBooksAction: (formData: FormData) => Promise<BillingSummaryActionResult>;
  sendQuickBooksInvoiceAction: (formData: FormData) => Promise<BillingSummaryActionResult>;
  updateBillingSummaryStatusAction: (formData: FormData) => Promise<BillingSummaryActionResult>;
};

function formatDateTime(value: Date | null) {
  return value ? value.toLocaleString() : "Not synced";
}

function formatQuickBooksSendStatus(status: string | null) {
  switch (status) {
    case "sent":
      return "sent";
    case "send_failed":
      return "send failed";
    case "send_skipped":
      return "send skipped";
    case "not_sent":
    default:
      return "not sent";
  }
}

function formatQuickBooksSyncStatus(status: string | null) {
  switch (status) {
    case "synced":
      return "synced";
    case "sent":
      return "sent";
    case "action_required":
      return "action required";
    case "failed":
      return "sync failed";
    case "not_synced":
    case null:
    default:
      return "not synced";
  }
}

export function BillingSummaryStatusActions({
  summaryId,
  inspectionId,
  summaryStatus,
  quickbooksSyncStatus,
  quickbooksSendStatus,
  quickbooksInvoiceNumber,
  quickbooksInvoiceId,
  quickbooksMode,
  quickbooksAppModeLabel,
  connectedCompany,
  connectedRealm,
  quickbooksSyncedAt,
  quickbooksSentAt,
  quickbooksSyncError,
  quickbooksSendError,
  canUseQuickBooksActions,
  hasMissingPrices,
  summaryModeMismatch,
  syncBillingSummaryToQuickBooksAction,
  sendQuickBooksInvoiceAction,
  updateBillingSummaryStatusAction
}: BillingSummaryStatusActionsProps) {
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [state, setState] = useState({
    summaryStatus,
    quickbooksSyncStatus,
    quickbooksSendStatus,
    quickbooksInvoiceNumber,
    quickbooksInvoiceId,
    quickbooksMode,
    quickbooksSyncedAt,
    quickbooksSentAt,
    quickbooksSyncError,
    quickbooksSendError
  });
  const { showToast } = useToast();

  function applyDetail(detail: BillingSummaryActionResult["detail"]) {
    if (!detail) {
      return;
    }

    setState({
      summaryStatus: detail.status,
      quickbooksSyncStatus: detail.quickbooksSyncStatus,
      quickbooksSendStatus: detail.quickbooksSendStatus === "sent" || detail.quickbooksSendStatus === "send_failed" || detail.quickbooksSendStatus === "send_skipped" ? detail.quickbooksSendStatus : "not_sent",
      quickbooksInvoiceNumber: detail.quickbooksInvoiceNumber,
      quickbooksInvoiceId: detail.quickbooksInvoiceId,
      quickbooksMode: detail.quickbooksConnectionMode === "sandbox" || detail.quickbooksConnectionMode === "live" ? detail.quickbooksConnectionMode : null,
      quickbooksSyncedAt: detail.quickbooksSyncedAt,
      quickbooksSentAt: detail.quickbooksSentAt,
      quickbooksSyncError: detail.quickbooksSyncError,
      quickbooksSendError: detail.quickbooksSendError
    });
  }

  function runAction(actionKey: string, buildFormData: () => FormData, action: (formData: FormData) => Promise<BillingSummaryActionResult>) {
    setActiveAction(actionKey);
    startTransition(async () => {
      const result = await action(buildFormData());
      if (result?.ok) {
        applyDetail(result.detail);
        const sendFailed = result.detail?.quickbooksSendStatus === "send_failed";
        showToast({
          title: result.message ?? "Billing updated",
          tone: sendFailed ? "error" : "success",
          durationMs: sendFailed ? 8500 : undefined
        });
      } else if (result?.error) {
        applyDetail(result.detail);
        showToast({ title: result.error, tone: "error" });
      }
      setActiveAction(null);
    });
  }

  const hasVerifiedQuickBooksInvoice = Boolean(state.quickbooksInvoiceId && ["synced", "sent"].includes(state.quickbooksSyncStatus ?? ""));
  const openQuickBooksUrl = state.quickbooksInvoiceId && !summaryModeMismatch && canUseQuickBooksActions
    ? buildQuickBooksInvoiceAppUrl(state.quickbooksInvoiceId, state.quickbooksMode)
    : null;

  return (
    <>
      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
        <p>QuickBooks app mode: <span className="font-semibold text-ink">{quickbooksAppModeLabel}</span></p>
        <p className="mt-2">Connected company: <span className="font-semibold text-ink">{connectedCompany ?? "Not connected"}</span></p>
        <p className="mt-2">Connected realm: <span className="font-semibold text-ink">{connectedRealm ?? "Not connected"}</span></p>
        <p className="mt-2">QuickBooks sync: <span className="font-semibold text-ink">{formatQuickBooksSyncStatus(state.quickbooksSyncStatus)}</span></p>
        <p className="mt-2">Invoice number: <span className="font-semibold text-ink">{state.quickbooksInvoiceNumber ?? "Not synced"}</span></p>
        <p className="mt-2">Invoice id: <span className="font-semibold text-ink">{state.quickbooksInvoiceId ?? "Not synced"}</span></p>
        <p className="mt-2">Invoice mode: <span className="font-semibold text-ink">{state.quickbooksMode ? (state.quickbooksMode === "sandbox" ? "Sandbox" : "Live") : "Not recorded"}</span></p>
        <p className="mt-2">Synced at: <span className="font-semibold text-ink">{formatDateTime(state.quickbooksSyncedAt)}</span></p>
        <p className="mt-2">QuickBooks send: <span className="font-semibold text-ink">{formatQuickBooksSendStatus(state.quickbooksSendStatus)}</span></p>
        <p className="mt-2">Sent at: <span className="font-semibold text-ink">{state.quickbooksSentAt ? state.quickbooksSentAt.toLocaleString() : "Not sent"}</span></p>
        {state.quickbooksSyncError ? <p className="mt-2 break-words text-rose-700">Last sync error: {state.quickbooksSyncError}</p> : null}
        {state.quickbooksSendError ? <p className="mt-2 break-words text-amber-700">Last send note: {state.quickbooksSendError}</p> : null}
      </div>

      <div className="mt-4 grid gap-3">
        {!hasVerifiedQuickBooksInvoice ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
            Choose Sync Only to create the QuickBooks invoice without emailing the customer. Use Sync and send only when you are ready for QuickBooks to deliver it.
          </p>
        ) : null}
        <ActionButton
          className="w-full"
          disabled={hasVerifiedQuickBooksInvoice || hasMissingPrices || !canUseQuickBooksActions}
          onClick={() => runAction("sync", () => {
            const formData = new FormData();
            formData.set("inspectionId", inspectionId);
            formData.set("deliveryMode", "sync_only");
            return formData;
          }, syncBillingSummaryToQuickBooksAction)}
          pending={pending && activeAction === "sync"}
          pendingLabel="Syncing invoice..."
          tone="primary"
        >
          {hasVerifiedQuickBooksInvoice
            ? state.quickbooksSendStatus === "sent"
              ? "Synced and sent from QuickBooks"
              : state.quickbooksSendStatus === "send_failed"
                ? "Synced - send failed"
                : "Synced - ready to send"
            : "Sync invoice to QuickBooks"}
        </ActionButton>

        {!hasVerifiedQuickBooksInvoice ? (
          <ActionButton
            className="w-full"
            disabled={hasMissingPrices || !canUseQuickBooksActions}
            onClick={() => runAction("sync-send", () => {
              const formData = new FormData();
              formData.set("inspectionId", inspectionId);
              formData.set("deliveryMode", "sync_and_send");
              return formData;
            }, syncBillingSummaryToQuickBooksAction)}
            pending={pending && activeAction === "sync-send"}
            pendingLabel="Syncing and sending..."
          >
            Sync and send from QuickBooks
          </ActionButton>
        ) : null}

        {hasVerifiedQuickBooksInvoice && !summaryModeMismatch && canUseQuickBooksActions && state.quickbooksSendStatus !== "sent" ? (
          <ActionButton
            className="w-full"
            onClick={() => runAction("send", () => {
              const formData = new FormData();
              formData.set("inspectionId", inspectionId);
              return formData;
            }, sendQuickBooksInvoiceAction)}
            pending={pending && activeAction === "send"}
            pendingLabel="Sending invoice..."
          >
            {state.quickbooksSendStatus === "send_failed" ? "Retry QuickBooks send" : "Send from QuickBooks"}
          </ActionButton>
        ) : null}

        <ActionButton
          className="w-full"
          disabled={state.summaryStatus !== "invoiced"}
          onClick={() => runAction("draft", () => {
            const formData = new FormData();
            formData.set("summaryId", summaryId);
            formData.set("inspectionId", inspectionId);
            formData.set("status", "draft");
            return formData;
          }, updateBillingSummaryStatusAction)}
          pending={pending && activeAction === "draft"}
          pendingLabel="Moving back to Ready To Bill..."
        >
          {state.summaryStatus === "invoiced" ? "Move back to Ready To Bill" : "Currently Ready To Bill"}
        </ActionButton>

        <ActionButton
          className="w-full"
          disabled={state.summaryStatus === "reviewed" || state.summaryStatus === "invoiced"}
          onClick={() => runAction("reviewed", () => {
            const formData = new FormData();
            formData.set("summaryId", summaryId);
            formData.set("inspectionId", inspectionId);
            formData.set("status", "reviewed");
            return formData;
          }, updateBillingSummaryStatusAction)}
          pending={pending && activeAction === "reviewed"}
          pendingLabel="Confirming Ready To Bill..."
        >
          {state.summaryStatus === "reviewed" ? "Ready To Bill confirmed" : "Confirm Ready To Bill"}
        </ActionButton>

        <ActionButton
          className="w-full"
          onClick={() => runAction("invoiced", () => {
            const formData = new FormData();
            formData.set("summaryId", summaryId);
            formData.set("inspectionId", inspectionId);
            formData.set("status", "invoiced");
            return formData;
          }, updateBillingSummaryStatusAction)}
          pending={pending && activeAction === "invoiced"}
          pendingLabel="Marking invoiced..."
          tone="primary"
        >
          {state.summaryStatus === "invoiced" ? "Currently invoiced" : "Mark invoiced"}
        </ActionButton>
      </div>

      {openQuickBooksUrl ? (
        <a className="pressable mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={openQuickBooksUrl}>
          Open in QuickBooks
        </a>
      ) : null}
    </>
  );
}
