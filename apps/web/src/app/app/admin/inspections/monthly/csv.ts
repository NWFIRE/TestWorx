export const monthlyColumns = ["Inspection reference", "Customer", "Location", "Address", "Scheduled date/time", "Services", "Status", "Type", "Priority", "Technicians"];

export function monthlyInspectionCsv(rows: readonly { id: string; values: string[] }[], timezone: string) {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [[...monthlyColumns, "Timezone", "Inspection ID"], ...rows.map(row => [...row.values, timezone, row.id])].map(row => row.map(cell).join(",")).join("\r\n");
}
