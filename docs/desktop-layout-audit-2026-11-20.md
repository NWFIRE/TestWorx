# Desktop layout audit - 2026-11-20

## Scope and status

Inventoried all 63 App Router page files and reviewed shared shell, navigation,
layout patterns, and detail/edit routes. Implemented targeted presentation changes.
This is not a claim that every role-specific page or every interaction is certified:
the signed-in browser account was Office Admin. No production records were saved,
deleted, uploaded, invoiced, or otherwise changed during verification.

## Changes

- Keep the shared header from shrinking in short windows.
- Shared page headers/actions wrap intrinsically; split panels wrap based on their
  available width rather than forcing columns based solely on viewport size.
- Keep eight-column inspection rows readable in a local horizontal scroll region
  on desktop. Match header padding to row padding. Existing phone cards remain.
- Quote and invoice line fields use auto-fit grids. Creation forms and manual
  editing screens have bounded reading widths; data-heavy pages retain their width.
- Desktop confirmation actions wrap without clipping.
- Remove desktop idle transform promotion from the pull-to-refresh wrapper and
  desktop backdrop filtering on sticky report headers. These created containing
  blocks that clipped fixed Add Report dialogs. Phone rules remain unchanged.
- Shared search-select menus measure visible space only while open on desktop,
  account for scrollable/clipping ancestors, resize and scroll, and open upward
  when needed. Phone menu layout is unchanged. No search semantics changed.
- Added scripts/check-desktop-layout.cjs for compiled CSS scoping and pure picker
  placement regressions. No schema, permissions, storage, billing, or report-save
  business rules were changed. No global overflow-hiding workaround was added.

## Browser method and coverage

Main matrix: 1920x1080, 1440x900, 1366x768, 1280x720, 1024x768, 800x720.
Used the running production browser with the signed-in Office Admin account.
Measured main/root widths and local scroll regions, with visual spot checks.
Not every viewport of every page received a separate exhaustive visual review.

Additional checks:
- Inspection list: long customer search, active status filter, sidebar states,
  and stepped resizing from 800 to 1440 in 40px increments. Search/filter persisted.
- Inspection detail: address/directions, report actions, PDF upload area, and an
  unsaved document label retained across all six sizes and 390x844; then cleared.
- Scheduler: Day and Week with job details open; date and selected job persisted;
  technician/time headers and bars inspected. Panel scrolled within 800x600.
- Add Report: reproduced clipping, verified corrected full-viewport dialog at
  800x450 and all six main sizes. Search retained; canceled without adding.
- Recurring inspection delete confirmation: 1024x450, all actions reachable;
  canceled without deleting.
- Settings branding drawer: 1024x450, scrolled to Save/Close; closed without saving.
- Quote customer picker: 800x450 menu bottom 442px; at 800x320 opened upward.
  Query retained at 1440x900, 1024x768 and 390x844. Phone inline override absent.
- Representative 390x844 inspection list/detail and picker checked against
  pre-change phone observations. Actual technician-account mobile testing pending.
- Public trial/demo and legal pages checked; reset/invite only without tokens.

## Route inventory

The matrix denotes responsive geometry checks plus visual spot checks, not full
functional transaction coverage. Details were opened using existing records.
Restricted routes were not bypassed or tested by impersonation.

