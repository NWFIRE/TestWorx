# Fire Inspection SaaS – Agent Instructions

## Mission
Build a production-quality multi-tenant fire inspection SaaS for inspection companies, similar in workflow quality to ServiceTrade or ServiceTitan, with a strong mobile field experience and a polished customer portal.

## Required stack
- Next.js latest stable App Router
- TypeScript throughout
- PostgreSQL
- Prisma ORM
- NextAuth or equivalent secure auth/session layer
- Stripe subscriptions
- Tailwind CSS
- Server-side PDF generation
- Object storage abstraction for photos, signatures, PDFs, and uploaded attachments
- Vercel-ready deployment

## Product surfaces
1. Platform admin area
2. Tenant admin / office admin web app
3. Technician mobile-first field app
4. Customer portal

## User roles
- platform_admin
- tenant_admin
- office_admin
- technician
- customer_user

## Core requirements
- Strict multi-tenant data isolation
- Clean, modern, professional UI
- Mobile-first technician workflow optimized for iPad and iPhone
- Recurring scheduling by inspection type
- Assigned and unassigned inspections
- Unassigned inspections can be claimed by any technician with access
- Reports auto-save frequently to prevent data loss
- Reports support technician and customer signatures
- Reports support photo attachments
- Reports support uploaded PDF attachments
- Completed reports render to professional PDF with tenant branding
- Customer portal supports downloadable reports and signed PDFs
- Tenant admins can configure branding (logo, colors, business details)
- Billing supports monthly recurring subscriptions via Stripe
- Demo seed data must exist for a realistic walkthrough

## Inspection types to support
- fire_extinguisher
- fire_alarm
- wet_fire_sprinkler
- backflow
- fire_pump
- dry_fire_sprinkler
- kitchen_suppression
- industrial_suppression
- emergency_exit_lighting

## Architecture rules
- Use a modular monorepo structure
- Keep business logic separated from UI components
- Prefer reusable report engine patterns over one-off hardcoded forms
- All tenant-scoped queries and mutations must enforce tenant boundaries
- Every schema change must include a migration
- Every important feature must include tests
- Seed scripts must keep working
- Do not introduce breaking auth or schema changes without updating seeds and tests

## Smart inspection report architecture

All inspection report types in this product must use a shared smart-report system rather than one-off hardcoded form logic.

This is a global requirement across:
- fire_extinguisher
- fire_alarm
- wet_fire_sprinkler
- backflow
- fire_pump
- dry_fire_sprinkler
- kitchen_suppression
- industrial_suppression
- emergency_exit_lighting
- any future inspection report types
- 
## Report definition implementation rule

All inspection report types must be implemented through the shared report-definition system.

Codex must not build bespoke report screens or report-specific form logic unless absolutely necessary.

Every report type must be defined using:
- fields
- repeatableSource
- optionProvider
- prefill
- mappings
- calculation
- readOnly
- validation

Shared dropdown options must be defined in:
- packages/lib/src/report-options.ts

Shared calculation helpers must be defined in:
- packages/lib/src/report-calculations.ts

Report-specific structure must be defined in:
- packages/lib/src/report-config.ts

When implementing a new report type, Codex should:
1. add or extend the report definition in report-config.ts
2. reuse an existing optionProvider when possible
3. reuse an existing calculation helper when possible
4. add new providers/helpers only when needed
5. avoid hardcoding report-specific UI logic if the shared engine can support it
6. preserve autosave, preview, finalization, PDF rendering, and customer portal compatibility

A report implementation is not complete unless it works through the shared engine and not just through ad hoc UI code.
### Core rule
Every report type must be implemented using reusable report-engine patterns that support:
- prefilled dropdowns
- auto-populated fields
- smart defaults
- carry-forward data from prior inspections where appropriate
- asset-linked field population where appropriate
- configurable mappings and option lists
- repeatable entry rows where appropriate
- tenant-safe persistence
- autosave
- preview
- finalization
- PDF rendering
- customer portal rendering

### Smart field behavior requirements
For all report types, Codex must prefer a reusable smart-field architecture with support for:

1. Prefilled options
- common dropdown values should be defined in reusable config/constants files or report-type configuration modules
- examples include manufacturer lists, equipment sizes/types, service actions, statuses, deficiency categories, etc.

