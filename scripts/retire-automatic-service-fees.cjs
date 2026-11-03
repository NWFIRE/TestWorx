const { PrismaClient } = require("@prisma/client");

function eligibleBilling(row) {
  return ["draft", "billing_review", "reviewed"].includes(row.status)
    && !["invoiced", "cancelled"].includes(row.inspection?.status)
    && !row.quickbooksInvoiceId && !row.quickbooksInvoiceNumber && !row.quickbooksSyncedAt
    && !row.quickbooksSentAt && [null, "not_synced", "failed"].includes(row.quickbooksSyncStatus)
    && [null, "not_sent", "skipped"].includes(row.quickbooksSendStatus);
}

function automaticBillingFee(item) {
  return item.sourceSection === "service-fee" && item.sourceField === "serviceFee"
    && item.metadata?.manualBillingLine !== true;
}

function eligibleQuote(row) {
  return row.status === "draft" && !row.quickbooksEstimateId && !row.quickbooksSyncedAt
    && !row.sentAt && !row.lastSentAt && !row.approvedAt && !row.convertedAt
    && ["not_synced", "failed"].includes(row.syncStatus);
}

function automaticQuoteFee(item) {
  // Only the legacy generated shape is safe to remove; catalog/manual fees stay.
  return item.category === "service_fee" && /^SERVICE_FEE(?:_|$)/.test(item.internalCode)
    && item.title === "Service Fee" && !item.description && !item.qbItemId
    && item.quantity === 1 && item.discountAmount === 0 && !item.inspectionType;
}

async function run() {
  const tenantId = process.argv.find((arg) => arg.startsWith("--tenant="))?.slice(9);
  if (!tenantId) throw new Error("Provide --tenant=<id>; dry-run is default. Add --apply only after review.");
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient();
  try {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true } });
    const summaries = (await db.inspectionBillingSummary.findMany({ where: { tenantId: tenant.id,
      status: { in: ["draft", "billing_review", "reviewed"] }, quickbooksInvoiceId: null
    }, include: { inspection: { select: { status: true } } } })).filter(eligibleBilling).filter((row) => Array.isArray(row.items) && row.items.some(automaticBillingFee));
    const quotes = (await db.quote.findMany({ where: { tenantId, status: "draft", quickbooksEstimateId: null }, include: { lineItems: true } }))
      .filter(eligibleQuote).filter((row) => row.lineItems.some(automaticQuoteFee));
    console.log(JSON.stringify({ apply, tenantId, billingSummaries: summaries.length, quotes: quotes.length,
      billingLines: summaries.reduce((n, row) => n + row.items.filter(automaticBillingFee).length, 0),
      quoteLines: quotes.reduce((n, row) => n + row.lineItems.filter(automaticQuoteFee).length, 0) }));
    if (!apply) return;
    for (const row of summaries) {
      await db.$transaction(async (tx) => {
        const items = row.items.filter((item) => !automaticBillingFee(item));
        const pricingSnapshot = { ...(row.pricingSnapshot || {}) };
        delete pricingSnapshot.invoiceTotals;
        const subtotal = Math.round(items.reduce((n, item) => n + (typeof item.amount === "number" ? item.amount : 0), 0) * 100) / 100;
        // Optimistic lock prevents changes to a draft edited or synced since the audit read.
        const changed = await tx.inspectionBillingSummary.updateMany({
          where: { id: row.id, tenantId, updatedAt: row.updatedAt, quickbooksInvoiceId: null, quickbooksSyncedAt: null, status: row.status,
            inspection: { status: { notIn: ["invoiced", "cancelled"] } } },
          data: { items, subtotal, pricingSnapshot }
        });
        if (changed.count !== 1) throw new Error(`Concurrent billing update: ${row.id}; rerun the dry-run.`);
        await tx.auditLog.create({ data: { tenantId, action: "billing.automatic_service_fee_retired", entityType: "InspectionBillingSummary", entityId: row.id,
          metadata: { previousItems: row.items, previousSubtotal: row.subtotal, previousPricingSnapshot: row.pricingSnapshot,
            removedLineIds: row.items.filter(automaticBillingFee).map((item) => item.id) } } });
      });
    }
    for (const row of quotes) {
      await db.$transaction(async (tx) => {
        const removed = row.lineItems.filter(automaticQuoteFee);
        const subtotal = Math.round(row.lineItems.filter((item) => !automaticQuoteFee(item)).reduce((n, item) => n + item.total, 0) * 100) / 100;
        const changed = await tx.quote.updateMany({ where: { id: row.id, tenantId, updatedAt: row.updatedAt, status: "draft", quickbooksEstimateId: null, sentAt: null },
          data: { subtotal, taxAmount: 0, total: subtotal } });
        if (changed.count !== 1) throw new Error(`Concurrent quote update: ${row.id}; rerun the dry-run.`);
        await tx.quoteLineItem.deleteMany({ where: { tenantId, quoteId: row.id, id: { in: removed.map((item) => item.id) } } });
        await tx.auditLog.create({ data: { tenantId, action: "quote.automatic_service_fee_retired", entityType: "Quote", entityId: row.id,
          metadata: JSON.parse(JSON.stringify({ removedLines: removed, previousSubtotal: row.subtotal, previousTaxAmount: row.taxAmount, previousTotal: row.total })) } });
      });
    }
    console.log("Cleanup complete; existing invoices and all other line items preserved.");
  } finally { await db.$disconnect(); }
}

module.exports = { eligibleBilling, eligibleQuote, automaticBillingFee, automaticQuoteFee };
if (require.main === module) run().catch((error) => { console.error(error.message); process.exitCode = 1; });
