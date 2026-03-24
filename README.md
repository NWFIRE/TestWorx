# TradeWorx

Production-oriented MVP foundation for a multi-tenant fire inspection SaaS built for Vercel deployment.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- NextAuth credentials auth
- Stripe billing foundation with webhook sync
- Vercel Blob storage support for private media and PDFs
- npm workspaces monorepo
- Vitest for critical service tests

## Workspace layout

```text
/apps/web        Next.js application surfaces
/packages/db     Prisma schema, migration, and seed data
/packages/lib    Auth, billing, branding, scheduling, reporting, and PDF services
/packages/types  Shared domain types and schemas
/packages/ui     Reusable UI primitives
```

## Local setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL and point `DATABASE_URL` at an empty database.
3. Install dependencies:

```bash
npm install
```

4. Generate Prisma client and run migrations:

```bash
npm run db:generate
npm run db:status
npm run db:migrate
```

5. Seed the demo workspace:

```bash
npm run db:seed
npm run db:verify
```

Fastest first-time bootstrap:

```bash
npm run db:bootstrap
```

`npm run db:bootstrap` is for local/demo environments only because it runs the demo seed and verification flow.

For a live pilot or production database, run migrations only and then use the one-time pilot bootstrap command to create the real tenant and users.

6. Start the app:

```bash
npm run dev --workspace @testworx/web
```

7. Confirm the app sees the environment and database:

```bash
curl http://localhost:3000/api/health
```

8. Optional production verification before deploy:

```bash
npm run test
npm run test:db
npm run lint
npm run build
npm run validate:release
```

`npm run test:db` runs the Postgres-backed integration suite in `packages/lib/src/__tests__/postgres.integration.test.ts`. It skips cleanly when `DATABASE_URL` is not set.

## Required env vars

Core:
- `DATABASE_URL`
- `AUTH_SECRET`
- `NEXTAUTH_URL`
- `APP_URL`

Hosted Postgres note:
- If you are using Neon or a similar hosted provider, use the direct PostgreSQL connection string for Prisma migrate/seed/verify flows.
- Pooled URLs often contain `pooler` in the hostname and are better reserved for app traffic than schema management.

Storage:
- `STORAGE_DRIVER` set to `vercel_blob` in durable environments or `inline` for lightweight local demos
- `BLOB_READ_WRITE_TOKEN` required when `STORAGE_DRIVER=vercel_blob`

