# Home refresh - November 23, 2026

## Visual refinement follow-up

- Commit 0ab2b635 adds a spacious welcome header, subtle brand tint, section icons,
  aligned count pills, quieter shortcut chips and a balanced schedule empty state.
- Shared Home-only CSS responds to the available content width; data queries, queue URLs,
  permissions, job ordering, offline hooks and mutations are unchanged.
- Production build and web lint passed; all nine Home navigation/schedule tests passed.
- Deployment test-worx-bg5n01mp3-nw-fire.vercel.app reached Ready and the production aliases.
- Signed-in office Home visually checked at 1920x1080, 1440x900, 800x720 and 390x844.
  Main/page scroll widths equaled client widths at each size. Cards stack on narrow screens.
- Visible counts remained 143 unassigned, 13 ready to bill, 29 payment collection and one
  linked visit update. Existing queue destinations remained intact in rendered links.
- Technician signed-in visual testing remains unavailable; the earlier verification limits below
  still apply. This follow-up did not repeat the prior full queue navigation audit.

## Implementation

- Renamed office navigation, mobile labels, header context, work-queue navigation,
  page heading, and browser title to Home. Technician Home now has matching page metadata.
- Retained /app/admin/dashboard, /app/admin and /app/tech sign-in destinations and bookmark behavior.
- Replaced the office hero, repeated KPIs, active/archive lists, quick actions and revenue
  pipeline with Needs Attention and Today's Schedule. Search remains available.
- Preserved report review and visit review links. Other workflows remain in existing navigation.
- Attention rows use existing tenant-scoped counts and destination predicates, including the
  encoded 60-day inspection cutoff. Positive counts only; empty state says You're all caught up.
- Office schedule uses the existing read-only day scheduler, not the first three old active jobs.
  It shows up to eight jobs and links to the full scheduler in a new tab.
- Technician Home retains offline snapshots, sync warnings, notifications and assignment visibility.
  The current timed job or next scheduled stop leads the list. A running overnight job is retained;
  paused previous-day work is not mislabeled as current. No job-start or report-save action is added.
- Technician Home and its View schedule destination use the company timezone rather than the
  runtime/device date for day membership. Existing work filters and URLs remain available.
- No schema, record migration, customer billing, report-saving or inspection-status mutation changed.

## Automated checks

- Local production build passed; latest production deployment also built successfully.
- Web ESLint passed with the existing generated .next-corrupt-* directory excluded.
- Final edited technician work files passed ESLint separately; final TypeScript check passed.
- Final focused run: 64 tests passed across Home navigation/schedule, scheduler authorization,
  technician dashboard and billing queue suites.
- Existing admin-dashboard test passed separately. Its first run alongside the build timed out
  at its explicit 15-second limit; the isolated rerun passed. No timeout setting was changed.
- Coverage includes company/role scoping, read-only scheduler reads, empty and busy schedules,
  timezone boundaries, running/paused jobs, duplicate IDs, unchanged landing paths and queue predicates.

## Running app verification

Deployment: ed6db7d9, https://test-worx-eh6o0d8bq-nw-fire.vercel.app (production Ready).

Signed-in office session at www.tradeworx.net:

- Old Dashboard URL loads Home; sidebar, header and document title display Home.
- Unassigned: Home 143, filtered inspections 143.
- Payment collection: Home 29, filtered inspections 29.
- Linked visits: Home 1, filtered inspections 1; Enter activated the link.
- Ready to bill: Home 13, Ready To Bill selected, matching queue 13 summaries.
- Browser Back returned to Home after each queue. Mobile-width queue click also worked.
- Today's empty state matched the full scheduler's November 23 day view (0 visits).
- View schedule opened a separate browser tab, leaving Home open.
- Checked 1920x1080, 1440x900, 1024x768, 800x720 and 390x844. Main/page scroll widths did
  not exceed client widths. Two columns became stacked cards as available width narrowed.
- Browser viewport overrides and temporary verification tabs were removed after testing.

## Verification limits

- No signed-in technician session was provided. Technician browser/offline-device testing remains
  outstanding; automated tests are not represented as signed-in technician verification.
- Busy day, all-zero attention, running/next job ordering and multi-company isolation were tested
  with fixtures/predicate checks, not by altering live records or the production clock.
- No actual Home job could be opened in the live session because today's schedule was empty.
  Read-only behavior is covered by the scheduler regression tests and unchanged detail links.
- Existing $RS parentNode and React hydration #418 console errors appeared before and after this
  change. The tested links completed, but this does not constitute a clean-console verification.
  These shared streaming issues were already documented in prior layout/attention audits.
