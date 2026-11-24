# Inspection creation scheduling fields

New-inspection creation no longer displays Visit month, Dispatch anchor, Visit end,
or Visit status. The per-service Scheduling status dropdown is also removed in
creation; all services are included for their selected due month, defaulting to
the current month. A later due month creates later work rather than requiring a
second scheduling-status selection. The existing initialized values are submitted as hidden fields
to preserve the parser, defaults, seeded creation flows, and duplicate checks.
The service-line Due month, technician assignment,
and recurrence controls remain unchanged. Service-line scheduling still determines
the generated visit groups; a regression covers a service date outside the hidden
default visit month.

Existing inspection edits and reason-based rescheduling retain the visible visit
controls, including per-service hard dates. No database schema or existing-record changes are required.

Creation now has a single optional Schedule Inspection control at the bottom,
instead of per-service hard dates. Selecting a date/time affects only the visit
group due in the creation form's current month. Other due months and generated
recurring visits retain their existing dates and recurrence anchors. A date in
another calendar month changes the appointment, not the original service due month.
With the option off, no appointment override is submitted. Enabling it without a
valid date/time or without current-month services fails validation.

The server resolves the appointment in the authenticated company's time zone using
the Scheduler's existing DST-safe conversion. Duplicate detection and creation use
the same appointment-aware visit plan. The first day of a month is treated as an
explicit appointment, not mistaken for the automatic month anchor.

Verification: 77 scheduling/Scheduler tests and three browser fixtures passed. Browser fixtures
render the actual conditional JSX extracted from the form and verify create/edit
visibility and submitted hidden values. No production inspection was created as a test.
