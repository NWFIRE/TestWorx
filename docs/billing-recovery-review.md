# Historical billing recovery

Missing local billing does not prove a job has never been billed. Recovery of an
already-completed inspection creates a summary in `billing_review`, not Ready To
Bill. Normal first-time finalization continues to create a draft summary.

Office/admin users can find recovered records under Billing > Needs billing review.
Check prior invoices, service details, locations and dates. Customer-name matches
alone are not sufficient evidence of duplicate work.

- If already billed, use **Already billed - mark invoiced**. This records local
  closure without creating, sending, deleting or voiding a QuickBooks invoice.
- If genuinely unbilled, explicitly confirm the prior-invoice check, then release
  the summary to Ready To Bill. Status changes are tenant-authorized and audited.
- Other questionable ready items can be held for prior billing review.

Invoice creation rejects held, already-invoiced and already-linked summaries.
Invoiced summaries cannot be reopened using status controls, which previously
erased QuickBooks links. Financial corrections belong on the existing invoice.

The repair-completed-inspection-billing CLI remains dry-run by default. Applying
it now recovers records into billing review. Do not bulk mark historical work as
unbilled or infer duplicates from customer names alone. No schema migration is
needed: summary status is an existing string field.

`node scripts/hold-recovered-billing.cjs TENANT_ID ADMIN_USER_ID` previews older
recovery-created drafts. Add `--apply` only after the review UI and sync guards
are deployed. It holds only audit-identified, unsynced drafts, checks `updatedAt`
before changing each record, and audits every change. Existing invoices are skipped.
