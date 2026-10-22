/** Public reference only. Never use this value instead of the internal ID for authorization. */
export function formatReportReference(report: { id: string; reportNumber?: number | null }) {
  return Number.isInteger(report.reportNumber) && (report.reportNumber ?? 0) > 0
    ? `R-${String(report.reportNumber).padStart(6, "0")}`
    : report.id;
}

export function parseReportNumber(query: string): number | null {
  const match = /^(?:r[\s-]*)?(\d+)$/i.exec(query.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 && number <= 2147483647 ? number : null;
}

export function isReportReferenceSearch(query: string) {
  return parseReportNumber(query) !== null || /^c[a-z0-9]{24}$/i.test(query.trim());
}

export function reportReferenceSearchWhere(query: string) {
  const number = parseReportNumber(query);
  return { OR: [
    { id: { contains: query.trim(), mode: "insensitive" as const } },
    ...(number !== null ? [{ reportNumber: number }] : [])
  ] };
}
