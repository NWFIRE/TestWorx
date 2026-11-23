export type BillingExportInput = {
  customerName: string;
  siteName: string;
  inspectionId: string;
  items: Array<{ id: string; description: string; category: string; quantity: number; unit?: string; code?: string; reportId: string }>;
};

function cell(value: string | number) {
  let text = String(value);
  // Prevent spreadsheet formulas in user-entered customer names and descriptions.
  if (typeof value === "string" && /^[\s]*[=+@\-\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildBillingExportCsv(input: BillingExportInput) {
  const rows: Array<Array<string | number>> = [["Customer", "Service site", "Inspection ID", "Line ID", "Category", "Description", "Quantity", "Unit", "Item code", "Source report ID"]];
  for (const item of input.items) rows.push([
    input.customerName, input.siteName, input.inspectionId, item.id, item.category,
    item.description, item.quantity, item.unit ?? "", item.code ?? "", item.reportId
  ]);
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
