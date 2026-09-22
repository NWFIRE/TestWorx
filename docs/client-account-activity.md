# Client account activity

Inspection activity uses a separate tenant/customer-scoped query ordered by `updatedAt`, not the scheduled date or the schedule-limited history preview. Cards say the inspection was updated and show its current status. Future-dated activity timestamps are excluded. Upcoming inspection dates remain in inspection history.

Service descriptions use the shared inspection task summary: repeated default types appear once with a count, while custom labels remain visible. This is presentation only; tasks, reports, and schedules are never deleted or merged.

Regression coverage: `npm run test --workspace @testworx/lib -- src/__tests__/client-profile.test.ts`.

## Data anomaly requiring separate review

A read-only production review on September 22, 2026 found Timberlake Public School inspection `5GUNZCU1` has 1,454 tasks: 1,446 kitchen suppression, 6 fire alarm, and 2 fire extinguisher. All tasks have linked reports and their service schedules reference the same customer/site as the inspection. The last inspection update was June 3, 2026, while its scheduled date is April 1, 2027. This patch does not repair or delete those records; report contents and scheduling history must be reviewed before any cleanup.
