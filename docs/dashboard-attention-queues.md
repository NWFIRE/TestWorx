# Dashboard attention queues

Every actionable Needs Attention row is a real Next.js link with whole-row hover,
keyboard focus, and a decorative chevron. Informational deletion notices remain
plain text. Mobile padding is unchanged.

Attention links retain the Dashboard scroll offset on their own history entry.
The app shell restores it when returning, including after streamed content loads.
Modified clicks/new-tab actions do not change that history entry.

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
The redundant invoiced archive beneath Ready To Bill has been removed; the
existing Invoiced tab and KPI still expose all archived invoices. Every billing
queue now renders only records matching its selected filter.

Dashboard and inspection-list reads pass `readOnly: true` to the scheduling
reader. Stale finalized work is still excluded, but browsing does not invoke
status reconciliation. Other callers retain their previous behavior. Billing
summary listing already uses read-only reads; no invoice or status mutation was
added. Existing tenant/role guards remain in place.

Regression checks: `node scripts/check-attention-queues.cjs`, billing-queue and
field-service-request library tests, plus scheduling tests including explicit
proof that the read-only stale-work path performs no transaction.

## Live verification (2026-11-20)

Signed-in Office Admin, production browser; no records edited:

| Alert | Dashboard | Destination total |
| --- | ---: | ---: |
| Unassigned | 143 | 143 across 4 months |
| Payment collection | 29 | 29 across 4 months |
| Ready To Bill | 13 | 13 summaries / 13 review links |
| Linked visit updates | 1 | 1 across 1 month |

Refresh preserved unassigned and billing totals/filters. Keyboard Enter opened
the payment queue. The linked-visit row was clicked at 390x844 and matched its
count. Pending requests were zero: the explicit pending filter displayed zero,
Clear filters, and the clear-queue empty state. Populated request eligibility
and the resolved-final-item empty collection are regression-tested; production
records were not created or resolved just to test a race condition.
The unassigned empty state was also verified live using an empty historical
date window; Clear filters restored the standard 157-record inspection queue.
On mobile, keyboard focus showed a visible ring and Back restored the exact
Dashboard scroll position (4936px). Ctrl-click opened a separate filtered billing
tab and retained the Dashboard. Final build, lint, TypeScript, 57 targeted library
tests, and the standalone queue regression script passed.

Final billing check confirmed 13 ready-to-bill links and zero unrelated invoice
links; selecting Invoiced rendered all 439 invoice links. An intermittent existing
React streamed-response `$RS`/`parentNode` error was observed on billing, and a
subsequent Clear filters client transition remained pending. This error was also
documented in the preceding desktop-layout audit. Direct filtered URLs and the
Dashboard links were verified, but repeated billing filter transitions cannot be
certified reliable until that separate streaming/hydration issue is resolved.
