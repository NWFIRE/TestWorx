# Field service requests

Technicians use Request Support to submit service tickets, work orders, follow-up visits, quote requests, or other requests. An active customer is required; a saved site is optional. The office queue is available under Work > Requests. Pending requests also appear in dashboard attention when the dashboard loads. This is an in-app queue notification, not an email or device push notification.

Submission requires a connection. Validation or connection errors preserve the current form's fields. A successful submission clears the form. Each submission uses a stable UUID across retries so a lost response does not create a second request. Reloading or leaving the page does not preserve an unsent form.

The customer selector supports instant, case-insensitive partial search by customer name or saved site/address. Results use the already authorized customer list, without additional requests. Select a result before sending; typing alone does not select a customer. Changing or clearing the customer resets the optional site. Keyboard selection and a clear control are supported.

Office review supports acknowledgement, resolution, and decline with an optional note. Repeating the same review does not change its timestamp. A stale review cannot reopen a closed request or overwrite a competing edit. Create scheduled work opens a one-time work order with customer/site, field details, urgency, and the requesting technician preselected. Office staff can adjust the assignment. If that technician is unavailable, the form asks staff to select an active technician.

Saving the new ticket automatically resolves its source request in the same database transaction and records the ticket ID in the request audit log. Failed saves and duplicate warnings leave the request open. An explicit successful addition to an existing inspection also resolves the request after the selected report types have been added. The technician's request status and office sidebar badge refresh after success. Closing the creation form clears the source request reference.

## Verification

The admin sidebar displays a red badge for pending requests. Closed Work groups show the same count on their header. Counts refresh every 30 seconds while visible, on navigation/window focus, and after office review. Acknowledged or closed requests no longer count. Temporary network failures preserve the last known count. Run `node scripts/check-request-badge.cjs` to verify count refresh behavior with simulated API responses.

Run `npm test --workspace @testworx/lib -- --run src/__tests__/field-service-requests.test.ts` for validation, tenant isolation, retry, and review concurrency checks.

Run `node scripts/check-field-request-form.cjs` for phone-width Chromium checks against the real form component with simulated success, validation failure, and connection failure responses. This does not submit production requests.

Browser smoke checks:

- Submit for a customer with no saved sites.
- Change customers after selecting a site and verify the selection clears.
- Trigger validation or a connection failure and verify the entered details remain.
- Retry after a lost response and verify there is one saved request.
- Review from two office sessions and verify a stale save cannot overwrite the first.
- Open Create scheduled work and verify the creation form and selected customer/site.

The `202609080001_field_service_requests` migration must be applied to the deployment's database before serving the feature. Local build success does not verify production migration state.
