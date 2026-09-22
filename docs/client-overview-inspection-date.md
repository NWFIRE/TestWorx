# Client overview inspection date

Last inspection includes only completed or invoiced inspections for the current
tenant and customer. It is independent of the 50-row inspection history preview.
Future recurrences, unfinished visits and cancelled work do not count.

For each completed visit, use its latest finalized report timestamp, then its
inspection completion timestamp, then its scheduled date for legacy completed
records without either timestamp. Report timestamps take precedence because
later administrative status repairs can update the inspection completion date.
Never display a future timestamp as the last inspection. With no qualifying
history the existing empty-date display is retained. No stored dates are changed.
