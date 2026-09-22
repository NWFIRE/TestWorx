# Dashboard queue counts

The dashboard shared-queue alert counts unassigned rows from the same tenant-scoped, active, deduplicated 60-day scheduling queue used by its Open inspections KPI. It does not use the all-future claimable-inspection summary. Primary and additional technician assignments both exclude a row from this count. An empty shared queue does not produce an alert.

The alert explicitly describes the overdue/next-60-days scope. No inspection records, recurrence schedules, billing records, or assignments are changed.

Regression check: `node scripts/check-dashboard-queue.cjs`.
