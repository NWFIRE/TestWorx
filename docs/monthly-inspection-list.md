# Monthly inspection lists

Open Inspections > Monthly list / CSV, or choose View full month / CSV on an Upcoming month card. Selecting a valid month automatically updates the URL and server-rendered list without a full page reload or scroll reset. Back/forward navigation restores the selected month. Download CSV is disabled while the selection and loaded rows differ, preventing exports of the previous month during loading.

The list includes all statuses scheduled in that calendar month in the tenant timezone, ordered by scheduled time and ID. It is not limited to the 60-day operational queue and does not generate recurring visits. Each stored inspection remains a separate row; repeated service types are summarized, not deleted. The CSV contains exactly the displayed rows plus the timezone and full inspection ID. All rows are exported, including an empty header-only export when nothing is scheduled.

Only tenant/office administrators may access this tenant-scoped view. Downloads are generated locally from authorized page data. CSV cells are quoted and spreadsheet formula prefixes escaped. No database changes or migrations are required.

Placeholder location names are blank. Addresses use the shared customer-facing resolver: real site address, customer service address, then customer billing address, with placeholder address parts suppressed. Both the table and CSV consume the same resolved values.

Tests: `npm run test --workspace @testworx/lib -- src/__tests__/monthly-inspections.test.ts`.

Browser regression checks: `node scripts/check-monthly-controls.cjs` and `node scripts/check-monthly-export.cjs`. Controls are real; router/server responses are simulated in the control harness.
