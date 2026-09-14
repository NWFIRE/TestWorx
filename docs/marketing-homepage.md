# Public homepage

The September 2026 refresh uses an original photo-led hero, navy/blue branding,
clear platform outcomes, role-based benefits, and a mobile navigation menu.
ServiceTrade's homepage informed the general layout direction; copy and visuals
are TradeWorx's own. The field technician image is AI-generated illustrative
marketing imagery, not a customer testimonial or an actual app screenshot.

## Scope

- Styles are scoped to the marketing components and their CSS module.
- Authentication, inspection workflows, billing, and tenant data are unchanged.
- Existing login, pricing, legal, and contact destinations are retained.
- Redundant simulated dashboard sections are no longer rendered on the homepage.
- Hero imagery is a compressed local WebP, served through Next Image.
- Header and footer use the app's existing `/icon.png` TradeWorx logo and
  matching uppercase wordmark rather than a separate marketing placeholder.
- Animation respects reduced-motion preferences.

## Regression checks

`e2e/marketing-homepage.spec.ts` covers responsive widths, overflow, section
destinations, mobile menu behavior, Escape focus restoration, and login links.
Run against a local production server with `TRADEWORX_BASE_URL` set to its URL.
Also visually review desktop, tablet, and narrow mobile layouts, confirm the
image loads, and check the browser console for errors.

Validation for this refresh: production build (including TypeScript) passed;
all six homepage Playwright tests passed; desktop/mobile visual and console
checks passed. Workspace lint passed with the pre-existing untracked
`.next-corrupt-20260902/**` generated cache excluded from the lint command.
That cache was left untouched.
