# Inspection report presentation audit

## Release status

Working branch: `codex/report-presentation-upgrade`. Do not treat artifact generation as completion of the requested end-to-end visual/customer-delivery acceptance review. No production records, signed PDFs, uploaded originals, or tenant settings were modified during this audit. No database migration is required.

## Inventory

All registered inspection types enter `generateInspectionReportPdf` in `packages/lib/src/pdf-report.ts`. All currently resolve to PDF v2; the legacy code below that dispatch is not selected for any currently registered type. Joint Commission and acceptance-test variants are separate registered types, not alternate tenant templates.

| Type / variant | Active renderer | Fixture output stem |
| --- | --- | --- |
| Fire extinguisher | pdf-lib, configured inventory/service tables | fire_extinguisher |
| Fire alarm | React HTML / Chromium | fire_alarm |
| Joint Commission fire alarm | pdf-lib, report definitions | joint_commission_fire_alarm |
| Wet chemical acceptance test | React HTML / Chromium | wet_chemical_acceptance_test |
| Wet fire sprinkler | pdf-lib, report definitions | wet_fire_sprinkler |
| Joint Commission fire sprinkler | pdf-lib, configured EP tables | joint_commission_fire_sprinkler |
| Work order | pdf-lib, report definitions | work_order |
| Backflow | pdf-lib, report definitions | backflow |
| Fire pump | pdf-lib, report definitions | fire_pump |
| Dry fire sprinkler | pdf-lib, report definitions | dry_fire_sprinkler |
| Kitchen suppression | pdf-lib, configured system/hood/appliance tables | kitchen_suppression |
| Industrial suppression | pdf-lib, configured checklists plus definition details | industrial_suppression |
| Vehicle suppression | pdf-lib, report definitions | vehicle_suppression |
| Emergency / exit lighting | pdf-lib, report definitions | emergency_exit_lighting |

Each stem has `-short-alpha`, `-long-alpha`, `-short-beta`, `-long-beta`, `-short-none`, and `-long-none` PDFs and saved input JSON under `output/pdf/report-upgrade/verified/`. Alpha is a transparent wide blue logo; Beta is a transparent tall burgundy logo; `none` tests the company-name fallback. Long fixtures contain repeated equipment, extended findings, two photos and both signatures. These are synthetic companies, not two authenticated subscriber workspaces.

## Generation and delivery paths

- Finalization and explicit administrative regeneration call `replaceGeneratedReportPdfTx` in `report-service.ts`, which resolves the report's tenant branding, saved draft, site, photos and signatures and stores a generated attachment.
- Admin inspection details, technician PDF access, billing's embedded review panel and customer packet links retrieve `/api/attachments/[attachmentId]`; `?disposition=inline` serves the same stored PDF inline. Browser print operates on that PDF. Downloads no longer automatically replace a previously issued PDF merely because its renderer version or filename is old.
- Missing-blob recovery and the existing explicit regeneration/correction workflow remain unchanged. Explicit regeneration is still a deliberate replacement workflow, not an automatic migration of issued PDFs.
- Uploaded PDFs and their original/annotated/signed variants use `/api/inspection-documents/[documentId]`. This upgrade does not edit those originals or their signing workflow.
- The customer hosted report at `/app/customer/reports/[reportId]` is a separate HTML view built with `buildReportPreview`; acceptance tests have a specialized hosted view. PDF links in its packet use the stored attachment route above. This change does not redesign the hosted HTML view.
- No separate automatic inspection-report email renderer was found. Quote email PDFs and QuickBooks invoice delivery are separate products and were not changed. Actual email/share delivery of inspection PDFs was not exercised.

## Changes

- Prominent proportional first-page logos (180pt / 2.5in maximum width in pdf-lib, 2.5in HTML logo box); smaller continuation branding and actual physical-page counts.
- Wrapped table headings, normalized column widths and item-scoped details for wide equipment records instead of the former six-column truncation.
- Removed the six-field system-summary cap; long metadata uses paginating key/value tables rather than clipped fixed-height cells.
- Retained No, N/A and zero; preserved free-text punctuation in default definition-backed fields.
- Kept calendar-only inspection/equipment dates on their recorded day rather than shifting them through a local timezone; timestamp formatting remains timezone-aware.
- Included additional fire-alarm battery results under their individual control panel, missing industrial details, extinguisher dates, kitchen coverage notes, section notes and corrective-action notes.
- Kept table headings with their first row, repeated headings across pages, added continuation item context, kept photo headings with photo cards and allowed signer names to wrap above their signature image.
- Removed another company's hard-coded acceptance-test contact/location/license fallbacks.
- Removed automatic download-time replacement of existing issued PDFs. Existing tenant/role checks remain in place.

## Reproducing the artifact audit

1. Set `PDF_AUDIT_DIR` to a local output directory and `PDF_AUDIT_MEDIA` to a directory containing `alpha.png`, `beta.png`, `photo.png`, and `signature.png`.
2. Run `npm run test --workspace @testworx/lib -- src/__tests__/report-output-audit.test.ts --maxWorkers=1`.
3. Run `scripts/report-pdf-audit.py output/pdf/report-upgrade --batch=verified` with Python, PyMuPDF and Pillow installed. The script creates synthetic media, renders every physical page, extracts text, creates 12-page contact sheets, and writes `render-summary.json` with boundary and recorded-text comparison candidates.
4. Inspect every page at readable resolution and reconcile text candidates against the definition's hidden/conditional fields. Automated page-boundary checks do not detect all overlaps, semantic errors or missing images.

## Verification and remaining acceptance work

- The full library suite passed: 805 tests, 42 skipped (including opt-in PDF artifacts and database integration tests).
- A complete 84-document fixture generation matrix passed. The test asserts that PDF generation does not mutate its input record.
- Production build and web lint passed during implementation. Targeted PDF, branding, attachment authorization, portal access, finalization and smart-report regressions were included in the suite.
- Every fixture page has a reproducible render path. Representative sheets/pages were visually reviewed and issues found were corrected. This is not a claim that every page of all 84 final documents has received full-resolution human-equivalent visual review.
- Still required before production release: complete the final visual review, numeric/enum/item-by-item saved-data reconciliation beyond text-marker checks, real authenticated preview/download/print checks, and emailed/shared-copy checks for two isolated subscriber companies. Database integration tests and seed execution were not run against the production-connected environment.
- This branch has not been merged into main or deployed to production. Merge only after those acceptance checks pass. Rollback is a code revert; no data rollback is needed because the audit did not migrate stored reports.

## Representative artifacts

- Baseline: `output/pdf/report-upgrade/before/work_order-short.pdf`.
- Updated no-logo comparison: `output/pdf/report-upgrade/verified/work_order-short-none.pdf`.
- Branded sample: `output/pdf/report-upgrade/verified/fire_extinguisher-short-alpha.pdf`.
- Alternate tall-logo sample: `output/pdf/report-upgrade/verified/wet_chemical_acceptance_test-short-beta.pdf`.

The baseline was generated before the presentation edits. Fixture branding/contact strings differ between baseline and branded samples; these are layout demonstrations, not a claim of pixel-identical controlled input in every before/after pair.
