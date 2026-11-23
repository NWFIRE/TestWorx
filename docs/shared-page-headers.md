# Shared page headers

Home and other app page banners share `page-banner.module.css`: blue-to-teal
gradient, subtle diagonal detail, white titles, light supporting text, and a
light action surface. The teal stop is slightly darker than the original Home
refresh to maintain 4.5:1 contrast for supporting text even under the stripes.

Coverage includes every `PageHeader` consumer (inspection queues, archive,
customers, billing queue, quotes, reports, team, settings, requests, timesheets,
profile, manuals), Scheduler, manual details, Home, Billing Detail, inspection
details, customer portal landing, technician inspections/timesheets, and platform
overview. Persistent navigation and specialized field report editing toolbars
are intentionally unchanged; report/PDF content and tenant branding records are
not modified.

Verification uses the actual shared CSS in browser fixtures at 390, 800, and
1440 pixels, plus the Home resize suite at six viewport widths. Contrast tests
check all three gradient stops with the brightest stripe composited above them.
Fixtures are not signed-in end-to-end coverage of every route.