Stripe foundation:
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PROFESSIONAL`
- `STRIPE_PRICE_ENTERPRISE`

QuickBooks Online invoice sync:
- `QUICKBOOKS_CLIENT_ID`
- `QUICKBOOKS_CLIENT_SECRET`
- `QUICKBOOKS_SANDBOX`

PDF generation:
- No extra PDF-specific env vars are currently required. PDFs are generated server-side from tenant/report data.

If Stripe env vars are omitted, the billing page still renders but checkout and portal actions stay disabled.
If QuickBooks env vars are omitted, the QuickBooks settings card still renders but connect/sync actions stay unavailable.
If `STORAGE_DRIVER=inline`, files stay database-safe for local demos but should be switched to `vercel_blob` before production traffic.
If required core env vars are missing, auth and health-check paths now fail with actionable setup messages.

## Storage validation

Required storage env vars:
- `STORAGE_DRIVER`
- `BLOB_READ_WRITE_TOKEN` when `STORAGE_DRIVER=vercel_blob`

Storage design notes:
- Production file access is server-mediated through app routes, not public blob URLs.
- Blob objects are written with `access: "private"`.
- Stored blob paths are tenant-prefixed and category-scoped:
  - `photo`
  - `signature`
  - `generated-pdf`
  - `uploaded-pdf`
  - `inspection-document-original`
  - `inspection-document-signed`
- Attachment and media downloads validate both app-level authorization and storage-key tenant/category ownership before retrieval.

Local or deployed validation with real blob credentials:

1. Set:

```bash
STORAGE_DRIVER=vercel_blob
BLOB_READ_WRITE_TOKEN=<your-real-vercel-blob-read-write-token>
```

2. Start the app:

```bash
npm run dev --workspace @testworx/web
```

3. Verify general readiness:

```bash
curl http://localhost:3000/api/health
```

4. Log in as `tech1@evergreenfire.com` and open a report editor.
5. Add at least one photo and both signatures, then autosave/finalize.
6. Log in as `office@evergreenfire.com` and upload a PDF attachment on an inspection.
7. Log in as `facilities@pinecrestpm.com` and download a finalized report PDF plus any customer-visible uploaded PDF.

What to test manually:
- Upload and persist:
  - technician photo upload
  - technician signature persistence
  - customer signature persistence
  - generated finalized PDF creation
  - uploaded inspection PDF attachment
- Authorized retrieval:
  - technician can retrieve report photos/signatures only for assigned work
  - office admin can download inspection/report PDFs for the tenant
  - customer user can download only customer-visible finalized PDFs
- Authorization failures:
  - customer user cannot retrieve raw report media from `/api/reports/storage`
  - technician from another assignment cannot retrieve someone else's report media
  - another tenant cannot access blob-backed attachments from a different tenant
- Replacement/deletion behavior:
  - replace a draft photo/signature and confirm the old blob is no longer referenced
  - re-finalize a report after updates and confirm the prior generated PDF is replaced

Suggested storage verification checklist:

1. Configure `STORAGE_DRIVER=vercel_blob` and `BLOB_READ_WRITE_TOKEN`.
2. Run `npm run dev --workspace @testworx/web`.
3. Confirm `/api/health` succeeds.
4. Save a technician draft with a photo.
5. Refresh the report editor and confirm the photo still loads through `/api/reports/storage`.
6. Finalize the report and confirm a generated PDF attachment is created.
7. Download that PDF as an admin.
8. Download the customer-visible PDF as the seeded customer user.
9. Attempt a raw media access as a customer user and confirm a `403`.
10. Attempt a cross-tenant attachment access with another tenant login and confirm it is denied.

Deployed validation checklist:

1. Set `STORAGE_DRIVER=vercel_blob` and `BLOB_READ_WRITE_TOKEN` in Vercel.
2. Deploy the app.
3. Repeat the same upload/download/denial checks in the deployed environment.
4. Verify no user-facing workflow depends on public blob URLs.
5. Confirm generated PDFs, uploaded PDFs, photos, and signatures all continue to load through authorized app routes.

## Demo credentials

All seeded demo users use `Password123!`.

Primary tenant demo:
- Platform admin: `platform@nwfiredemo.com`
- Tenant admin: `tenantadmin@evergreenfire.com`
- Office admin: `office@evergreenfire.com`
- Technician: `tech1@evergreenfire.com`
- Technician queue demo: `tech2@evergreenfire.com`
- Customer user: `facilities@pinecrestpm.com`

Secondary tenant isolation demo:
- Tenant admin: `admin@northshorelife.com`
- Technician: `tech@northshorelife.com`
- Customer user: `facilities@lakefrontresidences.com`

## Pilot bootstrap

Use a clean database for live pilot traffic. Do not run `npm run db:seed` against the live pilot database.

Required environment variables:
- `PILOT_TENANT_NAME`
- `PILOT_TENANT_SLUG`
- `PILOT_OFFICE_ADMIN_NAME`
- `PILOT_OFFICE_ADMIN_EMAIL`
- `PILOT_OFFICE_ADMIN_PASSWORD`
- `PILOT_TECHNICIAN_NAME`
- `PILOT_TECHNICIAN_EMAIL`
- `PILOT_TECHNICIAN_PASSWORD`

Optional environment variables:
- `PILOT_TIMEZONE`
- `PILOT_BILLING_EMAIL`
- `PILOT_CUSTOMER_COMPANY_NAME`
- `PILOT_CUSTOMER_CONTACT_NAME`
- `PILOT_CUSTOMER_BILLING_EMAIL`
- `PILOT_CUSTOMER_PHONE`
- `PILOT_CUSTOMER_USER_NAME`
- `PILOT_CUSTOMER_USER_EMAIL`
- `PILOT_CUSTOMER_USER_PASSWORD`

Cutover flow:

```bash
npm run db:generate
npm run db:migrate
npm run db:bootstrap:pilot
```

Example PowerShell session:

```powershell
$env:PILOT_TENANT_NAME="TradeWorx Pilot"
$env:PILOT_TENANT_SLUG="tradeworx-pilot"
$env:PILOT_OFFICE_ADMIN_NAME="Office Admin"
$env:PILOT_OFFICE_ADMIN_EMAIL="office@tradeworx.net"
$env:PILOT_OFFICE_ADMIN_PASSWORD="ChangeMe123!"
$env:PILOT_TECHNICIAN_NAME="Pilot Technician"
$env:PILOT_TECHNICIAN_EMAIL="tech@tradeworx.net"
$env:PILOT_TECHNICIAN_PASSWORD="ChangeMe123!"
npm run db:bootstrap:pilot
```

## Demo walkthroughs

Office admin / tenant admin:
- Log in as `office@evergreenfire.com` or `tenantadmin@evergreenfire.com`
- Create a multi-type inspection
- Choose the customer first and then pick from the filtered site list for that customer
- Leave an inspection unassigned to test the shared technician queue
- Use the admin CSV import card to bring in customers, sites, and optional assets with the provided template
- Open an existing inspection and upload a customer-visible PDF packet
- Open an existing inspection and attach an external customer PDF that can later be signed separately from the TradeWorx report workflow
- Open `/app/admin/amendments` to review original, amended, replacement, and superseded inspection chains

Technician:
- Log in as `tech1@evergreenfire.com`
- Open assigned inspections from the monthly dashboard
- Edit report sections, add deficiencies and photos, capture signatures, and finalize
- Open any external inspection PDF marked for signature, sign it in the field, and save the signed copy back to the inspection
- Log in as `tech2@evergreenfire.com` to claim an unassigned inspection from the shared queue

Report-type walkthrough map:
- `Pinecrest Tower`
  - `fire_extinguisher`
  - `fire_alarm`
- `Harbor Main Campus`
  - `wet_fire_sprinkler`
  - `backflow`
  - `fire_pump`
- `Summit Distribution Hub`
  - `dry_fire_sprinkler`
  - `industrial_suppression`
  - `emergency_exit_lighting`
- `Pinecrest West`
  - `kitchen_suppression`

Smart-report QA notes:
- Repeater-linked assets should prefill row details from site assets automatically.
- Read-only fields marked `Auto-calculated` should update from linked rows without manual editing.
- Current examples include:
  - `fire_alarm.devicesTested`
  - `wet_fire_sprinkler.controlValvesInspected`
  - `kitchen_suppression.coveredAppliances`
  - `industrial_suppression.agent-and-cylinders.cylinderCount`
  - `emergency_exit_lighting.fixturesInspected`
  - `emergency_exit_lighting.durationOutcome`
- In the technician editor, confirm each of those fields updates after changing repeater rows or source values, then verify the same values appear in preview and finalized output.

Customer portal:
- Log in as `facilities@pinecrestpm.com`
- Review finalized reports, customer-visible PDFs, and branded tenant details

Tenant isolation:
- Compare `tenantadmin@evergreenfire.com` with `admin@northshorelife.com`
- The seeded Northshore tenant has its own users, site, asset, and inspection data for cross-tenant boundary checks

## Key implemented foundations

- Strict tenant-aware service layer for auth, scheduling, report drafts, branding, and billing configuration
- Role-based auth and route-aware dashboard redirects
- Core domain schema for tenants, plans, customers, sites, assets, inspections, recurrences, reports, attachments, signatures, deficiencies, and audit logs
- Mobile-first technician dashboard with today, week, month, and unassigned work sections
- Reusable inspection-type configuration registry covering all supported inspection types
- Shared smart-report architecture for dropdown prefills, asset/site defaults, prior-report carry-forward, calculated fields, and repeatable row entries
- Standardized report-definition model with shared `fields`, `repeatableSource`, `optionProvider`, `prefill`, `mappings`, `calculation`, `readOnly`, and `validation` keys
- Customer portal with branded report visibility and PDF delivery
- Tenant-admin billing and branding settings page

## Supported inspection types

- `fire_extinguisher`
- `fire_alarm`
- `wet_fire_sprinkler`
- `backflow`
- `fire_pump`
- `dry_fire_sprinkler`
- `kitchen_suppression`
- `industrial_suppression`
- `emergency_exit_lighting`

## Report definition model

All report types should now be implemented through configuration in [packages/lib/src/report-config.ts](C:\Users\Jerem\OneDrive\Documents\TestWorx\packages\lib\src\report-config.ts).

Each field definition supports these shared smart-report keys:
- `fields`
- `repeatableSource`
- `optionProvider`
- `prefill`
- `mappings`
- `calculation`
- `readOnly`
- `validation`

Each report definition can also declare `billableMappings` so finalized reports can auto-populate visit-level billing summaries without bespoke invoice logic in the UI. These mappings support direct field extraction and repeater-row extraction into normalized labor, material, service, and fee items.

Shared dropdown providers live in [packages/lib/src/report-options.ts](C:\Users\Jerem\OneDrive\Documents\TestWorx\packages\lib\src\report-options.ts).

Shared calculation helpers live in [packages/lib/src/report-calculations.ts](C:\Users\Jerem\OneDrive\Documents\TestWorx\packages\lib\src\report-calculations.ts).

The report engine resolves smart metadata in this order:
1. `optionProvider`
2. `prefill`
3. `mappings`
4. `calculation`
5. `validation`

The technician editor and PDF renderer consume the same resolved template model, so new report types should not require report-specific UI components or PDF-specific schema wiring.

## Adding a new report type

1. Add the new report definition to [packages/lib/src/report-config.ts](C:\Users\Jerem\OneDrive\Documents\TestWorx\packages\lib\src\report-config.ts).
2. Reuse an existing `optionProvider` from [packages/lib/src/report-options.ts](C:\Users\Jerem\OneDrive\Documents\TestWorx\packages\lib\src\report-options.ts), or add a new one if the dropdown values are shared.
3. Reuse an existing `calculation` helper from [packages/lib/src/report-calculations.ts](C:\Users\Jerem\OneDrive\Documents\TestWorx\packages\lib\src\report-calculations.ts), or add a new one if the value should be derived automatically.
4. Use `prefill`, `mappings`, `readOnly`, and `validation` directly on field definitions instead of adding UI-specific logic.
5. If the report should generate invoice-ready usage, add `billableMappings` to the same config so finalized inspections can flow into `/app/admin/billing`.
6. Run:

```bash
npm run test
npm run lint
npm run build
```

Example pattern:

```ts
example_system: {
  label: "Example system",
  description: "Example inspection type added through configuration only.",
  sections: [
    {
      id: "inventory",
      label: "Inventory",
      description: "Track connected assets and calculated totals.",
      fields: [
        {
          id: "devices",
          label: "Devices",
          type: "repeater",
          repeatableSource: "siteAssets",
          rowIdentityField: "assetId",
          validation: [{ type: "minRows", value: 1, message: "Add at least one device." }],
          rowFields: [
            { id: "assetId", label: "Linked asset", type: "select", optionProvider: "assetSelect" },
            { id: "deviceType", label: "Device type", type: "select", optionProvider: "alarmDeviceTypes" },
            { id: "location", label: "Location", type: "text", prefill: [{ source: "assetMetadata", key: "location" }] }
          ]
        },
        {
          id: "deviceCount",
          label: "Devices inspected",
          type: "number",
          calculation: { key: "assetCountFromRepeater", sourceFieldId: "devices" },
          readOnly: true
        }
      ]
    }
  ]
}
```

## Local validation flow

1. `npm install`
2. `npm run db:generate`
3. `npm run db:status`
4. `npm run db:migrate`
5. `npm run db:seed`
6. `npm run db:verify`
7. `npm run dev --workspace @testworx/web`
8. `curl http://localhost:3000/api/health`
9. `npm run test`
10. `npm run test:db`
11. `npm run lint`
12. `npm run build`
13. `npm run validate:release`

