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
import { BillingLineForm } from "./billing-line-form";
import { BillingExportButton } from "./billing-export-button";
import styles from "./billing-detail.module.css";

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
  if (status === "billing_review") return "Needs billing review";
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
    }).catch(() => null),
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
  const isInvoiced = summary.status === "invoiced" || Boolean(summary.quickbooksInvoiceId);
  const canUseQuickBooksActions = quickBooksConnection?.connection.connected ?? false;
  const summaryQuickBooksMode = summary.quickbooksConnectionMode === "sandbox" || summary.quickbooksConnectionMode === "live"
    ? summary.quickbooksConnectionMode
    : null;
  const summaryModeMismatch = Boolean(quickBooksConnection && summaryQuickBooksMode && summaryQuickBooksMode !== quickBooksConnection.connection.appMode);
  const quickBooksInvoiceLabel = summary.quickbooksInvoiceNumber
    ?? (summary.quickbooksSyncStatus === "synced" || summary.quickbooksSyncStatus === "sent" ? "Synced" : "Not synced");

  return (
    <AppPageShell className={styles.detail} density="wide">
      <div className="rounded-3xl bg-white p-4 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Billing detail</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">{summary.customerName}</h2>
            <p className="mt-2 text-sm text-slate-500">{summary.siteName} | {format(summary.inspectionDate, "MMM d, yyyy h:mm a")} | Technician: {summary.technicianName ?? "Unassigned"}</p>
            <p className="mt-1 text-sm text-slate-500">Reports: {summary.reportTypes.length > 0 ? summary.reportTypes.map((type: BillingSummaryDetail["reportTypes"][number]) => type.replaceAll("_", " ")).join(", ") : "Inspection-level billing only"}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <BillingExportButton customerName={summary.customerName} siteName={summary.siteName} inspectionId={summary.inspectionId} items={summary.items} />
            <Link className="inline-flex rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue" href={`/app/admin/inspections/${summary.inspectionId}?from=${encodeURIComponent("/app/admin/billing")}`}>
              View inspection
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.metrics}>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Labor hours</p><p className="mt-2 text-3xl font-semibold text-ink">{summary.metrics.laborHoursTotal}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Material items</p><p className="mt-2 text-3xl font-semibold text-ink">{summary.metrics.materialItemCount}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Billing review</p><p className="mt-2 text-3xl font-semibold text-ink">{summary.status === "reviewed" ? "Reviewed" : isInvoiced ? "Invoiced" : "Needs review"}</p></div>
        <div className="rounded-3xl bg-white p-5 shadow-panel"><p className="text-sm text-slate-500">Accounting</p><p className="mt-2 text-3xl font-semibold text-ink">{canUseQuickBooksActions || summary.quickbooksInvoiceId ? quickBooksInvoiceLabel : "Manual / export"}</p></div>
      </div>

      {summary.customerIsTaxExempt ? (
        <div className="rounded-[2rem] border border-blue-200 bg-blue-50 px-6 py-4 text-sm text-blue-900 shadow-panel">
          <p className="font-semibold text-blue-950">Tax-exempt customer</p>
          <p className="mt-2">
            Apply this customer&apos;s exemption in your accounting software when preparing the final invoice.
          </p>
        </div>
      ) : null}

      {isInvoiced ? (
        <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm text-emerald-800 shadow-panel">
          This inspection has been marked invoiced. Billing line edits and review notes are locked until you move the summary back to review.
        </div>
      ) : null}
      {!canUseQuickBooksActions ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          No accounting connection is required. Review your billing lines, export them for your accounting workflow, and mark this work invoiced after billing it externally.
        </div>
      ) : null}
      {summaryModeMismatch ? (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800 shadow-panel">
          This billing summary belongs to QuickBooks {summaryQuickBooksMode === "sandbox" ? "Sandbox" : "Live"}. Connect to that same company and mode to open the existing invoice. Do not create a duplicate invoice.
        </div>
      ) : null}
      <details className="rounded-2xl border border-slate-200 bg-white px-4 py-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-slateblue">Add a billing line</summary>
        <BillingManualLineForm
        action={addBillingSummaryManualLineAction}
        catalogItems={manualLineCatalogItems}
        disabled={isInvoiced}
        inspectionId={summary.inspectionId}
        summaryId={summary.id}
      />
      </details>

      <section className="grid min-w-0 items-start gap-3 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <h2 className="text-lg font-semibold text-ink">Suggested billing</h2>
            <span className="text-sm font-medium text-slate-600">{isInvoiced ? "Invoiced" : summary.status === "reviewed" ? "Reviewed" : "Needs review"}</span>
          </div>
          {groupedEntries.map(([category, items]) => (
            <div key={category} className="rounded-3xl bg-white p-4 shadow-panel">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink">{categoryLabels[category]} <span className="text-sm font-normal text-slate-500">({items.length} grouped row{items.length === 1 ? "" : "s"})</span></h3>
                  <p className="text-xs text-slate-500">
                    {items.reduce((sum, item) => sum + item.sourceItemCount, 0)} original item{items.reduce((sum, item) => sum + item.sourceItemCount, 0) === 1 ? "" : "s"}
                  </p>
              </div>

              <div className="space-y-3">
                {items.length === 0 ? (
                  <p className="text-sm text-slate-500">No {categoryLabels[category].toLowerCase()} extracted from this visit.</p>
                ) : items.map((item: BillingSummaryLineItem) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-3">
                    <div className="grid min-w-0 gap-3">
                      <div className="min-w-0 space-y-2">
                        <p className="text-lg font-semibold text-ink">{item.description}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                          <p>{item.reportType === "inspection" ? "inspection billing" : item.reportType.replaceAll("_", " ")} / {item.sourceSection?.replaceAll("-", " ") ?? "billables"}</p>
                          <p>Source: {item.sourceField ?? "report mapping"}</p>
                          <p>
                            Tax status: {item.taxable === true ? "Taxable" : item.taxable === false ? "Non-taxable" : "Not snapped yet"}
                            {item.taxableSource ? ` / ${item.taxableSource === "quickbooks" ? "Synced from QuickBooks" : item.taxableSource}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {summary.reportPdfs.filter((pdf) => item.sourceItems.some((source) => source.reportId === pdf.inspectionReportId)).map((pdf) => (
                            <a key={pdf.inspectionReportId} href={pdf.viewUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 content-center text-sm font-medium text-slateblue underline focus-visible:outline focus-visible:outline-2">
                              Source: {pdf.reportLabel}
                            </a>
                          ))}
                          {buildBillingItemContext(item).map((line) => (
                            <p key={line} className="text-sm text-slate-500">{line}</p>
                          ))}
                        </div>
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
                        {canUseQuickBooksActions && (item.unitPrice === null || item.unitPrice === undefined) ? <p className="text-sm font-semibold text-amber-700">QuickBooks item setup needed only if syncing this line.</p> : null}
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
                        ) : canUseQuickBooksActions ? (
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
                        ) : null}
                      </div>
                      <BillingLineForm saveAction={updateBillingSummaryItemGroupAction} removeAction={removeBillingSummaryItemGroupAction} className={styles.lineControls}>
                        <input name="summaryId" type="hidden" value={summary.id} />
                        <input name="inspectionId" type="hidden" value={summary.inspectionId} />
                        {item.itemIds.map((sourceItemId) => (
                          <input key={sourceItemId} name="itemIds" type="hidden" value={sourceItemId} />
                        ))}
                        <input name="unitPrice" type="hidden" value={item.unitPrice ?? ""} />
                        <label className="text-sm text-slate-600 sm:col-span-3">
                          Description
                          <input name="description" required maxLength={2000} defaultValue={item.description} disabled={isInvoiced} className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" />
                        </label>
                        <label className="text-sm text-slate-600 sm:col-span-3">
                          Category
                          <select name="category" defaultValue={item.category} disabled={isInvoiced} className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3">
                            <option value="service">Services</option>
                            <option value="material">Materials / equipment</option>
                            <option value="labor">Labor</option>
                            <option value="fee">Fees</option>
                          </select>
                        </label>
                        {item.sourceItems.some((source) => source.metadata?.sourceChanged === true) ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-3">
                            <p>{item.sourceItems.some((source) => source.metadata?.sourceMissing === true) ? "This edited line is no longer in the report. Keep it only if still billable, or remove it." : "Report quantities changed. Review this line before billing."}</p>
                            <button type="submit" name="useSuggestedQuantity" value="true" disabled={isInvoiced || item.sourceItems.some((source) => source.metadata?.sourceMissing === true)} className="mt-2 min-h-11 rounded-lg border border-amber-300 px-3 font-semibold disabled:opacity-50">
                              Use report quantity ({item.sourceItems.reduce((sum, source) => sum + (typeof source.metadata?.sourceQuantity === "number" ? source.metadata.sourceQuantity : source.quantity), 0)})
                            </button>
                          </div>
                        ) : null}
                        <label className="text-sm text-slate-600">
                          Quantity
                          <input className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 px-4 py-3" defaultValue={formatEditableQuantity(item.quantity)} disabled={isInvoiced} inputMode="decimal" min="0.01" name="quantity" placeholder="1" step="0.01" type="number" />
                        </label>
                        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                          <input className="h-4 w-4 rounded border-slate-300 text-slateblue" defaultChecked={item.taxable === true} disabled={isInvoiced} name="taxable" type="checkbox" />
                          Taxable
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slateblue disabled:opacity-50" disabled={isInvoiced} type="submit">
                            {isInvoiced ? "Locked" : "Save line"}
                          </button>
                          <button
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-50"
                            disabled={isInvoiced}
                            name="intent"
                            value="remove"
                            formNoValidate
                            type="submit"
                          >
                            Remove line
                          </button>
                        </div>
                      </BillingLineForm>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="min-w-0 space-y-3">
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

          <div className="rounded-3xl bg-white p-4 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Summary status</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink">{formatBillingSummaryStatusLabel(summary.status)}</h3>
            <BillingSummaryStatusActions
              key={`${summary.status}:${summary.quickbooksInvoiceId ?? "unsynced"}`}
              canUseQuickBooksActions={canUseQuickBooksActions}
              connectedCompany={quickBooksConnection?.tenant.quickbooksCompanyName ?? null}
              connectedRealm={quickBooksConnection?.tenant.quickbooksRealmId ?? null}
              hasMissingBillingSetup={summary.metrics.missingPriceCount > 0}
              inspectionId={summary.inspectionId}
              quickbooksAppModeLabel={quickBooksConnection?.connection.appModeLabel ?? "Unavailable"}
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

          <div className="rounded-3xl bg-white p-4 shadow-panel">
            <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Review notes</p>
            <form action={updateBillingSummaryNotesAction} className="mt-4 space-y-3">
              <input name="summaryId" type="hidden" value={summary.id} />
              <input name="inspectionId" type="hidden" value={summary.inspectionId} />
              <textarea className="min-h-40 w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:bg-slate-50" defaultValue={summary.notes ?? ""} disabled={isInvoiced} name="notes" placeholder="Accounting system, external invoice reference, or billing notes" />
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
