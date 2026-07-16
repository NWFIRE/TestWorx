import Link from "next/link";
import { format } from "date-fns";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getAdminBillingSummaryDetail,
  getTenantQuickBooksConnectionStatus
} from "@testworx/lib/server/index";

import { BillingSummaryStatusActions } from "../billing-summary-status-actions";
import { BillingManualLineForm } from "../../billing-manual-line-form";
import { BillingItemMatchPanel } from "../../billing-item-match-panel";
import { AppPageShell } from "../../operations-ui";
import { addBillingSummaryManualLineAction, clearBillingSummaryItemCatalogLinkAction, getBillingManualLineCatalogItems, linkBillingSummaryItemCatalogAction, removeBillingSummaryItemGroupAction, searchBillingSummaryItemCatalogMatchesAction, sendQuickBooksInvoiceAction, syncBillingSummaryToQuickBooksAction, updateBillingSummaryItemGroupAction, updateBillingSummaryNotesAction, updateBillingSummaryStatusAction } from "../../actions";
import { BillingReportPdfReviewPanel } from "./billing-report-pdf-review-panel";

type BillingSummaryDetail = NonNullable<Awaited<ReturnType<typeof getAdminBillingSummaryDetail>>>;
type BillingSummaryLineItem = BillingSummaryDetail["reviewGroupedItems"][keyof BillingSummaryDetail["reviewGroupedItems"]][number] & {
  currentCatalogMatch?: {
    catalogItemId: string;
    quickbooksItemId: string;
    name: string;
    sku: string | null;
    itemType: string;
    description: string | null;
    unitPrice: number | null;
    taxable: boolean;
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
    description: string | null;
    unitPrice: number | null;
    taxable: boolean;
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

function formatBillingSummaryStatusLabel(status: string) {
  if (status === "draft" || status === "reviewed") {
    return "Ready To Bill";
  }
  if (status === "invoiced") {
    return "Invoiced";
  }
  return status.replaceAll("_", " ");
}

function formatEditableQuantity(quantity: number) {
  if (quantity <= 0) {
    return "";
  }

  return Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(2)));
}

