export function buildQuickBooksInvoiceAppUrl(invoiceId: string, mode?: "sandbox" | "live" | null) {
  const effectiveMode = mode ?? (process.env.NEXT_PUBLIC_QUICKBOOKS_APP_MODE === "sandbox" ? "sandbox" : "live");
  const host = effectiveMode === "sandbox" ? "sandbox.qbo.intuit.com" : "qbo.intuit.com";
  return `https://${host}/app/invoice?txnId=${encodeURIComponent(invoiceId)}`;
}
