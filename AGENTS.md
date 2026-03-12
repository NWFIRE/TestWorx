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
