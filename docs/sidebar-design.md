# Sidebar presentation

The sidebar uses white surfaces, muted blue line icons, flat navigation rows,
slim blue active indicators, title-case accordion headings, and TradeWorx branding.
Desktop icon-only mode and the existing mobile drawer remain supported. Sign out
remains inside Settings; no routes or permissions are changed by the redesign.

Work, Billing, Customers, Operations, and Settings keep the existing exclusive
click-to-expand behavior. Closed panels are inert and hidden from assistive
technology. Each navigation instance has distinct panel IDs for desktop/mobile.
Request counts remain visible on the Requests link or its closed group header.

Run `node scripts/check-sidebar-design.cjs` for browser tests of the actual sidebar
components and navigation configuration. It checks accordion and keyboard behavior,
active links, navigation, sign out, icon-only tooltips, narrow sizing, and role
isolation. Preview screenshots are written under the untracked outputs directory.