For Stripe webhook testing locally, use the Stripe CLI to forward events to `http://localhost:3000/api/stripe/webhook` and set the resulting secret in `STRIPE_WEBHOOK_SECRET`.

## Stripe validation

Required Stripe env vars:
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PROFESSIONAL`
- `STRIPE_PRICE_ENTERPRISE`

Local Stripe CLI flow:

1. Start the app:

```bash
npm run dev --workspace @testworx/web
```

2. In another terminal, start webhook forwarding:

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

3. Copy the reported webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

4. Trigger checkout from the tenant-admin billing page, or trigger events manually:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
```

Events that should be tested:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

What to verify:
- duplicate deliveries do not create duplicate state changes
- retried failed deliveries process cleanly once and then stay idempotent
- older subscription events do not overwrite newer persisted tenant billing state
- tenant `subscriptionPlanId`, Stripe ids, status, and entitlement-gated features stay aligned
- `/api/stripe/webhook` returns `duplicate: true` for already-processed deliveries and `ignored: true` for stale out-of-order subscription events

Suggested local verification checklist:

1. Confirm `npm run db:migrate` and `npm run db:seed` succeeded.
2. Log in as `tenantadmin@evergreenfire.com`.
3. Open the billing settings page.
4. Start `stripe listen --forward-to http://localhost:3000/api/stripe/webhook`.
5. Complete a checkout flow or trigger `checkout.session.completed`.
6. Trigger `customer.subscription.updated` for the same subscription and confirm tenant plan/status fields update.
7. Re-send the same event from the Stripe CLI or Dashboard and confirm it is treated as a duplicate.
8. Send an older `customer.subscription.updated` payload after a newer one and confirm the older event is ignored.
9. Trigger `customer.subscription.deleted` and confirm gated entitlements are disabled.
10. Confirm advanced recurrence or uploaded inspection PDFs are blocked again when the persisted subscription state is no longer active.

