# Technician finalization queue hotfix

A conflicted job-time event previously returned from the entire device sync pass.
Likewise, a failed write stopped processing every later job. Valid finalizations
could remain pending without ever reaching the server.

Queue dependencies are now grouped by inspection, using the queued inspection ID
or the local report/material record. A conflict or failed attempt blocks dependent
writes for that inspection, not unrelated inspections. Failed records remain on
the device for retry or office review. No saved drafts are erased. Superseded
autosaves are removed only when the report already has a pending/complete
finalization containing the full draft, preserving the existing behavior.

Same-job material conflicts still prevent finalization. Job starts and pauses
retain their ordering and server-side permission/time checks. Server finalization,
PDF generation, billing, report validation and signatures are unchanged.

Verification:

```sh
node scripts/check-report-finalize-sync.cjs
node scripts/check-job-time.cjs
```

Browser regressions cover stale clock conflicts, failed saves on unrelated jobs,
same-job material conflicts, in-flight autosaves, validation correction retries,
offline finalization, job timing, and absence of page errors.
