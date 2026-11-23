# Home presentation

Home retains its existing data queries, queue destinations, role-specific section
order, search behavior, and schedule links. This change is presentation-only.

The shared Home stylesheet uses a blue/teal header, amber attention accents,
teal schedule accents, and compact time labels. Columns respond to Home's content
width with a container query rather than assuming the sidebar is collapsed.
Narrow layouts stack without remounting components. Motion is limited to hover
feedback and respects reduced-motion preferences.

## Verification

- Six Chromium layout fixtures use the shipped Home stylesheet at 390, 800, 1024,
  1366, 1440, and 1920 pixels, with additional resize steps through 500 pixels.
- Checks cover long/unbroken names, empty schedule, page overflow, reachable
  schedule action, keyboard focus, and retained search text during resizing.
- Desktop and phone fixture screenshots were visually inspected.
- Nine Home schedule/navigation regression tests passed.
- Production build (including type checks) and web lint passed.
- These are isolated presentation fixtures, not signed-in end-to-end verification.
  No production records, permissions, or inspection statuses were changed.