function buildBillingItemContext(item: {
  code?: string | null;
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

  const billingTier = item.code === "KS-INSPECTION-GUARDIAN/DENLAR"
    ? "Lower-rate hood system"
    : item.code === "KS-INSPECTION-CAPTIVEAIRE"
      ? "Higher-rate hood system"
      : item.code === "KS-INSPECTION"
        ? "Standard hood system"
        : "";
  if (billingTier) {
    context.push(`Tier: ${billingTier}`);
  }

  return context;
}

function isComplianceReportingFeeItem(item: {
  code?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  reportType?: string | null;
}) {
  const feeType = typeof item.metadata?.feeType === "string" ? item.metadata.feeType : "";

  return feeType === "compliance_reporting"
    || item.reportType === "compliance_reporting"
    || item.code?.startsWith("COMPLIANCE_REPORTING_FEE")
    || item.description === "Compliance Reporting Fee";
}

function isManualBillingLine(item: {
  metadata?: Record<string, unknown> | null;
}) {
  return item.metadata?.manualBillingLine === true;
}

function getFeeDisplayRank(item: BillingSummaryLineItem) {
  if (isComplianceReportingFeeItem(item)) {
    return 1;
  }

  const feeType = typeof item.metadata?.feeType === "string" ? item.metadata.feeType : "";
  if (feeType === "service_fee" || item.sourceField === "serviceFee" || item.sourceSection === "service-fee") {
    return 0;
  }

  return 2;
}

function sortBillingItemsForDisplay(category: keyof typeof categoryLabels, items: BillingSummaryLineItem[]) {
  if (category !== "fee") {
    return items;
  }

  return [...items].sort((left, right) => getFeeDisplayRank(left) - getFeeDisplayRank(right));
}

function describeAutomaticFeeSource(item: {
  metadata?: Record<string, unknown> | null;
}) {
  const feeType = typeof item.metadata?.feeType === "string" ? item.metadata.feeType : "service_fee";
  const source = typeof item.metadata?.resolutionSource === "string"
    ? item.metadata.resolutionSource
    : typeof item.metadata?.complianceResolutionSource === "string"
      ? item.metadata.complianceResolutionSource
      : "";

  if (feeType === "compliance_reporting") {
    const division = typeof item.metadata?.complianceDivision === "string"
      ? item.metadata.complianceDivision.replaceAll("_", " ")
      : "compliance reporting";
    const jurisdiction = [
      typeof item.metadata?.complianceJurisdictionCity === "string" ? item.metadata.complianceJurisdictionCity : null,
      typeof item.metadata?.complianceJurisdictionCounty === "string" ? item.metadata.complianceJurisdictionCounty : null,
      typeof item.metadata?.complianceJurisdictionState === "string" ? item.metadata.complianceJurisdictionState : null,
      typeof item.metadata?.complianceJurisdictionZipCode === "string" ? item.metadata.complianceJurisdictionZipCode : null
    ].filter(Boolean).join(", ");

    return jurisdiction
      ? `Controlled by the ${division} compliance reporting rule for ${jurisdiction}.`
      : `Controlled by the ${division} compliance reporting rule.`;
  }

  switch (source) {
    case "site_override":
      return "Controlled by a site-specific service fee rule.";
    case "customer_override":
      return "Controlled by a customer-specific service fee rule.";
    case "zip_rule":
      return "Controlled by a ZIP-code service fee rule.";
    case "city_state_rule":
      return "Controlled by a city/state service fee rule.";
    default:
      return "Controlled by the tenant default service fee.";
  }
}

export default async function BillingSummaryDetailPage({
  params
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect("/login");
  }
  if (!["tenant_admin", "office_admin", "platform_admin"].includes(session.user.role)) {
    redirect("/app");
  }

  const { inspectionId } = await params;
  const [summary, quickBooksConnection, manualLineCatalogItems] = await Promise.all([
    getAdminBillingSummaryDetail({
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    }, inspectionId),
    getTenantQuickBooksConnectionStatus({
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    }),
    getBillingManualLineCatalogItems({
      userId: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId
    })
  ]);

  if (!summary) {
    notFound();
  }

  const groupedEntries = (Object.entries(summary.reviewGroupedItems) as Array<[keyof typeof categoryLabels, BillingSummaryLineItem[]]>)
    .map(([category, items]) => [category, sortBillingItemsForDisplay(category, items)] as const);
  const isInvoiced = summary.status === "invoiced";
  const canUseQuickBooksActions = quickBooksConnection.connection.connected;
  const summaryQuickBooksMode = summary.quickbooksConnectionMode === "sandbox" || summary.quickbooksConnectionMode === "live"
    ? summary.quickbooksConnectionMode
    : null;
  const summaryModeMismatch = Boolean(summaryQuickBooksMode && summaryQuickBooksMode !== quickBooksConnection.connection.appMode);
  const quickBooksInvoiceLabel = summary.quickbooksInvoiceNumber
    ?? (summary.quickbooksSyncStatus === "synced" || summary.quickbooksSyncStatus === "sent" ? "Synced" : "Not synced");

  return (
    <AppPageShell density="wide">
      <div className="rounded-[2rem] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Billing detail</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">{summary.customerName}</h2>
            <p className="mt-3 text-slate-500">{summary.siteName} | {format(summary.inspectionDate, "MMM d, yyyy h:mm a")} | Technician: {summary.technicianName ?? "Unassigned"}</p>
            <p className="mt-2 text-slate-500">Reports: {summary.reportTypes.length > 0 ? summary.reportTypes.map((type: BillingSummaryDetail["reportTypes"][number]) => type.replaceAll("_", " ")).join(", ") : "Inspection-level billing only"}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${summary.inspectionId}?from=${encodeURIComponent("/app/admin/billing")}`}>
              View inspection
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Labor hours</p><p className="mt-2 text-3xl font-semibold text-ink">{summary.metrics.laborHoursTotal}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Material items</p><p className="mt-2 text-3xl font-semibold text-ink">{summary.metrics.materialItemCount}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Billing setup</p><p className="mt-2 text-3xl font-semibold text-ink">{summary.metrics.missingPriceCount > 0 ? `${summary.metrics.missingPriceCount} item${summary.metrics.missingPriceCount === 1 ? "" : "s"}` : "Ready"}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">QuickBooks invoice</p><p className="mt-2 text-3xl font-semibold text-ink">{quickBooksInvoiceLabel}</p></div>
      </div>

      {summary.customerIsTaxExempt ? (
        <div className="rounded-[2rem] border border-blue-200 bg-blue-50 px-6 py-4 text-sm text-blue-900 shadow-panel">
          <p className="font-semibold text-blue-950">Tax-exempt customer</p>
          <p className="mt-2">
            Item taxability remains visible for QuickBooks mapping, but QuickBooks should apply the customer exemption when the invoice is synced.
          </p>
        </div>
      ) : null}

      {isInvoiced ? (
        <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm text-emerald-800 shadow-panel">
          This inspection has been marked invoiced. Billing line edits and review notes are locked until you move the summary back to review.
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
      <BillingManualLineForm
        action={addBillingSummaryManualLineAction}
        catalogItems={manualLineCatalogItems}
        disabled={isInvoiced}
        inspectionId={summary.inspectionId}
        summaryId={summary.id}
      />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(28rem,0.75fr)]">
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
                    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.72fr)] 2xl:items-start">
                      <div className="min-w-0 space-y-2">
                        <p className="text-lg font-semibold text-ink">{item.description}</p>
                        <p className="text-sm text-slate-500">{item.reportType === "inspection" ? "inspection billing" : item.reportType.replaceAll("_", " ")} / {item.sourceSection?.replaceAll("-", " ") ?? "billables"}</p>
                        <p className="text-sm text-slate-500">Source: {item.sourceField ?? "report mapping"}</p>
                        <p className="text-sm text-slate-500">
                          Tax status: {item.taxable === true ? "Taxable" : item.taxable === false ? "Non-taxable" : "Not snapped yet"}
                          {item.taxableSource ? ` / ${item.taxableSource === "quickbooks" ? "Synced from QuickBooks" : item.taxableSource}` : ""}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs font-semibold">
                          <span className={item.taxable ? "rounded-full bg-emerald-50 px-3 py-1 text-emerald-700" : "rounded-full bg-slate-100 px-3 py-1 text-slate-600"}>
                            {item.taxable ? "Taxable" : "Non-taxable"}
                          </span>
                        </div>
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
                        {item.unitPrice === null || item.unitPrice === undefined ? <p className="text-sm font-semibold text-amber-700">QuickBooks billing setup needed before sync.</p> : null}
                        {item.category === "fee" && !isManualBillingLine(item) ? (
                          <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/70 px-4 py-4 text-sm text-amber-900">
                            <p className="font-semibold text-amber-950">{isComplianceReportingFeeItem(item) ? "Compliance reporting fee assessed" : "Automatic fee line"}</p>
                            {isComplianceReportingFeeItem(item) ? (
                              <p className="mt-2 font-medium text-amber-950">
                                This fee will be included on the invoice. Confirm it here before syncing or sending.
                              </p>
                            ) : null}
                            <p className="mt-2">{describeAutomaticFeeSource(item)}</p>
                          </div>
                        ) : (
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
                        )}
                      </div>
                      <form action={updateBillingSummaryItemGroupAction} className="grid gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 2xl:grid-cols-1">
                        <input name="summaryId" type="hidden" value={summary.id} />
                        <input name="inspectionId" type="hidden" value={summary.inspectionId} />
                        {item.itemIds.map((sourceItemId) => (
                          <input key={sourceItemId} name="itemIds" type="hidden" value={sourceItemId} />
                        ))}
                        <input name="unitPrice" type="hidden" value={item.unitPrice ?? ""} />
                        <label className="text-sm text-slate-600">
                          Quantity
                          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={formatEditableQuantity(item.quantity)} disabled={isInvoiced} inputMode="decimal" min="0.01" name="quantity" placeholder="1" step="0.01" type="number" />
                        </label>
                        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                          <input className="h-4 w-4 rounded border-slate-300 text-slateblue" defaultChecked={item.taxable === true} disabled={isInvoiced} name="taxable" type="checkbox" />
                          Taxable
                        </label>
                        <div className="grid gap-2 sm:col-span-2 xl:col-span-1">
                          <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={isInvoiced} type="submit">
                            {isInvoiced ? "Locked" : "Save line"}
                          </button>
                          <button
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50"
                            disabled={isInvoiced}
                            formAction={removeBillingSummaryItemGroupAction}
                            type="submit"
                          >
                            Remove line
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <BillingReportPdfReviewPanel
            reports={summary.reportPdfs.map((report) => ({
              inspectionTaskId: report.inspectionTaskId,
              inspectionReportId: report.inspectionReportId,
              reportLabel: report.reportLabel,
              reportStatus: report.reportStatus,
              finalizedAt: report.finalizedAt ? report.finalizedAt.toISOString() : null,
              attachmentId: report.attachmentId,
              fileName: report.fileName,
              viewUrl: report.viewUrl,
              downloadUrl: report.downloadUrl
            }))}
          />

          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Summary status</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">{formatBillingSummaryStatusLabel(summary.status)}</h3>
            <BillingSummaryStatusActions
              canUseQuickBooksActions={canUseQuickBooksActions}
              connectedCompany={quickBooksConnection.tenant.quickbooksCompanyName}
              connectedRealm={quickBooksConnection.tenant.quickbooksRealmId}
              hasMissingBillingSetup={summary.metrics.missingPriceCount > 0}
              inspectionId={summary.inspectionId}
              quickbooksAppModeLabel={quickBooksConnection.connection.appModeLabel}
              quickbooksInvoiceId={summary.quickbooksInvoiceId}
              quickbooksInvoiceNumber={summary.quickbooksInvoiceNumber}
              quickbooksMode={summaryQuickBooksMode}
              quickbooksSendError={summary.quickbooksSendError}
              quickbooksSentAt={summary.quickbooksSentAt}
              quickbooksSendStatus={summary.quickbooksSendStatus === "sent" || summary.quickbooksSendStatus === "send_failed" || summary.quickbooksSendStatus === "send_skipped" ? summary.quickbooksSendStatus : "not_sent"}
              quickbooksSyncError={summary.quickbooksSyncError}
              quickbooksSyncedAt={summary.quickbooksSyncedAt}
              quickbooksSyncStatus={summary.quickbooksSyncStatus}
              sendQuickBooksInvoiceAction={sendQuickBooksInvoiceAction}
              summaryId={summary.id}
              summaryModeMismatch={summaryModeMismatch}
              summaryStatus={summary.status}
              syncBillingSummaryToQuickBooksAction={syncBillingSummaryToQuickBooksAction}
              updateBillingSummaryStatusAction={updateBillingSummaryStatusAction}
            />
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Review notes</p>
            <form action={updateBillingSummaryNotesAction} className="mt-4 space-y-3">
              <input name="summaryId" type="hidden" value={summary.id} />
              <input name="inspectionId" type="hidden" value={summary.inspectionId} />
              <textarea className="min-h-40 w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-50" defaultValue={summary.notes ?? ""} disabled={isInvoiced} name="notes" placeholder="Missing QuickBooks mapping, customer billing notes, or invoice prep reminders" />
              <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={isInvoiced} type="submit">
                {isInvoiced ? "Notes locked" : "Save note"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </AppPageShell>
  );
}
