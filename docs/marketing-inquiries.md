# Trial and demo requests

## Flow

- `/start-trial` collects a request for team-assisted free-trial setup. It does
  not create a tenant, user, subscription, or payment transaction.
- `/book-demo` collects a demo request and optional availability/time zone.
  An appointment is not reserved automatically; the team confirms it directly.
- Every homepage trial/demo CTA (including mobile navigation and pricing cards)
  points to these pages. Pricing cards preserve the requested plan in the URL.
- Existing customer sign-in remains `/login`.

## Email configuration

The server uses the existing `RESEND_API_KEY` and `RESEND_FROM_EMAIL` settings.
`MARKETING_INQUIRY_EMAIL` optionally overrides the recipient. Its default is
`hello@tradeworx.net`, the homepage's existing published contact address. Ensure
this mailbox is monitored before promoting the forms. Invalid email configuration
fails safely; it never reports a request as sent.

Requests are plain-text emails to the fixed business recipient. The visitor's
email is Reply-To, not a destination, preventing an arbitrary-recipient email relay.
The email contains contact details, company, selected plan, team size, message,
availability, consent, and a request reference. There is no new database table:
accepted requests are handled through the receiving mailbox and provider logs.
No visitor details or provider secrets are written to application logs.

## Reliability and abuse protection

- Server-side validation, field size limits, same-origin JSON submissions, and a
  hidden honeypot protect the public endpoint.
- In-memory limits allow 10 attempts per IP, 5 per email, and 100 valid requests
  total per hour per running server instance. Keys are hashed, expire after an
  hour, and the map is bounded. These are not distributed limits: add a Vercel
  WAF rate-limit rule on `/api/marketing/inquiries` for sustained or distributed
  abuse. No claim of comprehensive bot protection is made.
- A stable request ID and content-based Resend idempotency key prevent identical
  retry emails within the provider's idempotency retention window.
- Submission disables duplicate clicks. Errors preserve entered values; retries
  keep the request ID. Success is displayed only after provider acceptance with
  a message ID, not merely after clicking the button.
- Provider acceptance is not proof of inbox delivery. Monitor delivery/bounce
  events in Resend and the receiving mailbox. Visitors can contact the published
  email directly if submission fails.

## Verification

Unit tests cover validation, honeypot, fixed/configured recipient, reply address,
idempotency, throttling, and provider/configuration failures. Playwright tests
cover CTA destinations, plan carry-through, mobile layout, both success states,
retry behavior, and API rejection of cross-origin/invalid requests. Successful
delivery is mocked in tests so regression runs do not send real sales emails.

Release verification: production build and TypeScript passed; 26 inquiry and
existing account-email unit tests passed; all 12 homepage/inquiry browser tests
passed against the production build. Web lint excludes only the pre-existing
untracked `.next-corrupt-20260902/**` generated cache.

Run:

```powershell
npm run test --workspace @testworx/lib -- src/__tests__/marketing-inquiries.test.ts
$env:TRADEWORX_BASE_URL = "http://localhost:3000"
npx playwright test e2e/marketing-homepage.spec.ts e2e/marketing-inquiries.spec.ts
```
