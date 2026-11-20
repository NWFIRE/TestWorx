# Dashboard attention queues

Every actionable Needs Attention row is a real Next.js link with whole-row hover,
keyboard focus, and a decorative chevron. Informational deletion notices remain
plain text. Mobile padding is unchanged.

Inspection counts and destinations share `attention-queue.ts` predicates, operate
on the tenant-authorized scheduling queue with no row limit, apply the same due
window, then deduplicate before applying the attention predicate. The existing
queue's overdue/next-60-days window is used for unassigned, payment-collection,
and linked-visit alerts. Payment collection no longer incorrectly says "today"
for a sample of the oldest active inspections. Linked visit counts are no longer
limited to the dashboard's first 12 records.

- Unassigned: `/app/admin/inspections?status=open&attention=unassigned`.
- Payment collection: same page with `attention=payment`.
- Linked visit updates: same page with `attention=linked`.
- Ready to Bill: `/app/admin/billing?status=all`, the existing Ready To Bill
  filter (draft/reviewed summaries, not invoiced).
- Field requests: `/app/admin/service-requests?status=pending`, excluding
  acknowledged/resolved/declined requests, matching the existing badge count.

Inspection links also carry an ISO `through` cutoff so refresh and shared links
retain the dashboard's date window. The date cutoff and queue are visible in the
expanded filter section. Clear filters returns to the normal queue. Service
requests show the pending filter, total and Clear filters; history is excluded
in that view. No alert is discarded by the former three-alert display limit.

Dashboard and inspection-list reads pass `readOnly: true` to the scheduling
reader. Stale finalized work is still excluded, but browsing does not invoke
status reconciliation. Other callers retain their previous behavior. Billing
summary listing already uses read-only reads; no invoice or status mutation was
added. Existing tenant/role guards remain in place.

Regression checks: `node scripts/check-attention-queues.cjs`, billing-queue and
field-service-request library tests, plus scheduling tests including explicit
proof that the read-only stale-work path performs no transaction.