2. Auto-population
- fields should auto-populate when another field selection logically determines a value
- examples:
  - extinguisher size/type -> UL rating
  - equipment type -> expected service interval
  - report type + recurrence -> next due logic
  - prior inspection asset record -> location/manufacturer/model/serial defaults

3. Carry-forward defaults
- when editing a new inspection for an existing site/asset, the system should prefill known prior values where appropriate
- examples:
  - asset location
  - manufacturer
  - model
  - serial number
  - prior service dates
  - recurring inspection intervals
  - known equipment metadata

4. Calculated fields
- when a field can be derived safely, Codex should implement calculation logic in reusable services
- examples:
  - next hydro date from last hydro date
  - next 6-year date from last 6-year date
  - due dates based on recurrence
  - compliance flags based on entered dates/statuses

5. Controlled override support
- if a field is auto-populated, the implementation may support manual override when appropriate, but the architecture must preserve traceability and consistency

### Report implementation rule
When implementing or modifying any report type, Codex must not build isolated bespoke logic unless absolutely necessary.

Instead, Codex should:
- first look for shared report engine extension points
- add reusable smart-field configuration where possible
- add reusable mapping/config support where possible
- keep report-type specifics in config/schema modules, not buried directly in UI components
- design new report features so future report types can reuse them

### Required shared architecture
Codex should evolve the codebase toward a report system with reusable concepts such as:
- report definitions / report schemas
- field definitions
- smart default providers
- option list providers
- mapping providers
- carry-forward / prior-inspection hydrators
- calculated field helpers
- validation rules
- PDF render adapters

Names can vary by implementation, but the architecture must support these concepts cleanly.

### Data-source priority for smart prefill
When pre-filling report fields, use this priority where applicable:
1. current asset/equipment record
2. prior completed inspection data for the same asset/site
3. customer/site defaults
4. report-type defaults
5. empty field

### Tenant safety rule
All smart prefill and auto-population must preserve strict tenant isolation.
No tenant may ever receive defaults, options, assets, history, or data derived from another tenant.

### UX rule
Smart behavior must reduce technician/admin typing, not create confusion.
Therefore:
- auto-populated values should be visible
- calculated values should be understandable
- overrides should be deliberate
- mobile usability must remain strong
- autosave must preserve smart-field behavior

### Future-proofing rule
Whenever Codex adds smart behavior to one report type, it should implement it in a way that can be reused by future report types with minimal rewrites.

### Done criteria for report work
A report-type implementation is not complete unless it supports, where applicable:
- reusable field definitions
- smart defaults
- auto-population rules
- persistence
- autosave
- preview
- finalization
- PDF output
- customer portal visibility
- tests for smart behavior
## Suggested repo structure
/apps
  /web
/packages
  /db
  /ui
  /types
  /lib

## Data model expectations
Implement and evolve models for:
- Tenant
- SubscriptionPlan
- User
- CustomerCompany
- Site
- Asset
- Inspection
- InspectionReport
- InspectionRecurrence
- Attachment
- Signature
- Deficiency
- AuditLog

## Scheduling expectations
- Office admin can create an inspection for a site
- Office admin can attach one or more report types to a single inspection
- Each report type can have its own recurrence frequency
- Inspections can be assigned to a specific technician
- If unassigned, inspection is visible to eligible technicians and claimable
- Monthly dashboard for technicians must be first-class

## Report engine expectations
- Structured sections
- Smart defaults and auto-population from prior inspections and site/asset data
- Pass/fail/deficiency flows
- Photos
- Notes
- Signatures
- Preview before finalization
- Auto-save drafts
- Professional PDF output

## AI feature expectations
Add AI-assisted helpers where useful, behind clear service boundaries:
- suggested deficiency wording
- inspection summary generation
- recommended follow-up service suggestions
- smart auto-population from prior reports and asset history

## UX expectations
- Technician UI must be touch-friendly
- Large tap targets
- Fast loading
- Minimal clutter
- Clear save state indicators
- Warning before leaving unsaved work if sync is pending
- Admin scheduling views must be practical and readable
- Customer portal must look polished and trustworthy

## Quality bar
A task is only complete when:
- app builds successfully
- lint passes
- tests pass
- migrations are included if needed
- seed data works
- docs are updated if behavior changes
- implementation is Vercel-ready

## Working style
- Make small, reviewable commits
- Explain tradeoffs briefly in PR notes or task summary
- When uncertain, inspect the existing codebase before making assumptions
- Prefer incremental delivery over giant rewrites
- Preserve production realism and maintainability