Deployed test environment checklist:

1. Set all Stripe env vars in Vercel.
2. Point a Stripe test webhook endpoint at `https://<your-domain>/api/stripe/webhook`.
3. Repeat the same four event checks against the deployed environment.
4. Confirm webhook retries in the Stripe Dashboard do not corrupt tenant billing state.
5. Confirm billing settings still load and that gated features reflect the persisted tenant subscription state.

## Commands

- `npm run dev --workspace @testworx/web`
- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run test:db`
- `npm run validate:release`
- `npm run db:generate`
- `npm run db:status`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run db:verify`
- `npm run db:bootstrap`

## Troubleshooting

- If auth fails locally, confirm `AUTH_SECRET`, `NEXTAUTH_URL`, and `APP_URL` are set and restart the dev server.
- If Prisma types drift after schema changes, rerun `npm run db:generate`.
- If seeded users cannot log in, rerun `npm run db:migrate` and `npm run db:seed` against a clean database.
- If `npm run db:verify` fails on plan or user counts, rerun `npm run db:seed` against the same database and confirm `DATABASE_URL` points to the seeded instance.
- If `npm run db:verify` says Prisma migration metadata was not found, run `npm run db:migrate` first.
- If Prisma migrate/seed/verify commands warn that `DATABASE_URL` looks pooled, switch to your provider's direct PostgreSQL connection string before retrying.
- If `npm run test:db` skips everything, confirm the command is using an environment with `DATABASE_URL` set.
- If `npm run test:db` fails with `spawn EPERM` on Windows, retry on a normal local shell or CI runner outside restricted sandboxing. The repo now uses `packages/lib/vitest.config.mjs` to avoid TypeScript config transpilation during startup, but locked-down runners can still block Vitest child-process startup.
- Stripe checkout requires all Stripe env vars; partial config leaves the billing UI visible but disables actions.
- Stripe subscription state will not sync until webhooks are pointed at `/api/stripe/webhook` with the correct `STRIPE_WEBHOOK_SECRET`.
- Private media downloads require `BLOB_READ_WRITE_TOKEN` when `STORAGE_DRIVER=vercel_blob`.
- `GET /api/health` returns a 503 with the exact env or database readiness issue when local setup is incomplete.

