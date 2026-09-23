# Monthly inspection lists

Open Inspections > Monthly list / CSV, or choose View full month / CSV on an Upcoming month card. Select a month, click View month, then Download CSV.

The list includes all statuses scheduled in that calendar month in the tenant timezone, ordered by scheduled time and ID. It is not limited to the 60-day operational queue and does not generate recurring visits. Each stored inspection remains a separate row; repeated service types are summarized, not deleted. The CSV contains exactly the displayed rows plus the timezone and full inspection ID. All rows are exported, including an empty header-only export when nothing is scheduled.

Only tenant/office administrators may access this tenant-scoped view. Downloads are generated locally from authorized page data. CSV cells are quoted and spreadsheet formula prefixes escaped. No database changes or migrations are required.

Tests: `npm run test --workspace @testworx/lib -- src/__tests__/monthly-inspections.test.ts`.
