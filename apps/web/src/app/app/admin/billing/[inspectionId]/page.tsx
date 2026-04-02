import Link from "next/link";
import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildQuickBooksInvoiceAppUrl, getAdminBillingSummaryDetail, getTenantQuickBooksConnectionStatus } from "@testworx/lib";

import { BillingItemMatchPanel } from "../../billing-item-match-panel";
import { clearBillingSummaryItemCatalogLinkAction, linkBillingSummaryItemCatalogAction, searchBillingSummaryItemCatalogMatchesAction, sendQuickBooksInvoiceAction, syncBillingSummaryToQuickBooksAction, updateBillingSummaryItemGroupAction, updateBillingSummaryNotesAction, updateBillingSummaryStatusAction } from "../../actions";

type BillingSummaryDetail = NonNullable<Awaited<ReturnType<typeof getAdminBillingSummaryDetail>>>;
type BillingSummaryLineItem = BillingSummaryDetail["reviewGroupedItems"][keyof BillingSummaryDetail["reviewGroupedItems"]][number] & {
  currentCatalogMatch?: {
    catalogItemId: string;
    quickbooksItemId: string;
    name: string;
    sku: string | null;
    itemType: string;
    unitPrice: number | null;
    alias: string | null;
    confidence: number;
    matchMethod: string;
    autoMatchEligible: boolean;
  } | null;
  suggestedCatalogMatches?: Array<{
    catalogItemId: string;
    quickbooksItemId: string;
    name: string;
    sku: string | null;
    itemType: string;
    unitPrice: number | null;
    alias: string | null;
    confidence: number;
    matchMethod: string;
    autoMatchEligible: boolean;
  }>;
};

const categoryLabels = {
  labor: "Labor",
  material: "Materials",
  service: "Services",
  fee: "Fees"
} as const;

function buildBillingItemContext(item: {
  metadata?: Record<string, unknown> | null;
}) {
  const context: string[] = [];
  const cylinderCountRaw = item.metadata?.numberOfCylinders;
  const cylinderCount = typeof cylinderCountRaw === "number"
    ? cylinderCountRaw
    : typeof cylinderCountRaw === "string" && cylinderCountRaw.trim().length > 0
      ? Number(cylinderCountRaw)
      : null;

  if (cylinderCount !== null && Number.isFinite(cylinderCount) && cylinderCount > 0) {
    context.push(`Cylinder count: ${cylinderCount}`);
  }

  const systemLocation = typeof item.metadata?.systemLocation === "string" ? item.metadata.systemLocation.trim() : "";
  if (systemLocation) {
    context.push(`System location: ${systemLocation}`);
  }

  const billingManufacturer = typeof item.metadata?.billingManufacturer === "string" ? item.metadata.billingManufacturer.trim() : "";
  if (billingManufacturer) {
    context.push(`Manufacturer: ${billingManufacturer}`);
  }

  return context;
}