| Route | Verification |
| --- | --- |
| `/` | Browser: six-size layout matrix and visual spot checks |
| `/accept-invite` | Browser: six-size matrix, no-token state only |
| `/app` | Routing/source reviewed; redirect entry, not separate screen |
| `/app/admin` | Routing/source reviewed; redirect entry, not separate screen |
| `/app/admin/amendments` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/archive` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/archive/[inspectionId]` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/billing` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/billing/create` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/billing/[inspectionId]` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/clients` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/clients/[customerId]` | Browser: six-size layout matrix and visual spot checks; overview and edit |
| `/app/admin/contract-providers` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/contract-providers/[providerId]` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/customer-intakes` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/customer-intakes/[intakeId]` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/dashboard` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/email-reminders` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/inspections` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/inspections/monthly` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/inspections/[inspectionId]` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/manuals` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/manuals/new` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/manuals/[manualId]` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/parts-and-services` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/quotes` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/quotes/new` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/quotes/[quoteId]` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/reports` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/reports/[inspectionId]/[taskId]` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/scheduler` | Browser: Day and Week, six-size matrix with job detail open |
| `/app/admin/scheduling` | Routing/source reviewed; redirect entry, not separate screen |
| `/app/admin/service-requests` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/settings` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/team` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/timesheets` | Browser: six-size layout matrix and visual spot checks |
| `/app/admin/upcoming-inspections` | Browser: six-size layout matrix and visual spot checks |
| `/app/customer` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/customer/inspections/[inspectionId]` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/customer/quotes/[quoteId]` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/customer/reports/[reportId]` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/deficiencies` | Browser: six-size layout matrix and visual spot checks |
| `/app/manuals` | Browser: six-size layout matrix and visual spot checks |
| `/app/manuals/[manualId]` | Browser: six-size layout matrix and visual spot checks |
| `/app/platform` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/profile` | Browser: six-size layout matrix and visual spot checks |
| `/app/tech` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/tech/inspections` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/tech/inspections/[inspectionId]/documents/[documentId]` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/tech/profile` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/tech/reports/[inspectionId]/[taskId]` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/tech/reports/[inspectionId]/[taskId]/review` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/tech/requests` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/tech/timesheets` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/app/tech/work` | Source reviewed; role-specific signed-in browser verification unavailable |
| `/book-demo` | Browser: six-size layout matrix and visual spot checks |
| `/intake/customer/[token]` | Source reviewed; valid test token unavailable |
| `/login` | Browser: six-size layout matrix and visual spot checks |
| `/privacy` | Browser: six-size layout matrix and visual spot checks |
| `/quote/[token]` | Browser: six-size matrix, existing expired quote read-only |
| `/reset-password` | Browser: six-size matrix, no-token state only |
| `/start-trial` | Browser: six-size layout matrix and visual spot checks |
| `/terms` | Browser: six-size layout matrix and visual spot checks |

## Automated verification

- Production build succeeded; latest application deployment Ready and aliased to
  www.tradeworx.net and tradeworx.net.
- TypeScript no-emit check passed.
- ESLint passed with the pre-existing .next-corrupt-* generated directory excluded.
- Full library suite: 80 files passed, 1 skipped; 788 tests passed, 14 skipped.
  Command: npm run test --workspace @testworx/lib -- --maxWorkers=1 --testTimeout=30000.
  Initial concurrent build/test run hit default five-second timeouts; isolated
  and full single-worker reruns passed without changing assertions.
- scripts/check-desktop-layout.cjs passed.
- scripts/check-location-lookup.cjs passed.
- Targeted scheduler/shared/delete-navigation regression checks: 31 passed.
- No schema or seed changes; production seed execution intentionally not performed.

## Remaining verification and risks

- Technician, customer, and platform-admin signed-in sessions unavailable.
  A request for technician/customer test sessions was sent; no credentials bypassed.
- No valid public intake or technician document-signing test token exercised.
- Actual browser zoom at 125% and 150% could not be applied by the available
  browser controls. Viewport resizing is not counted as zoom verification.
- Resizing was stepped programmatically, not a continuous physical window-edge drag.
- No production save/finalize/delete/payment/email side effects used as tests.
- Existing React hydration error #418 and a streamed billing parentNode error were
  observed before these changes. They were not resolved in this layout pass;
  console cleanliness across all routes cannot be certified.
- Native date-picker behavior across operating systems and all browser engines
  remains unverified. Testing used the available Chromium-based browser.
- Build emits an existing outdated Browserslist-data warning.

