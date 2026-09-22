// Both dashboard counts must use the same visible, deduplicated scheduling queue.
export function summarizeDashboardQueue(inspections: readonly { assignedTechnicianNames: readonly string[] }[]) {
  return {
    openInspectionCount: inspections.length,
    sharedQueueCount: inspections.filter(inspection => inspection.assignedTechnicianNames.length === 0).length
  };
}
