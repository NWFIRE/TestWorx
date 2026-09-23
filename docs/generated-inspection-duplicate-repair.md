# Generated inspection duplicates

## Cause and prevention

The completed-task service-schedule backfill created schedules without binding `InspectionTask.serviceScheduleId`. Once a schedule advanced, the original task could create another schedule for the old occurrence. Backfill now locks, re-reads, reuses/creates, and binds atomically. Existing recurrence-series links are reused even after their due dates advance. Distinct systems within a completed visit are not collapsed into the same newly matched schedule. Completed and invoiced occurrences also count as fulfilled when planning missing visits.

## Repair safeguards

`scripts/repair-generated-inspection-duplicates.cjs --email=<active-admin-email>` is dry-run only. An explicit `--apply --digest=<dry-run-digest>` applies the reviewed plan to that administrator's tenant.

Candidates must have a system-generation audit record and a retained visit with the same tenant, customer, site, exact scheduled time and classification, covering the same service types, labels, cadence and multiplicities. Only unassigned, unstarted, unbilled visits with untouched empty draft reports and no notes, signatures, attachments, documents, deficiencies, job time, quotes, closeout or amendment links qualify. Completed/billed or edited records are retained. Same customer alone is never a match.

The repair locks and rechecks records in one transaction. Each deleted visit's full loaded snapshot (including tasks, reports and recurrences) is saved in an `inspection.duplicate_repaired` audit entry with its retained inspection ID. Only schedules with no remaining attached tasks and no retained canonical reference are deactivated, with their own snapshot audit. No reports with technician work are removed. Snapshot recovery must restore parent inspection, tasks, recurrences and reports in dependency order within the original tenant; do not blindly restore view-only relation properties.

The separate large Timberlake task-count anomaly is not repaired by this tool: task-level duplication inside retained visits requires its own review.

## Checks

- `node scripts/check-duplicate-repair.cjs`
- `npm run test --workspace @testworx/lib -- src/__tests__/recurring-schedule-backfill.test.ts src/__tests__/scheduling.test.ts`
- Re-run the dry-run after application; expect zero eligible remaining duplicates.
- `node scripts/audit-october-inspections.cjs` verifies the specifically reported tenant/month without modifying data.