## Deployment notes

- Set the root project directory to `apps/web` in Vercel or use monorepo auto-detection.
- Configure all required env vars in Vercel.
- Run `npm run db:migrate` before serving production traffic.
- Run `npm run db:verify` in staging or pre-release smoke tests to confirm migrations and seed-style expectations for the target environment.
- Wire Stripe webhooks to your deployed app before treating billing as production-ready.
- Replace the demo storage abstraction with durable object storage for PDFs, photos, and signatures.

## Production deployment checklist

1. Set `DATABASE_URL` to a managed PostgreSQL instance.
2. Set `STORAGE_DRIVER=vercel_blob` and provide `BLOB_READ_WRITE_TOKEN`.
3. Configure all Stripe env vars, including the correct live `STRIPE_WEBHOOK_SECRET`.
4. Point Stripe webhooks at `https://<your-domain>/api/stripe/webhook`.
5. Run `npm run db:generate` and `npm run db:migrate` before serving traffic.
6. Run `npm run db:seed` only in non-production/demo environments.
7. Use `npm run db:bootstrap:pilot` on a fresh live database to create the first real tenant and users.
8. Verify `npm run db:verify`, `npm run test`, `npm run test:db`, `npm run lint`, and `npm run build` on the release candidate environment.
9. Validate technician claim, report autosave, report finalization, customer PDF download, and Stripe plan sync against the deployed environment.

