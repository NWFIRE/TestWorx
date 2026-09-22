# Settings layout

Billing and integration settings occupy the main column. Company preferences
are compact controls on the right (above the content on smaller screens).
Tenant branding and sidebar order open native modal side panels. Closing a panel
does not discard its mounted form draft; Escape and Close restore trigger focus.
Plans and add-ons are collapsed until requested.
QuickBooks Online is also collapsed by default, with its connection and sync
controls behind Manage connection. A returned QuickBooks action notice opens
the section so feedback remains visible. Internal Stripe configuration and
entitlement diagnostics are not displayed in the subscription card; checkout
and billing-portal permission/configuration guards remain unchanged.

Fee, minimum-pricing, labor, and branding grids size columns against available
space instead of forcing five or six fields into a narrow desktop column.
Collapsed disclosure sections are inert and hidden from assistive technology.
Existing forms, actions, permissions, and field names are unchanged.

Run `node scripts/check-settings-layout.cjs` for isolated browser checks with
mocked save actions. No production records are modified by this test.
