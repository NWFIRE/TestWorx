# Scheduler

Office and tenant administrators open Work > Scheduler in a new browser tab, leaving
their current page unchanged. Today opens in Day view.
Opening an inspection from the detail panel also opens a separate tab, keeping
the live board available.
Week uses Monday through Sunday in the tenant's configured timezone. Empty team
rows remain visible. Phones use an agenda; larger screens scroll inside the board.

Select Schedule job, search an existing inspection, choose all assigned technicians,
and enter a start/end. Overlaps require explicit acknowledgement. Concurrent edits
require reloading details. Rescheduling changes only the selected appointment and
assignments, not recurrence anchors, task due periods, or future inspections.
Missing planned end times display Time TBD. Closed inspections are read-only.

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
