# Suggested billing review

## Delivered scope

The existing finalized-report mappings and work-order lines remain the source of
suggestions. Billing Detail now labels these as Suggested billing, shows a review
state, and allows billing administrators to change descriptions and categories in
addition to existing quantity, catalog matching, add-line and remove-line controls.
Source PDF links use the existing authorized attachment endpoint.

Explicit quantity, description and category overrides survive source refresh.
Changed source quantities remain suggestions until the office saves a line or
chooses Use report quantity. Each underlying record keeps its own source quantity.
Edited lines whose source disappears remain visible with a review warning.
Removed source IDs are retained in the existing pricing snapshot JSON and excluded
on future refresh. Repeated source IDs are included once; distinct equipment rows
with identical descriptions remain separate source records.

Editing or changing mapped billing content clears a prior reviewed state without
releasing the separate prior-billing-review hold. Mark billing reviewed reuses the
existing audited status action. Invoices are still created only by an explicit
QuickBooks sync; this change does not enable automatic invoices or service fees.
Final prices and taxes remain in QuickBooks. Already-synced line edits are blocked
even if a legacy summary still has draft status.

Grouped line edits are audited transactionally and reject concurrent item changes.
Removal, manual additions and catalog linking/clearing also condition their writes
on the same tenant, item snapshot and status, with no existing QuickBooks invoice.
Failed saves retain the user's entered description and quantity for retry.
Refresh uses an optimistic item comparison to avoid replacing a concurrently edited
summary. Existing server administrator checks and tenant scope remain in place.
No database migration, historical invoice repair, or inspection mutation is needed.

## Rollout and rollback

Deploy the application commit only after signed-in staging acceptance. There is no
schema deployment or data backfill. Existing summaries acquire source metadata on
their next refresh. Exclusions only cover removals made with this version; do not
infer historical removal intent from a missing line.

Rollback by deploying the preceding application version. JSON remains compatible,
but older code does not honor the new exclusion/override flags and may restore
removed suggestions on refresh. Avoid refreshing affected unsynced summaries on
the old version until a forward fix is available. Issued invoices are untouched.

## Verification and remaining rollout work

- Follow-up release verification: 813 library tests passed, 14 skipped using
  `--maxWorkers=1 --testTimeout=15000`. The timeout override is only for this run;
  the repository's test timeout is unchanged. Database integration tests remain
  skipped because no isolated test database was configured.
- Follow-up production build, web lint and TypeScript checks passed. The generated
  production client bundle was checked to include the failed-save preservation fix.
- Eight browser checks passed: six responsive fixtures plus two tests mounting
  the actual React billing form with stubbed actions. These reproduced and verified
  the failed-save input-reset fix and checked save/removal/suggested-quantity intent.
- Production deployment has NOT been performed. Vercel access was verified, but
  no authorized staging admin/technician credentials or confirmed QuickBooks
  sandbox connection were available. Requested test access before promotion.
- Production build, web lint and TypeScript checks passed. The full library run
  finished with 811 passed, 14 skipped and one PDF-branding timeout at its existing
  five-second limit. Retrying branding plus billing tests passed all 88 executed
  tests (3 skipped). No PDF test timeout was raised or disabled in source.
- All six responsive browser fixtures passed. These use isolated markup and the
  actual billing stylesheet, not an authenticated production session.
- Unit coverage: source deduplication, exclusions, repeated override refresh,
  source changes/disappearance, snapshot preservation, validation, tenant rejection,
  technician rejection, and synced-invoice edit protection.
- Browser fixture: actual billing CSS at 320, 390, 768, 1280, 1536 and 1920px;
  quantity/description/category editing and value preservation during resize.
- Signed-in application save/reload, two simultaneous office editors, real report
  mapping completeness and QuickBooks sandbox invoice contents still require
  staging acceptance with authorized test accounts. Fixture checks are not a
  substitute for these end-to-end checks.
- Uploaded third-party PDF extraction is the second rollout stage, not implemented
  here. No OCR or AI-generated quantities are silently added. Staff can inspect
  documents and use the existing manual catalog-line flow. Generated PDFs are not
  extracted a second time, avoiding duplication with their structured report data.
