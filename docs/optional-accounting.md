# Optional accounting integrations

## Standalone billing

No accounting connection is required to review report-derived billing, edit lines,
add a custom description/category/quantity, export a billing worksheet, or mark
work invoiced externally. Custom lines do not require a QuickBooks catalog record.
They retain their identity and manual-line metadata across report refreshes.

Billing Detail exports a provider-neutral UTF-8 CSV containing customer, site,
inspection and source line IDs, descriptions, categories, quantities and units.
It intentionally excludes prices and tax calculations. It is a worksheet, not a
guaranteed provider-specific invoice import template. Import column mapping and
required accounting fields depend on the destination system. Exporting is read-only
and uses only the billing data already authorized for the current user.

QuickBooks remains an optional existing integration. Its mapping checks apply only
to QuickBooks sync, not local billing review. A disconnected or unavailable
connection-status check does not block the detail page. Existing linked invoices
remain protected against editing/rebilling. Mark invoiced records the local workflow
state; it does not create an invoice in any external accounting system.

No database migration is required. No new provider credentials are stored.

## Direct connector status

| Provider | Status |
| --- | --- |
| QuickBooks Online | Existing connection and sync retained; optional |
| Xero | Requested; direct connector not implemented |
| FreshBooks | Requested; direct connector not implemented |
| Sage Accounting | Requested; direct connector not implemented |
| Sage Intacct | Requested; direct connector not implemented |
| Sage 50 regional editions | Requested; direct connector not implemented |

Do not advertise a universal Sage connection or present inactive Connect buttons.
Future onboarding should ask the subscriber for their product and region, not
require the TradeWorx operator to choose one Sage edition for every company.

Each connector needs a tenant-scoped connection model/migration, registered provider
app, secure authorization/token handling, provider-company selection, catalog and
customer mappings, idempotent manual invoice creation, reconciliation, disconnect,
and sandbox verification before being made available. Sage desktop editions also
need an edition-specific integration mechanism; an OAuth dropdown alone is not one.

Official integration references:

- Xero OAuth: https://developer.xero.com/documentation/guides/oauth2/overview
- FreshBooks OAuth: https://www.freshbooks.com/api/authentication
- Sage Accounting app registration: https://developer.sage.com/accounting/docs/v1.0.0/guides/learning/getting-started/client_app_registration
- Sage Intacct Web Services: https://developer.intacct.com/web-services/
- Sage 50 US SDK: https://us-kb.sage.com/portal/app/portlets/results/viewsolution.jsp?solutionid=221924850014403

## Verification

- 149 focused billing/export/QuickBooks tests passed, four skipped.
- Full library suite: 817 passed, 14 skipped. Production build, lint, and TypeScript checks passed.
- Ten browser checks passed, including a custom line with an empty catalog and the actual status-actions component with
  no connection and missing mappings; local review and external-invoiced actions
  work without calling an accounting action. Browser server actions are stubbed.
- Export tests cover multiline/quoted descriptions and formula-injection protection.
- Signed-in staging persistence and real provider sync still require test access.
  QuickBooks sandbox access is not a prerequisite for standalone billing acceptance;
  it is required only to verify QuickBooks sync. No production deployment performed.