## Verification checklists

### Postgres

Local:

1. `Copy-Item .env.example .env`
2. Set `DATABASE_URL` to a reachable PostgreSQL database.
3. `npm install`
4. `npm run db:generate`
5. `npm run db:status`
6. `npm run db:migrate`
7. `npm run db:seed`
8. `npm run db:verify`
9. `npm run test:db`
10. `curl http://localhost:3000/api/health`

Hosted Postgres recovery:

1. Use the provider's direct connection string, not the pooled string.
2. If `migrate` reports `P3009`, resolve the failed migration first:
   `node .\packages\db\scripts\run-prisma.cjs migrate resolve --rolled-back <migration_name> --schema .\prisma\schema.prisma`
3. Re-run `npm run db:migrate`.
4. Re-run `npm run db:seed`.
5. Re-run `npm run db:verify`.

Staging:

1. Set the staging `DATABASE_URL`.
2. Run `npm run db:generate`.
3. Run `npm run db:migrate`.
4. Run `npm run db:verify`.
5. Run `npm run test`, `npm run test:db`, `npm run lint`, and `npm run build` on the release candidate.

### Stripe webhooks

Local:

1. Set all Stripe env vars in `.env`.
2. Run `npm run dev --workspace @testworx/web`.
3. Run `stripe listen --forward-to http://localhost:3000/api/stripe/webhook`.
4. Copy the printed signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Trigger:
   - `stripe trigger checkout.session.completed`
   - `stripe trigger customer.subscription.created`
   - `stripe trigger customer.subscription.updated`
   - `stripe trigger customer.subscription.deleted`
6. Confirm duplicate or replayed events do not corrupt tenant plan state.

Staging:

1. Set all Stripe env vars in Vercel.
2. Point a Stripe test webhook endpoint at `https://<your-domain>/api/stripe/webhook`.
3. Replay the same four event types from the Stripe Dashboard or CLI.
4. Confirm persisted tenant entitlements change only when the latest valid subscription event is processed.

### Blob/object storage

Local or staging:

1. Set `STORAGE_DRIVER=vercel_blob`.
2. Set `BLOB_READ_WRITE_TOKEN`.
3. Save a report draft with at least one photo and both signatures.
4. Refresh the report editor and confirm private media still loads.
5. Finalize the report and download the generated PDF.
6. Upload an inspection PDF as an office admin.
7. Confirm customer users can access only customer-visible PDFs.
8. Confirm customer users cannot access `/api/reports/storage`.
9. Confirm cross-tenant attachment URLs return `403`.

## Amendment management

- `/app/admin/amendments` provides a tenant-scoped amendment center for dispatch and office teams.
- Filters include `original`, `amended`, `replacement`, and `superseded`.
- Each row shows linked inspection navigation, amendment reason, timestamps, and the latest amendment-related audit metadata.
- Started inspections still cannot be destructively edited. Replacement visits remain the audited path forward.

## Postgres verification

For a real local confidence pass with PostgreSQL running locally:

```bash
Copy-Item .env.example .env
npm install
npm run db:generate
npm run db:status
npm run db:migrate
npm run db:seed
npm run db:verify
npm run dev --workspace @testworx/web
curl http://localhost:3000/api/health
npm run test
npm run test:db
npm run lint
npm run build
```

If you are validating Stripe locally, run the Stripe CLI and forward events to:

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```
