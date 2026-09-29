# Technician report removal

Assigned technicians can remove an unneeded draft report from an active inspection, including reports originally added by the office. Start the job, open a report, expand **Remove unneeded report**, select the report and confirm removal. This deletes that visit's report and its draft data; it does not delete other reports or the customer service schedule.

- A running job timer, tenant membership and inspection assignment are checked server-side.
- Submitted, finalized, signed and completed reports cannot be removed by technicians.
- At least one current-visit report must remain. Contact the office if the entire visit is unnecessary.
- Removal requires an online connection and no pending, failed or conflicting sync for the selected report. The smart editor also disables removal while the current report is unsynced.
- The confirmation identifies the report and explains the deletion. On success, the editor returns to the work list rather than leaving a deleted report open.
- Database changes and an audit snapshot are committed together. File cleanup occurs only after commit. Existing admin removal permissions remain unchanged.

Regression coverage: `packages/lib/src/__tests__/inspection-task-addition.test.ts` exercises original and technician-added drafts, worked drafts, authorization, tenant/visit scoping, last-report protection, job-start requirements and signed/finalized/closed protections.

Run `node scripts/check-report-removal.cjs` for isolated browser checks of the real removal components at 390px, 900px and 1440px: selection, cancel, sync protection, server errors, successful navigation and local cache cleanup. No production records are modified by this check.
