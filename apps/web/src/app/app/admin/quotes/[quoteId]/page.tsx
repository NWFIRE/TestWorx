import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getQuoteDetail,
  getQuoteStatusTone,
  getQuoteSyncTone,
  quoteStatusLabels,
  quoteSyncStatusLabels,
  resolveTenantBranding
} from "@testworx/lib";

import { AppPageShell, PageHeader, SectionCard, StatusBadge, WorkspaceSplit } from "../../operations-ui";
import {
  clearQuoteLineItemMappingFormAction,
  convertQuoteAction,
  deleteQuoteAction,
  saveQuoteLineItemMappingFormAction,
  updateQuoteAction
} from "../actions";
import { DeleteQuoteCard } from "../delete-quote-card";
import { QuoteEditorForm } from "../quote-editor-form";
import { QuoteQuickBooksSyncCard } from "../quote-quickbooks-sync-card";
import { QuoteReminderAutomationCard } from "../quote-reminder-automation-card";
import { QuoteSendCard } from "../quote-send-card";
import { QuoteStatusControlCard } from "../quote-status-control-card";

export default async function QuoteDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ quoteId: string }>;
  searchParams?: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const { quoteId } = await params;
  const paramsData = searchParams ? await searchParams : {};
  const detail = await getQuoteDetail({ userId: session.user.id, role: session.user.role, tenantId: session.user.tenantId }, quoteId);
  if (!detail) {
    redirect("/app/admin/quotes");
  }

  const companyName = resolveTenantBranding({
    tenantName: detail.tenant.name,
    branding: detail.tenant.branding,
    billingEmail: detail.tenant.billingEmail
  }).legalBusinessName;

  const returnHref = paramsData.from?.startsWith("/app/") ? paramsData.from : "/app/admin/quotes";

  return (
    <AppPageShell density="wide">
      <PageHeader
        eyebrow="Quotes"
        title={detail.quoteNumber}
        description="Manage delivery, QuickBooks sync, approval, and operational conversion from one quote workspace."
        contentWidth="full"
        actions={
          <>
            <a
              className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              href={`/api/quotes/${detail.id}/pdf`}
              target="_blank"
            >
              Download PDF
            </a>
            <Link
              className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              href={returnHref}
            >
              Back to quotes
            </Link>
          </>
        }
      />

      <WorkspaceSplit variant="content-heavy">
        <div className="space-y-6">
          <SectionCard>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge label={quoteStatusLabels[detail.effectiveStatus]} tone={getQuoteStatusTone(detail.effectiveStatus)} />
              <StatusBadge label={quoteSyncStatusLabels[detail.syncStatus]} tone={getQuoteSyncTone(detail.syncStatus)} />
              <p className="text-sm text-slate-500">Issued {format(detail.issuedAt, "MMM d, yyyy")}</p>
              <p className="text-sm text-slate-500">Total ${detail.total.toFixed(2)}</p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{detail.customerCompany.name}</p>
                <p className="mt-1 text-sm text-slate-500">{detail.contactName ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Delivery</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{detail.site?.name ?? "No site linked"}</p>
                <p className="mt-1 text-sm text-slate-500">{detail.recipientEmail ?? "No recipient email saved"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">QuickBooks</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{detail.quickbooksEstimateNumber ?? "Not synced yet"}</p>
                <p className="mt-1 text-sm text-slate-500">{detail.quickbooksSyncError ?? "Ready when mappings are valid."}</p>
              </div>
            </div>
          </SectionCard>

          <QuoteEditorForm
            action={updateQuoteAction}
            catalog={detail.formOptions.catalog}
            customers={detail.formOptions.customers}
            initialValue={{
              customerCompanyId: detail.customerCompanyId,
              siteId: detail.siteId ?? "",
              contactName: detail.contactName ?? "",
              recipientEmail: detail.recipientEmail ?? "",
              issuedAt: detail.issuedAt.toISOString().slice(0, 10),
              expiresAt: detail.expiresAt ? detail.expiresAt.toISOString().slice(0, 10) : "",
              internalNotes: detail.internalNotes ?? "",
              customerNotes: detail.customerNotes ?? "",
              taxAmount: detail.taxAmount,
              lineItems: detail.lineItems.map((line) => ({
                id: line.id,
                internalCode: line.internalCode,
                title: line.title,
                description: line.description ?? "",
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discountAmount: line.discountAmount,
                taxable: line.taxable,
                inspectionType: line.inspectionType ?? null,
                category: line.category ?? null
              }))
            }}
            quoteId={detail.id}
            sites={detail.formOptions.sites}
            submitLabel="Save quote updates"
            submitPendingLabel="Saving..."
          />

          <SectionCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Customer approval activity</h2>
                <p className="mt-2 text-sm text-slate-500">Track hosted-link delivery, customer engagement, and the current response state without leaving the quote workspace.</p>
              </div>
              <StatusBadge label={detail.engagementStatus.replaceAll("_", " ")} tone={detail.engagementStatus === "available" || detail.engagementStatus === "approved" ? "emerald" : detail.engagementStatus === "declined" || detail.engagementStatus === "cancelled" ? "rose" : detail.engagementStatus === "expired" ? "amber" : "slate"} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sent</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{detail.lastSentAt ? format(detail.lastSentAt, "MMM d, yyyy h:mm a") : "Not sent yet"}</p>
                <p className="mt-1 text-sm text-slate-500">Resends {detail.resendCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer viewed</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{detail.firstViewedAt ? format(detail.firstViewedAt, "MMM d, yyyy h:mm a") : "Not viewed yet"}</p>
                <p className="mt-1 text-sm text-slate-500">Last activity {detail.lastViewedAt ? format(detail.lastViewedAt, "MMM d, yyyy h:mm a") : "—"} • {detail.viewCount} views</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Response</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{detail.approvedAt ? `Approved ${format(detail.approvedAt, "MMM d, yyyy h:mm a")}` : detail.declinedAt ? `Declined ${format(detail.declinedAt, "MMM d, yyyy h:mm a")}` : "Awaiting customer response"}</p>
                <p className="mt-1 text-sm text-slate-500">{detail.customerResponseNote ?? "No customer response note yet."}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Hosted link</p>
                <p className="mt-2 text-base font-semibold text-slate-950">{detail.hostedQuoteUrl ? "Ready to share" : "Will be generated on send"}</p>
                <p className="mt-1 break-all text-sm text-slate-500">{detail.hostedQuoteUrl ?? "Send the quote to issue a secure hosted link."}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reminders</p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {detail.remindersPausedAt ? "Paused" : !detail.remindersEnabled ? "Disabled" : detail.nextReminderAt ? `Next ${format(detail.nextReminderAt, "MMM d, yyyy h:mm a")}` : "No reminder scheduled"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Stage {detail.reminderStage ?? "—"} • Last sent {detail.lastReminderAt ? format(detail.lastReminderAt, "MMM d, yyyy h:mm a") : "—"} • {detail.reminderCount} reminder{detail.reminderCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Audit history</h2>
            <div className="mt-4 space-y-3">
              {detail.auditLogs.length === 0 ? (
                <p className="text-sm text-slate-500">No quote events recorded yet.</p>
              ) : detail.auditLogs.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">{event.action.replaceAll("_", " ")}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{format(event.createdAt, "MMM d, yyyy h:mm a")}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Actor: {event.actor?.name ?? "System"}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">QuickBooks item mapping</h2>
            <p className="mt-2 text-sm text-slate-500">Map each quote line to the correct QuickBooks product or service using the cached QuickBooks item catalog. Sync uses stored QuickBooks item ids, not name guessing.</p>
            <div className="mt-4 space-y-4">
              {detail.lineItems.map((line) => (
                <div key={line.id} className="rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-950">{line.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{line.internalCode}</p>
                    </div>
                    <StatusBadge
                      label={line.mappingState.status === "mapped" ? "Mapped" : "Needs mapping"}
                      tone={line.mappingState.status === "mapped" ? "emerald" : "amber"}
                    />
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current QuickBooks item</p>
                      {line.currentQuickBooksItem ? (
                        <div className="mt-3 space-y-1 text-sm text-slate-600">
                          <p className="font-semibold text-slate-950">{line.currentQuickBooksItem.qbItemName}</p>
                          <p>ID: {line.currentQuickBooksItem.qbItemId}</p>
                          <p>Status: {line.currentQuickBooksItem.qbActive ? "Active" : "Inactive"}</p>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">No QuickBooks item is mapped for this line yet.</p>
                      )}
                      {line.currentQuickBooksItem ? (
                        <form action={clearQuoteLineItemMappingFormAction} className="mt-4">
                          <input name="quoteId" type="hidden" value={detail.id} />
                          <input name="lineItemId" type="hidden" value={line.id} />
                          <input name="internalCode" type="hidden" value={line.internalCode} />
                          <button className="pressable inline-flex min-h-11 items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50" type="submit">
                            Clear mapping
                          </button>
                        </form>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Suggested QuickBooks items</p>
                      {line.mappingState.suggestions.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-500">No strong matches yet. Resync the QuickBooks item cache or create the service in QuickBooks first, then return here to map it.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {line.mappingState.suggestions.slice(0, 5).map((suggestion) => (
                            <form key={`${line.id}-${suggestion.qbItemId}`} action={saveQuoteLineItemMappingFormAction} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <input name="quoteId" type="hidden" value={detail.id} />
                              <input name="lineItemId" type="hidden" value={line.id} />
                              <input name="internalCode" type="hidden" value={line.internalCode} />
                              <input name="internalName" type="hidden" value={line.title} />
                              <input name="qbItemId" type="hidden" value={suggestion.qbItemId} />
                              <div className="min-w-0">
                                <p className="font-medium text-slate-950">{suggestion.qbItemName}</p>
                                <p className="mt-1 break-all text-xs text-slate-500">ID {suggestion.qbItemId} • Score {suggestion.score}</p>
                              </div>
                              <button className="pressable pressable-filled inline-flex min-h-11 items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110" type="submit">
                                Use this item
                              </button>
                            </form>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <aside className="space-y-6">
          <QuoteReminderAutomationCard
            lastReminderAt={detail.lastReminderAt}
            nextReminderAt={detail.nextReminderAt}
            quoteId={detail.id}
            reminderDispatches={detail.reminderDispatches}
            reminderStage={detail.reminderStage}
            remindersEnabled={detail.remindersEnabled}
            remindersPausedAt={detail.remindersPausedAt}
          />

          <QuoteSendCard
            companyName={companyName}
            deliveryBody={detail.deliveryBody}
            deliverySubject={detail.deliverySubject}
            hostedQuoteUrl={detail.hostedQuoteUrl}
            quoteId={detail.id}
            quoteNumber={detail.quoteNumber}
            recipientEmail={detail.recipientEmail}
            sentAt={detail.sentAt}
          />

          <QuoteQuickBooksSyncCard
            lineItems={detail.lineItems}
            quickbooksEstimateId={detail.quickbooksEstimateId}
            quoteId={detail.id}
          />

          <QuoteStatusControlCard quoteId={detail.id} status={detail.status} />

          <SectionCard>
            <h2 className="text-xl font-semibold text-slate-950">Convert to work</h2>
            <p className="mt-2 text-sm text-slate-500">Approved quotes can be converted into a new inspection without re-entering line items. Inspection-linked quote lines become service tasks on the new visit.</p>
            <form action={convertQuoteAction} className="mt-4">
              <input name="quoteId" type="hidden" value={detail.id} />
              <button
                className="pressable pressable-filled inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                disabled={detail.effectiveStatus !== "approved" || Boolean(detail.convertedInspectionId)}
                type="submit"
              >
                {detail.convertedInspectionId ? "Already converted" : "Convert into inspection work"}
              </button>
            </form>
            {detail.convertedInspectionId ? (
              <Link className="mt-3 inline-flex text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${detail.convertedInspectionId}`}>
                Open converted inspection
              </Link>
            ) : null}
          </SectionCard>

          <DeleteQuoteCard
            action={deleteQuoteAction}
            disabled={Boolean(detail.convertedInspectionId) || Boolean(detail.quickbooksEstimateId) || detail.syncStatus === "sync_pending"}
            quoteId={detail.id}
            redirectTo={returnHref}
          />
        </aside>
      </WorkspaceSplit>
    </AppPageShell>
  );
}
