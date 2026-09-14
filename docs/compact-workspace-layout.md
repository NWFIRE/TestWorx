# Compact workspace layout

Authenticated pages have smaller outer gutters. Shared page shells, section
cards, headings, split layouts, and metric cards use tighter spacing. Public
marketing pages are not targeted. Mobile safe-area and keyboard clearances,
form field sizes, navigation, and touch targets remain unchanged.

Billing detail uses a single metric strip, shorter category headers and empty
states, horizontal line controls when space allows, and a native disclosure for
the optional additional-line form. All existing form actions, hidden identifiers,
permissions, locks, catalog matching, and report links are preserved. Tax status
is shown once instead of repeating it as a badge.

The PDF retains its existing column width and desktop visibility threshold. Its
height now follows the viewport with a 32rem minimum instead of forcing 50rem.
PDF zoom, scrolling, download, and report selection remain available.

`e2e/billing-density.spec.ts` checks the real billing stylesheet in isolated
responsive fixtures at 320, 390, 768, 1280, 1536, and 1920 pixels. It does not
submit real billing data or claim to verify authenticated end-to-end mutations.
