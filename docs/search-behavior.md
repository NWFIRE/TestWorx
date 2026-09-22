# Shared search behavior

List searches use the Clients directory pattern: a plain search field, a Clear
control, results in the page, and no suggestions or work triggered by focus.
Remote searches wait 1,200 ms after the last edit (`SEARCH_DEBOUNCE_MS`). Enter
or leaving the field applies the query immediately. Clear resets the query and
keeps focus without scrolling. Existing local filters remain immediate because
they do not need a network request.

`SearchInput` provides the shared presentation and form-safe keyboard behavior.
`LiveUrlSearchInput` retains URL filters, resets configured pagination keys,
navigates without scrolling, preserves newer drafts when responses arrive,
handles browser history and composition input, and cancels pending timers on
unmount. The Clients directory retains its abortable API and request sequencing.

Inspection, archive, technician work, manuals, team, email recipient, catalog,
quote, and ready-to-bill list searches share these controls. Report-type and
client-profile local filters use the same presentation. Record selectors (such
as customer, site, and catalog selection) retain their accessible choice menus:
they choose IDs rather than filter a page. Dashboard search still navigates on
Enter so a pause in typing does not take users away from the dashboard.

No server matching rules, tenant scopes, roles, or save actions are changed.
Run `node scripts/check-search-behavior.cjs` for browser regression checks of the
actual shared components, with a mocked Next router. Production data is not
modified by these tests.
