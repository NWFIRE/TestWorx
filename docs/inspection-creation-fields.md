# Inspection creation scheduling fields

New-inspection creation no longer displays Visit month, Dispatch anchor, Visit end,
or Visit status. The per-service Scheduling status dropdown is also removed in
creation; all services are included for their selected due month, defaulting to
the current month. A later due month creates later work rather than requiring a
second scheduling-status selection. The existing initialized values are submitted as hidden fields
to preserve the parser, defaults, seeded creation flows, and duplicate checks.
The service-line Due month, Hard scheduled date, technician assignment,
and recurrence controls remain unchanged. Service-line scheduling still determines
the generated visit groups; a regression covers a service date outside the hidden
default visit month.

Existing inspection edits and reason-based rescheduling retain the visible visit
controls. No schema or stored-record changes are required.

Verification: 48 scheduling tests and two browser fixtures passed. Browser fixtures
render the actual conditional JSX extracted from the form and verify create/edit
visibility and submitted hidden values. No production inspection was created as a test.