export default async function BillingSummaryDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ inspectionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const { inspectionId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const [summary, quickBooksConnection] = await Promise.all([
    getAdminBillingSummaryDetail({
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    }, inspectionId),
    getTenantQuickBooksConnectionStatus({
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    })
  ]);

  if (!summary) {
    notFound();
  }

  const groupedEntries = Object.entries(summary.reviewGroupedItems) as Array<[keyof typeof categoryLabels, typeof summary.reviewGroupedItems[keyof typeof summary.reviewGroupedItems]]>;
  const isInvoiced = summary.status === "invoiced";
  const verifiedQuickBooksInvoiceId = summary.quickbooksInvoiceId && ["synced", "sent"].includes(summary.quickbooksSyncStatus ?? "")
    ? summary.quickbooksInvoiceId
    : null;
  const canUseQuickBooksActions = quickBooksConnection.connection.connected;
  const summaryQuickBooksMode = summary.quickbooksConnectionMode === "sandbox" || summary.quickbooksConnectionMode === "live"
    ? summary.quickbooksConnectionMode
    : null;
  const summaryModeMismatch = Boolean(summaryQuickBooksMode && summaryQuickBooksMode !== quickBooksConnection.connection.appMode);
  const hasVerifiedQuickBooksInvoice = Boolean(verifiedQuickBooksInvoiceId);
  const quickBooksNoticeRaw = Array.isArray(resolvedSearchParams.quickbooks) ? resolvedSearchParams.quickbooks[0] : resolvedSearchParams.quickbooks;
  const quickBooksNotice = quickBooksNoticeRaw === "success"
    ? "Invoice synced to QuickBooks."
    : quickBooksNoticeRaw === "sent"
      ? "Invoice send request submitted to QuickBooks."
    : quickBooksNoticeRaw
      ? decodeURIComponent(quickBooksNoticeRaw)
      : null;

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Billing detail</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">{summary.customerName}</h2>
            <p className="mt-3 text-slate-500">{summary.siteName} | {format(summary.inspectionDate, "MMM d, yyyy h:mm a")} | Technician: {summary.technicianName ?? "Unassigned"}</p>
            <p className="mt-2 text-slate-500">Reports: {summary.reportTypes.length > 0 ? summary.reportTypes.map((type: BillingSummaryDetail["reportTypes"][number]) => type.replaceAll("_", " ")).join(", ") : "Inspection-level billing only"}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href="/app/admin/billing">
              Back to billing list
            </Link>
            <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${summary.inspectionId}`}>
              View inspection
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Labor hours</p><p className="mt-2 text-3xl font-semibold text-ink">{summary.metrics.laborHoursTotal}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Material items</p><p className="mt-2 text-3xl font-semibold text-ink">{summary.metrics.materialItemCount}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Missing prices</p><p className="mt-2 text-3xl font-semibold text-ink">{summary.metrics.missingPriceCount}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Subtotal</p><p className="mt-2 text-3xl font-semibold text-ink">{summary.subtotal > 0 ? `$${summary.subtotal.toFixed(2)}` : "Pending pricing"}</p></div>
      </div>

      {isInvoiced ? (
        <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm text-emerald-800 shadow-panel">
          This inspection has been marked invoiced. Billing line edits and review notes are locked until you move the summary back to review.
        </div>
      ) : null}
      {quickBooksNotice ? (
        <div className={`rounded-[2rem] px-6 py-4 text-sm shadow-panel ${quickBooksNoticeRaw === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-amber-200 bg-amber-50 text-amber-800"}`}>
          {quickBooksNotice}
        </div>
      ) : null}
      {!canUseQuickBooksActions ? (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800 shadow-panel">
          {quickBooksConnection.connection.guidance ?? `Reconnect QuickBooks in ${quickBooksConnection.connection.appModeLabel} mode before syncing or opening invoices from this page.`}
        </div>
      ) : null}
      {summaryModeMismatch ? (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800 shadow-panel">
          This billing summary was synced in QuickBooks {summaryQuickBooksMode === "sandbox" ? "Sandbox" : "Live"}. Re-sync it in {quickBooksConnection.connection.appModeLabel} mode before opening or sending it.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          {groupedEntries.map(([category, items]) => (
            <div key={category} className="rounded-[2rem] bg-white p-6 shadow-panel">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{categoryLabels[category]}</p>
                  <h3 className="mt-1 text-2xl font-semibold text-ink">{items.length} grouped row{items.length === 1 ? "" : "s"}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {items.reduce((sum, item) => sum + item.sourceItemCount, 0)} original item{items.reduce((sum, item) => sum + item.sourceItemCount, 0) === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {items.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No {categoryLabels[category].toLowerCase()} extracted from this visit.</p>
                ) : items.map((item: BillingSummaryLineItem) => (
                  <div key={item.id} className="rounded-[1.5rem] border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 space-y-2">
                        <p className="text-lg font-semibold text-ink">{item.description}</p>
                        <p className="text-sm text-slate-500">{item.reportType === "inspection" ? "inspection billing" : item.reportType.replaceAll("_", " ")} / {item.sourceSection?.replaceAll("-", " ") ?? "billables"}</p>
                        <p className="text-sm text-slate-500">Source: {item.sourceField ?? "report mapping"}</p>
                        {buildBillingItemContext(item).map((line) => (
                          <p key={line} className="text-sm text-slate-500">{line}</p>
                        ))}
                        {item.sourceItemCount > 1 ? (
                          <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <summary className="cursor-pointer font-medium text-slate-700">
                              {item.sourceItemCount} underlying records grouped into this line
                            </summary>
                            <div className="mt-3 space-y-2">
                              {item.sourceItems.map((sourceItem) => (
                                <div key={sourceItem.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                                  <p className="font-semibold text-slate-700">{sourceItem.description}</p>
                                  <p className="mt-1">
                                    Qty {sourceItem.quantity}
                                    {sourceItem.sourceSection ? ` | ${sourceItem.sourceSection.replaceAll("-", " ")}` : ""}
                                    {sourceItem.sourceField ? ` | ${sourceItem.sourceField}` : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}
                        {item.unitPrice === null || item.unitPrice === undefined ? <p className="text-sm font-semibold text-amber-700">Missing unit price. Review recommended.</p> : null}
                        <BillingItemMatchPanel
                          clearAction={clearBillingSummaryItemCatalogLinkAction}
                          currentMatch={item.currentCatalogMatch ?? null}
                          inspectionId={summary.inspectionId}
                          itemDescription={item.description}
                          itemId={item.id}
                          itemIds={item.itemIds}
                          linkAction={linkBillingSummaryItemCatalogAction}
                          searchAction={searchBillingSummaryItemCatalogMatchesAction}
                          suggestedMatches={item.suggestedCatalogMatches ?? []}
                          summaryId={summary.id}
                        />
                      </div>
                      <form action={updateBillingSummaryItemGroupAction} className="grid gap-3 sm:grid-cols-2 xl:min-w-[20rem] xl:grid-cols-3">
                        <input name="summaryId" type="hidden" value={summary.id} />
                        <input name="inspectionId" type="hidden" value={summary.inspectionId} />
                        {item.itemIds.map((sourceItemId) => (
                          <input key={sourceItemId} name="itemIds" type="hidden" value={sourceItemId} />
                        ))}
                        <label className="text-sm text-slate-600">
                          Quantity
                          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={item.quantity} disabled={isInvoiced} name="quantity" step="0.25" type="number" />
                        </label>
                        <label className="text-sm text-slate-600">
                          Unit price
                          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={item.unitPrice ?? ""} disabled={isInvoiced} name="unitPrice" step="0.01" type="number" />
                        </label>
                        <div className="flex items-end sm:col-span-2 xl:col-span-1">
                          <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={isInvoiced} type="submit">
                            {isInvoiced ? "Locked" : "Save line"}
                          </button>
                        </div>
                        <p className="sm:col-span-2 xl:col-span-3 text-xs text-slate-500">
                          Subtotal: {item.unitPrice !== null && item.unitPrice !== undefined ? `$${(item.quantity * item.unitPrice).toFixed(2)}` : "Pending price"}
                        </p>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Summary status</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">{summary.status}</h3>
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <p>QuickBooks app mode: <span className="font-semibold text-ink">{quickBooksConnection.connection.appModeLabel}</span></p>
              <p className="mt-2">Connected company: <span className="font-semibold text-ink">{quickBooksConnection.tenant.quickbooksCompanyName ?? "Not connected"}</span></p>
              <p className="mt-2">Connected realm: <span className="font-semibold text-ink">{quickBooksConnection.tenant.quickbooksRealmId ?? "Not connected"}</span></p>
              <p>QuickBooks sync: <span className="font-semibold text-ink">{summary.quickbooksSyncStatus ?? "not_synced"}</span></p>
              <p className="mt-2">Invoice number: <span className="font-semibold text-ink">{summary.quickbooksInvoiceNumber ?? "Not synced"}</span></p>
              <p className="mt-2">Invoice id: <span className="font-semibold text-ink">{summary.quickbooksInvoiceId ?? "Not synced"}</span></p>
              <p className="mt-2">Invoice mode: <span className="font-semibold text-ink">{summaryQuickBooksMode ? (summaryQuickBooksMode === "sandbox" ? "Sandbox" : "Live") : "Not recorded"}</span></p>
              <p className="mt-2">Synced at: <span className="font-semibold text-ink">{summary.quickbooksSyncedAt ? summary.quickbooksSyncedAt.toLocaleString() : "Not synced"}</span></p>
              {summary.quickbooksSyncError ? <p className="mt-2 text-rose-700">Last sync error: {summary.quickbooksSyncError}</p> : null}
            </div>
            <div className="mt-4 grid gap-3">
              <form action={syncBillingSummaryToQuickBooksAction}>
                <input name="inspectionId" type="hidden" value={summary.inspectionId} />
                <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={hasVerifiedQuickBooksInvoice || summary.metrics.missingPriceCount > 0 || !canUseQuickBooksActions} type="submit">
                  {hasVerifiedQuickBooksInvoice ? "Already synced to QuickBooks" : "Sync invoice to QuickBooks"}
                </button>
              </form>
              {verifiedQuickBooksInvoiceId && !summaryModeMismatch && canUseQuickBooksActions ? (
                <a className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={buildQuickBooksInvoiceAppUrl(verifiedQuickBooksInvoiceId, summaryQuickBooksMode)} rel="noreferrer" target="_blank">
                  Open in QuickBooks
                </a>
              ) : null}
              {verifiedQuickBooksInvoiceId && !summaryModeMismatch && canUseQuickBooksActions ? (
                <form action={sendQuickBooksInvoiceAction}>
                  <input name="inspectionId" type="hidden" value={summary.inspectionId} />
                  <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                    Send from QuickBooks
                  </button>
                </form>
              ) : null}
              <form action={updateBillingSummaryStatusAction}>
                <input name="summaryId" type="hidden" value={summary.id} />
                <input name="inspectionId" type="hidden" value={summary.inspectionId} />
                <input name="status" type="hidden" value="draft" />
                <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                  Move to draft
                </button>
              </form>
              <form action={updateBillingSummaryStatusAction}>
                <input name="summaryId" type="hidden" value={summary.id} />
                <input name="inspectionId" type="hidden" value={summary.inspectionId} />
                <input name="status" type="hidden" value="reviewed" />
                <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                  Mark reviewed
                </button>
              </form>
              <form action={updateBillingSummaryStatusAction}>
                <input name="summaryId" type="hidden" value={summary.id} />
                <input name="inspectionId" type="hidden" value={summary.inspectionId} />
                <input name="status" type="hidden" value="reviewed" />
                <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" type="submit">
                  Create invoice draft
                </button>
              </form>
              <form action={updateBillingSummaryStatusAction}>
                <input name="summaryId" type="hidden" value={summary.id} />
                <input name="inspectionId" type="hidden" value={summary.inspectionId} />
                <input name="status" type="hidden" value="invoiced" />
                <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-slateblue px-4 py-3 text-sm font-semibold text-white" type="submit">
                  Mark invoiced
                </button>
              </form>
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Review notes</p>
            <form action={updateBillingSummaryNotesAction} className="mt-4 space-y-3">
              <input name="summaryId" type="hidden" value={summary.id} />
              <input name="inspectionId" type="hidden" value={summary.inspectionId} />
              <textarea className="min-h-40 w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-50" defaultValue={summary.notes ?? ""} disabled={isInvoiced} name="notes" placeholder="Missing unit price, customer billing notes, or invoice prep reminders" />
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={isInvoiced} type="submit">
                {isInvoiced ? "Notes locked" : "Save note"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
