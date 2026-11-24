# Scheduler

Office and tenant administrators open Work > Scheduler in a new browser tab, leaving
their current page unchanged. Today opens in Day view.
Opening an inspection from the detail panel reuses the same-origin tab that
launched Scheduler. If that tab was closed or is unavailable (including older
Scheduler tabs opened without an opener), it navigates the current tab instead.
No extra inspection tab is created by a normal click.
Week uses Monday through Sunday in the tenant's configured timezone. Empty team
rows remain visible. Phones use an agenda; larger screens scroll inside the board.

Select Schedule job, search an existing inspection, choose all assigned technicians,
and enter a start/end. Overlaps require explicit acknowledgement. Concurrent edits
require reloading details. Rescheduling changes only the selected appointment and
assignments, not recurrence anchors, task due periods, or future inspections.
Visits without a planned end still display their saved start time (including an
unchanged 9:00 AM default) and "End not set" in Day, Week, and mobile agenda views.
Day view places a small 15-minute visual marker at the saved start; this is not
a stored or assumed duration. An explicit resize can set the end time. Merely
viewing or refreshing never fills in an end or changes the start. Closed inspections are read-only.

Drag the right-edge grip of a Day appointment to adjust its end time in 15-minute
increments. In Week view, drag the bottom grip up/down (16 pixels per quarter hour).
Arrow keys on a focused grip adjust by one quarter hour. Pointer cancellation or
Escape cancels the preview. A preview displays the proposed end before release.
Duration is bounded to 15 minutes through seven days. Conflicts open the existing
review panel; failed/stale edits leave saved records intact. Resize-only writes
preserve the start, technician assignments, unassigned claimability, recurrence,
report status, and field progress. No schema migration is needed.

Click outside the detail panel or press Escape to close it. Unsaved edits prompt
before dismissal; saves in progress cannot be dismissed. The board now uses a
darker time header, stronger row/grid dividers, and shaded appointment cards.

The visible range refreshes every 15 seconds while the page is visible, and on
focus/reconnect. Delayed updates are indicated after 45 seconds or a failed fetch.
The open panel and scroll position remain intact. Active visits outside today's
planned range remain discoverable. Each range is capped at 2,000 visits with a warning.

Start/resume, pause, and Finish work use persisted job time sessions. Finish work
stops that technician's timer without finalizing reports; resume to edit/finalize.
Report edits retain their existing Pending behavior. Finalization still stops job
time and follows the existing billing workflow. Offline field events appear after
sync. Planned duration is never used to infer completion.

Migration 202611190001_scheduler_range_index adds a backwards-compatible index on
Inspection(tenantId, scheduledStart); it changes no records or required columns.

Verification: scheduler and job-time Vitest suites cover authorization, concurrency,
overlaps, recurrence-safe writes, DST and progress. `node scripts/check-scheduler.cjs`
exercises the real React board with two browser contexts and a shared fixture API,
including polling and mobile/tablet overflow. This is not a substitute for an
authenticated office/technician production smoke test.

`e2e/scheduler-interactions.spec.ts` exercises the actual board with an isolated
API fixture: Day/Week drag resize, keyboard adjustment, conflict review, outside
dismissal, and reuse/fallback navigation with two real browser tabs. Backend tests
cover duration-only mutation boundaries, unassigned jobs, stale/closed records,
authorization and conflicts. Production inspection data is not modified by these tests.
