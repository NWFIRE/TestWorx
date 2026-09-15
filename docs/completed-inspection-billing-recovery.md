# Completed inspection billing recovery

Billing lists persisted billing summaries. Status reconciliation used by manual
completion and repair previously could mark an inspection completed without
creating its summary. Finalization retries also returned immediately without
recovering a missing summary.

Completed-status reconciliation now ensures missing billing through the existing
extraction service. Report/document finalization retains its existing refresh path.
Finalization retries recover missing summaries for completed inspections only.
Existing summaries, invoiced/cancelled inspections and partial inspections are
left unchanged. Recovery locks the tenant-scoped inspection inside the caller's
transaction and checks again before creating billing. Failures roll back.

For older missing summaries, use an authorized environment and run:

```sh
node scripts/repair-completed-inspection-billing.cjs TENANT_ID ADMIN_USER_ID
node scripts/repair-completed-inspection-billing.cjs TENANT_ID ADMIN_USER_ID --apply
```

Use Node 22.15 or newer. The default is read-only. Apply creates only missing summaries for already
completed inspections, with an audit record per restoration. It does not finalize
reports, change signatures, reschedule visits, send email, or sync to QuickBooks.
Each restoration uses its own transaction; rerunning safely skips existing summaries.
Keep credentials and customer-specific output outside version control.

Tests: inspection-billing-readiness.test.ts, report-finalization-status.test.ts,
inspection-billing.test.ts, report-finalization.test.ts.
